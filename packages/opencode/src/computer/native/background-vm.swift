import AppKit
import Virtualization

// This manager owns only its dedicated VM directory. No host directories are shared.
struct MachineRecord: Codable {
    let cpu: Int
    let memory: UInt64
    let hardware: Data
    let identity: Data
    var installed: Bool
}
struct Resources {
    static let gib: UInt64 = 1 << 30
    static func plan(hostMemory: UInt64, hostCPU: Int, minimumMemory: UInt64, minimumCPU: Int) throws -> (Int, UInt64) {
        let memory = max(minimumMemory, min(8 * gib, hostMemory / 3))
        let cpu = max(minimumCPU, min(4, hostCPU / 2))
        guard memory <= hostMemory / 2, cpu < hostCPU else {
            throw NSError(domain: "OliveCode", code: 1, userInfo: [NSLocalizedDescriptionKey: "This Mac needs more free resources for a separate macOS VM. Use a second Mac instead."])
        }
        return (cpu, memory)
    }
}

@MainActor
final class Manager: NSObject, NSApplicationDelegate, NSWindowDelegate, @preconcurrency VZVirtualMachineDelegate {
    let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("OliveCode/Background Mac", isDirectory: true)
    var window: NSWindow!
    var screen: NSWindow?
    var machine: VZVirtualMachine?
    var installer: VZMacOSInstaller?
    var operation: Task<Void, Never>?
    var progressObservation: NSKeyValueObservation?
    var download: URLSessionDownloadTask?
    var downloadTimer: Timer?
    var lock: Int32 = -1
    var ownsLock = false
    let status = NSTextField(wrappingLabelWithString: "Your apps. A separate Mac.")
    let detail = NSTextField(wrappingLabelWithString: "Run Mac apps away from your main desktop. Create a private macOS virtual machine, then connect it to OliveCode.")
    let progress = NSProgressIndicator()
    let create = NSButton(title: "Create background Mac", target: nil, action: nil)
    let start = NSButton(title: "Start Mac", target: nil, action: nil)
    let stop = NSButton(title: "Shut down", target: nil, action: nil)
    let show = NSButton(title: "Show screen", target: nil, action: nil)
    let cancel = NSButton(title: "Cancel installation", target: nil, action: nil)
    var recordURL: URL { root.appendingPathComponent("machine.json") }
    var busy = false
    var installing = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        do {
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            lock = open(root.appendingPathComponent("manager.lock").path, O_CREAT | O_RDWR, 0o600)
            guard lock >= 0, flock(lock, LOCK_EX | LOCK_NB) == 0 else {
                throw failure("Another Background Mac manager is already open. Use that window.")
            }
            ownsLock = true
            if FileManager.default.fileExists(atPath: recordURL.path) {
                let record = try readRecord()
                status.stringValue = record.installed ? "Your background Mac is ready to start." : "Installation is unfinished. Resume with the downloaded restore image."
                detail.stringValue = "\(record.memory / Resources.gib) GB memory · \(record.cpu) CPU cores · up to 80 GB disk. Finish macOS setup in Show screen, then follow the connection guide."
            } else {
                detail.stringValue += " Requires Apple silicon. macOS is a large download; the virtual disk can grow to 80 GB. Your host files are never shared automatically."
            }
        } catch { fail(error); create.isEnabled = false }
        refresh()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    func failure(_ text: String) -> NSError { NSError(domain: "OliveCode", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
    func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 520), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "OliveCode · Background Mac"
        window.center(); window.delegate = self
        let title = NSTextField(labelWithString: "◕  Background Mac")
        title.font = .systemFont(ofSize: 28, weight: .semibold)
        title.textColor = NSColor(calibratedRed: 0.40, green: 0.70, blue: 0.49, alpha: 1)
        status.font = .systemFont(ofSize: 17, weight: .medium)
        detail.textColor = .secondaryLabelColor
        progress.isIndeterminate = true; progress.style = .bar; progress.isHidden = true
        let buttons = NSStackView(views: [start, show, stop]); buttons.orientation = .horizontal; buttons.spacing = 12
        for (button, selector) in [(create, #selector(createMac)), (start, #selector(startMac)), (stop, #selector(stopMac)), (show, #selector(showScreen)), (cancel, #selector(cancelInstall))] {
            button.target = self; button.action = selector; button.bezelStyle = .rounded
        }
        let guide = NSButton(title: "Connection guide", target: self, action: #selector(openGuide)); guide.bezelStyle = .rounded
        let folder = NSButton(title: "Open VM folder", target: self, action: #selector(openFolder)); folder.bezelStyle = .rounded
        let links = NSStackView(views: [guide, folder]); links.spacing = 12
        let note = NSTextField(wrappingLabelWithString: "Hide the screen to keep working on your Mac. Closing this manager shuts down the VM; OliveCode’s Stop button ends agent control separately.")
        note.textColor = .secondaryLabelColor; note.font = .systemFont(ofSize: 12)
        let stack = NSStackView(views: [title, status, detail, progress, create, cancel, buttons, links, note])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 30), stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -30), stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 30), detail.widthAnchor.constraint(equalTo: stack.widthAnchor), note.widthAnchor.constraint(equalTo: stack.widthAnchor), progress.widthAnchor.constraint(equalTo: stack.widthAnchor)])
    }
    func readRecord() throws -> MachineRecord { try JSONDecoder().decode(MachineRecord.self, from: Data(contentsOf: recordURL)) }
    func save(_ record: MachineRecord) throws { try JSONEncoder().encode(record).write(to: recordURL, options: .atomic) }
    func refresh() {
        let installed = (try? readRecord().installed) == true
        create.isEnabled = ownsLock && !busy && !installed
        create.title = FileManager.default.fileExists(atPath: recordURL.path) ? "Resume installation" : "Create background Mac"
        start.isEnabled = ownsLock && installed && !busy && (machine == nil || machine?.state == .stopped)
        stop.isEnabled = !busy && machine?.canRequestStop == true
        show.isEnabled = machine != nil
        cancel.isHidden = !installing
        progress.isHidden = !busy
    }
    func fail(_ error: Error) {
        busy = false; installing = false; progress.stopAnimation(nil); status.stringValue = "Could not complete this step."
        detail.stringValue = error.localizedDescription
        refresh()
    }
    @objc func createMac() {
        guard ownsLock && !busy else { return }
        if !FileManager.default.fileExists(atPath: recordURL.path) {
            let alert = NSAlert(); alert.messageText = "Create a separate Mac?"
            alert.informativeText = "Downloads macOS from Apple and creates an 80 GB expandable disk. Installation may take a while. No files from your Mac are shared."
            alert.addButton(withTitle: "Create Mac"); alert.addButton(withTitle: "Cancel")
            guard alert.runModal() == .alertFirstButtonReturn else { return }
        }
        busy = true; installing = true; refresh(); progress.startAnimation(nil)
        operation = Task { @MainActor [self] in
            do {
                let imageURL = root.appendingPathComponent("restore.ipsw")
                if !FileManager.default.fileExists(atPath: imageURL.path) {
                    let available = try root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage ?? 0
                    guard available >= Int64(30 * Resources.gib) else { throw failure("Keep at least 30 GB available for the macOS download and installation. The guest disk can grow to 80 GB later.") }
                    status.stringValue = "Finding macOS for this Mac…"
                    let image = try await VZMacOSRestoreImage.latestSupported
                    try Task.checkCancellation()
                    guard image.url.scheme == "https" else { throw failure("Apple did not return a secure restore image URL.") }
                    status.stringValue = "Downloading macOS from Apple…"
                    let location = try await fetch(image.url)
                    downloadTimer?.invalidate(); downloadTimer = nil; download = nil
                    do {
                        try Task.checkCancellation()
                        try FileManager.default.moveItem(at: location, to: imageURL)
                    } catch {
                        try? FileManager.default.removeItem(at: location)
                        throw error
                    }
                }
                status.stringValue = "Preparing the separate Mac…"
                let image: VZMacOSRestoreImage = try await withCheckedThrowingContinuation { continuation in
                    VZMacOSRestoreImage.load(from: imageURL) { continuation.resume(with: $0) }
                }
                try Task.checkCancellation()
                guard let requirements = image.mostFeaturefulSupportedConfiguration else { throw failure("This macOS restore image is not supported on your Mac.") }
                if !FileManager.default.fileExists(atPath: recordURL.path) {
                    let (cpu, memory) = try Resources.plan(hostMemory: ProcessInfo.processInfo.physicalMemory, hostCPU: ProcessInfo.processInfo.processorCount, minimumMemory: requirements.minimumSupportedMemorySize, minimumCPU: requirements.minimumSupportedCPUCount)
                    let diskURL = root.appendingPathComponent("disk.img")
                    let auxiliaryURL = root.appendingPathComponent("auxiliary")
                    guard !FileManager.default.fileExists(atPath: diskURL.path), !FileManager.default.fileExists(atPath: auxiliaryURL.path) else { throw failure("An existing disk was found. It will not be overwritten. Check the VM folder.") }
                    let fd = open(diskURL.path, O_CREAT | O_EXCL | O_RDWR, 0o600)
                    guard fd >= 0 else { throw failure("Could not create the VM disk.") }
                    let result = ftruncate(fd, off_t(80 * Resources.gib)); close(fd)
                    var createdAuxiliary = false
                    do {
                        guard result == 0 else { throw failure("Could not allocate the expandable VM disk.") }
                        _ = try VZMacAuxiliaryStorage(creatingStorageAt: auxiliaryURL, hardwareModel: requirements.hardwareModel, options: [])
                        createdAuxiliary = true
                        try save(MachineRecord(cpu: cpu, memory: memory, hardware: requirements.hardwareModel.dataRepresentation, identity: VZMacMachineIdentifier().dataRepresentation, installed: false))
                    } catch {
                        // Roll back only files created in this attempt, never an existing guest.
                        try? FileManager.default.removeItem(at: diskURL)
                        if createdAuxiliary { try? FileManager.default.removeItem(at: auxiliaryURL) }
                        throw error
                    }
                }
                let vm = try buildMachine(); machine = vm
                let install = VZMacOSInstaller(virtualMachine: vm, restoringFromImageAt: imageURL); installer = install
                progress.isIndeterminate = false; progress.minValue = 0; progress.maxValue = 100
                progressObservation = install.progress.observe(\.fractionCompleted, options: [.new]) { [weak self] value, _ in
                    DispatchQueue.main.async { self?.progress.doubleValue = value.fractionCompleted * 100 }
                }
                status.stringValue = "Installing macOS…"
                try await install.install()
                var record = try readRecord(); record.installed = true; try save(record)
                busy = false; installing = false; installer = nil; progressObservation = nil; refresh()
                status.stringValue = "macOS installed. Start your background Mac."
                detail.stringValue = "Open Show screen to finish the macOS setup assistant. Use Connection guide to enable Remote Login and approve guest permissions."
            } catch {
                installer = nil; progressObservation = nil; machine = nil
                fail(error)
            }
            downloadTimer?.invalidate(); downloadTimer = nil; download = nil; operation = nil
        }
    }
    func fetch(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let task = URLSession.shared.downloadTask(with: url) { temporary, response, error in
                if let error { continuation.resume(throwing: error); return }
                guard let temporary, let response = response as? HTTPURLResponse, response.statusCode == 200 else {
                    continuation.resume(throwing: NSError(domain: "OliveCode", code: 2, userInfo: [NSLocalizedDescriptionKey: "macOS download failed. Try again."])); return
                }
                do {
                    let retained = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".ipsw")
                    try FileManager.default.moveItem(at: temporary, to: retained)
                    continuation.resume(returning: retained)
                } catch { continuation.resume(throwing: error) }
            }
            download = task
            downloadTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self, weak task] _ in
                MainActor.assumeIsolated {
                    guard let self, let task else { return }
                    let total = task.countOfBytesExpectedToReceive
                    if total > 0 {
                        self.progress.isIndeterminate = false
                        self.progress.maxValue = 100
                        self.progress.doubleValue = Double(task.countOfBytesReceived) / Double(total) * 100
                    }
                }
            }
            task.resume()
        }
    }
    func buildMachine() throws -> VZVirtualMachine {
        let record = try readRecord()
        guard let hardware = VZMacHardwareModel(dataRepresentation: record.hardware), hardware.isSupported, let identity = VZMacMachineIdentifier(dataRepresentation: record.identity) else { throw failure("The saved VM configuration is invalid or unsupported.") }
        let platform = VZMacPlatformConfiguration(); platform.hardwareModel = hardware; platform.machineIdentifier = identity
        platform.auxiliaryStorage = VZMacAuxiliaryStorage(contentsOf: root.appendingPathComponent("auxiliary"))
        let config = VZVirtualMachineConfiguration(); config.platform = platform; config.bootLoader = VZMacOSBootLoader()
        config.cpuCount = record.cpu; config.memorySize = record.memory
        config.storageDevices = [VZVirtioBlockDeviceConfiguration(attachment: try VZDiskImageStorageDeviceAttachment(url: root.appendingPathComponent("disk.img"), readOnly: false))]
        let graphics = VZMacGraphicsDeviceConfiguration(); graphics.displays = [VZMacGraphicsDisplayConfiguration(widthInPixels: 1440, heightInPixels: 900, pixelsPerInch: 110)]; config.graphicsDevices = [graphics]
        config.keyboards = [VZMacKeyboardConfiguration()]; config.pointingDevices = [VZMacTrackpadConfiguration()]
        let network = VZVirtioNetworkDeviceConfiguration(); network.attachment = VZNATNetworkDeviceAttachment(); config.networkDevices = [network]
        config.entropyDevices = [VZVirtioEntropyDeviceConfiguration()]
        try config.validate()
        let vm = VZVirtualMachine(configuration: config); vm.delegate = self; return vm
    }
    @objc func startMac() {
        guard ownsLock && !busy else { return }
        do {
            machine = try buildMachine(); busy = true; refresh()
            machine!.start { [weak self] result in
                guard let self else { return }; self.busy = false
                switch result {
                case .success: self.status.stringValue = "Background Mac is running."; self.showScreen(); self.refresh()
                case .failure(let error): self.fail(error)
                }
            }
        } catch { fail(error) }
    }
    @objc func showScreen() {
        guard let machine else { return }
        if screen == nil {
            let view = VZVirtualMachineView(); view.capturesSystemKeys = false
            screen = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 625), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            screen!.title = "OliveCode · Separate Mac screen"; screen!.contentView = view
            screen!.isReleasedWhenClosed = false; screen!.center()
        }
        (screen!.contentView as! VZVirtualMachineView).virtualMachine = machine
        screen!.makeKeyAndOrderFront(nil)
    }
    @objc func stopMac() {
        do { try machine?.requestStop(); status.stringValue = "Asking macOS to shut down…" } catch { fail(error) }
    }
    @objc func cancelInstall() { operation?.cancel(); download?.cancel(); installer?.progress.cancel() }
    @objc func openFolder() { NSWorkspace.shared.open(root) }
    @objc func openGuide() { NSWorkspace.shared.open(root.appendingPathComponent("Connection guide.md")) }
    func guestDidStop(_ virtualMachine: VZVirtualMachine) { status.stringValue = "Background Mac is stopped."; refresh() }
    func virtualMachine(_ virtualMachine: VZVirtualMachine, didStopWithError error: Error) { fail(error) }
    func windowWillClose(_ notification: Notification) {
        if let closed = notification.object as? NSWindow, closed === window { NSApp.terminate(nil) }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard sender === window else { return true }
        if busy || machine?.state == .running {
            let alert = NSAlert(); alert.messageText = "Close Background Mac?"
            alert.informativeText = busy ? "This cancels the current installation. You can resume later." : "The separate Mac will stop. Save any guest documents first. To keep it running, minimize this manager instead."
            alert.addButton(withTitle: "Keep open"); alert.addButton(withTitle: "Close")
            guard alert.runModal() == .alertSecondButtonReturn else { return false }
            cancelInstall()
        }
        return true
    }
}

@main
struct Entry {
    @MainActor static func main() throws {
        if CommandLine.arguments.contains("--self-test") {
            let plan = try Resources.plan(hostMemory: 24 * Resources.gib, hostCPU: 10, minimumMemory: 4 * Resources.gib, minimumCPU: 2)
            precondition(plan.0 == 4 && plan.1 == 8 * Resources.gib)
            do { _ = try Resources.plan(hostMemory: 4 * Resources.gib, hostCPU: 2, minimumMemory: 4 * Resources.gib, minimumCPU: 2); fatalError("insufficient host accepted") } catch {}
            let record = MachineRecord(cpu: 4, memory: plan.1, hardware: Data([1]), identity: Data([2]), installed: false)
            let decoded = try JSONDecoder().decode(MachineRecord.self, from: JSONEncoder().encode(record))
            precondition(decoded.installed == false)
            print("Background Mac self-test passed: resource budget, insufficient-host guard, manifest round trip. No download or VM started.")
            return
        }
        let app = NSApplication.shared; let manager = Manager()
        app.setActivationPolicy(.regular); app.delegate = manager; app.run()
    }
}
