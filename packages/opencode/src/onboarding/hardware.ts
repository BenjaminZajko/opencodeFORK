import os from "os"
import { statfsSync } from "node:fs"

// Robust hardware detection. Port of OliveCode advisor/hardware.py.
//
// Design contract (same as the original): detection NEVER raises. Every
// probe degrades to a safe default plus a short note, so recommendation
// logic must treat a sparse profile conservatively rather than failing.
//
// Platform mapping vs Python: process.platform replaces platform.system()
// (darwin/linux/win32), process.arch replaces platform.machine().

export interface GpuInfo {
  // "nvidia" | "amd" | "apple" | "intel" | "unknown". vramGb is undefined
  // for Apple Silicon unified memory and unknown/integrated cases where
  // the number isn't separately meaningful.
  vendor: string
  name: string
  vramGb?: number
  driver?: string
  notes?: string
}

export interface HardwareProfile {
  osName?: string
  osVersion?: string
  arch?: string
  cpuModel?: string
  cpuCoresPhysical?: number
  cpuCoresLogical?: number
  ramTotalGb?: number
  gpus: GpuInfo[]
  diskFreeGb?: number
  diskTotalGb?: number
  notes: string[]
}

export function emptyProfile(): HardwareProfile {
  return { gpus: [], notes: [] }
}

// --- Convenience predicates the recommender uses ---

export function hasNvidiaGpu(profile: HardwareProfile): boolean {
  return profile.gpus.some((g) => g.vendor === "nvidia" && (g.vramGb ?? 0) >= 4)
}

export function bestDedicatedVramGb(profile: HardwareProfile): number {
  // Apple Silicon and integrated GPUs share system RAM: 0.0 here.
  const dedicated = profile.gpus.filter(
    (g) => (g.vendor === "nvidia" || g.vendor === "amd") && g.vramGb,
  )
  if (dedicated.length === 0) return 0.0
  return Math.max(...dedicated.map((g) => g.vramGb as number))
}

export function isAppleSilicon(profile: HardwareProfile): boolean {
  return profile.osName === "macOS" && (profile.arch ?? "").startsWith("arm")
}

// NOTE: no effective-memory helper here, deliberately. The memory-pool
// model lives in exactly one place: reasoning.effectiveMemoryGb.

// ---------------------------------------------------------------------------
// Command runner seam (tests inject canned/failing runners)
// ---------------------------------------------------------------------------

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export type RunFn = (cmd: string[]) => Promise<RunResult>

export async function runCommand(cmd: string[], timeoutMs = 4000): Promise<RunResult> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        // already exited
      }
    }, timeoutMs)
    try {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const code = await proc.exited
      return { code, stdout, stderr }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return { code: -1, stdout: "", stderr: "" }
  }
}

export type ReadFileFn = (path: string) => Promise<string>

async function defaultReadFile(path: string): Promise<string> {
  return Bun.file(path).text()
}

export interface DetectDeps {
  run?: RunFn
  readFile?: ReadFileFn
  statfs?: (path: string) => { bfree: number; blocks: number; bsize: number }
  home?: string
}

function depsOrDefault(deps?: DetectDeps): { run: RunFn; readFile: ReadFileFn } {
  return { run: deps?.run ?? runCommand, readFile: deps?.readFile ?? defaultReadFile }
}

// ---------------------------------------------------------------------------
// Pure parsers (canned-output tests target these)
// ---------------------------------------------------------------------------

export function parseOsRelease(text: string): string | undefined {
  const match = text.match(/^PRETTY_NAME="?([^"\n]+)"?/m)
  return match ? match[1].trim() || undefined : undefined
}

export interface LscpuResult {
  model?: string
  physical: number
  logical: number
}

export function parseLscpu(output: string): LscpuResult | undefined {
  // Order-independent: some virtualised environments reorder or drop lines.
  let model: string | undefined
  let coresPhys: number | undefined
  let coresLog: number | undefined
  let sockets: number | undefined
  for (const line of output.split("\n")) {
    if (line.startsWith("Model name:")) {
      model = line.split(":", 2)[1].trim()
    } else if (
      line.startsWith("CPU(s):") &&
      !line.includes("Logical") &&
      !line.toLowerCase().includes("socket")
    ) {
      // The plain "CPU(s):" line is the logical count on lscpu.
      const n = parseInt(line.split(":", 2)[1].trim(), 10)
      if (Number.isFinite(n)) coresLog = n
    } else if (line.startsWith("Core(s) per socket:")) {
      const n = parseInt(line.split(":", 2)[1].trim(), 10)
      if (Number.isFinite(n)) coresPhys = n
    } else if (line.startsWith("Socket(s):")) {
      const n = parseInt(line.split(":", 2)[1].trim(), 10)
      if (Number.isFinite(n)) sockets = n
    }
  }
  if (coresPhys !== undefined && sockets !== undefined) coresPhys = coresPhys * sockets
  if (model || coresLog !== undefined) {
    return { model, physical: coresPhys ?? 0, logical: coresLog ?? 0 }
  }
  return undefined
}

export interface ProcCpuinfoResult {
  model?: string
  logical: number
}

export function parseProcCpuinfo(text: string): ProcCpuinfoResult | undefined {
  const modelMatch = text.match(/model name\s*:\s*(.+)/)
  const model = modelMatch ? modelMatch[1].trim() : undefined
  const physIds = new Set(text.match(/physical id\s*:\s*(\d+)/g) ?? [])
  if (physIds.size > 0) {
    const coresPer = new Set(text.match(/cpu cores\s*:\s*(\d+)/g) ?? []).size
    return { model, logical: Math.max(1, physIds.size * (coresPer || 1)) }
  }
  const n = text.match(/^processor\s*:\s*\d+/gm)?.length ?? 0
  return { model, logical: n }
}

export function parseMeminfo(text: string): number | undefined {
  for (const line of text.split("\n")) {
    if (line.startsWith("MemTotal:")) {
      const kb = parseInt(line.split(/\s+/)[1], 10)
      if (Number.isFinite(kb)) return Math.round((kb / 1024 / 1024) * 100) / 100
    }
  }
  return undefined
}

export function parseNvidiaSmi(output: string): GpuInfo[] {
  const gpus: GpuInfo[] = []
  for (const line of output.trim().split("\n")) {
    const parts = line.split(",").map((p) => p.trim())
    if (parts.length < 2) continue
    const vramMb = parseFloat(parts[1])
    gpus.push({
      vendor: "nvidia",
      name: parts[0],
      vramGb: Number.isFinite(vramMb) && vramMb ? Math.round((vramMb / 1024) * 100) / 100 : undefined,
      driver: parts.length >= 3 && parts[2] ? parts[2] : undefined,
    })
  }
  return gpus
}

export function parseRocmSmi(output: string): GpuInfo[] {
  let name: string | undefined
  let vram: number | undefined
  for (const line of output.split("\n")) {
    if (line.includes("GPU[") && line.includes("]")) {
      if (!name) {
        const m = line.match(/:\s*(.+)/)
        if (m) name = m[1].trim()
      }
    }
    if (line.toLowerCase().includes("vram") && line.toLowerCase().includes("total")) {
      if (vram === undefined) {
        const m = line.match(/(\d+)\s*M/)
        if (m) vram = Math.round((parseInt(m[1], 10) / 1024) * 100) / 100
      }
    }
  }
  if (!name) return []
  return [
    {
      vendor: "amd",
      name,
      vramGb: vram,
      notes: vram !== undefined ? "rocm-smi" : "rocm-smi (VRAM not parsed)",
    },
  ]
}

export function parseWmiVideoControllers(output: string): GpuInfo[] {
  // wmic /value shape: one record per GPU, key=value lines with keys in
  // ALPHABETICAL order (AdapterRAM, DriverVersion, Name), records separated
  // by blank lines. Name arrives AFTER its record's numbers, so group per
  // blank-line-delimited record.
  const records: Record<string, string>[] = []
  let current: Record<string, string> = {}
  for (const raw of output.split("\n")) {
    const line = raw.trim()
    if (!line) {
      if (Object.keys(current).length > 0) {
        records.push(current)
        current = {}
      }
      continue
    }
    if (line.includes("=")) {
      const idx = line.indexOf("=")
      current[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  }
  if (Object.keys(current).length > 0) records.push(current)

  const gpus: GpuInfo[] = []
  for (const rec of records) {
    const name = rec["Name"] ?? ""
    if (!name) continue
    const lname = name.toLowerCase()
    let vendor: string
    if (lname.includes("nvidia") || lname.includes("geforce") || lname.includes("quadro")) vendor = "nvidia"
    else if (lname.includes("radeon") || lname.includes("amd") || lname.includes("ati ")) vendor = "amd"
    else if (lname.includes("intel")) vendor = "intel"
    else vendor = "unknown"
    let vramGb: number | undefined
    let notes = ""
    if (vendor === "intel") {
      notes = "Integrated GPU; shares system RAM."
    } else {
      const vramBytes = parseInt(rec["AdapterRAM"] ?? "", 10)
      if (Number.isFinite(vramBytes) && vramBytes > 0) {
        const candidate = Math.round(((vramBytes as number) / 1024 / 1024 / 1024) * 100) / 100
        if (candidate < 3.9) {
          vramGb = candidate
        } else {
          // WMI AdapterRAM is 32-bit and tops out near 4GB: a bigger card
          // would be silently underreported and corrupt the pool math.
          notes = "VRAM not reported reliably by WMI (>4GB card); treated as unknown."
        }
      }
    }
    gpus.push({ vendor, name, vramGb, driver: rec["DriverVersion"] || undefined, notes })
  }
  return gpus.filter((g) => g.vendor !== "unknown" || g.name)
}

// ---------------------------------------------------------------------------
// Probes (mutate the profile, never throw past the section boundary)
// ---------------------------------------------------------------------------

function mapPlatform(): string {
  if (process.platform === "darwin") return "macOS"
  if (process.platform === "linux") return "Linux"
  if (process.platform === "win32") return "Windows"
  return process.platform || "Unknown"
}

function mapArch(): string | undefined {
  if (process.arch === "x64") return "x86_64"
  if (process.arch === "arm64") return "arm64"
  return process.arch || undefined
}

export async function detectOs(profile: HardwareProfile, deps?: DetectDeps): Promise<void> {
  const { run, readFile } = depsOrDefault(deps)
  const system = mapPlatform()
  if (system === "macOS") {
    profile.osName = "macOS"
    const { code, stdout } = await run(["sw_vers", "-productVersion"])
    profile.osVersion = code === 0 && stdout.trim() ? stdout.trim() : os.release() || undefined
  } else if (system === "Linux") {
    profile.osName = "Linux"
    try {
      const data = await readFile("/etc/os-release")
      profile.osVersion = parseOsRelease(data) ?? os.release() ?? undefined
    } catch {
      profile.osVersion = os.release() || undefined
    }
  } else if (system === "Windows") {
    profile.osName = "Windows"
    profile.osVersion = os.release() || undefined
  } else {
    profile.osName = system
    profile.notes.push(`Unrecognized OS '${system}'; treating as unknown.`)
  }
  profile.arch = mapArch()
}

async function detectCpuMacOs(profile: HardwareProfile, run: RunFn): Promise<void> {
  const brand = await run(["sysctl", "-n", "machdep.cpu.brand_string"])
  if (brand.stdout.trim()) profile.cpuModel = brand.stdout.trim()
  const nphys = await run(["sysctl", "-n", "hw.physicalcpu"])
  const nlog = await run(["sysctl", "-n", "hw.logicalcpu"])
  const phys = parseInt(nphys.stdout.trim(), 10)
  if (Number.isFinite(phys)) profile.cpuCoresPhysical = phys
  const log = parseInt(nlog.stdout.trim(), 10)
  if (Number.isFinite(log)) profile.cpuCoresLogical = log
  // Apple Silicon check: arm64 + Apple brand string.
  if ((profile.arch ?? "").startsWith("arm") && profile.cpuModel?.includes("Apple")) {
    profile.notes.push("Apple Silicon detected: CPU and GPU share unified memory.")
  }
}

async function detectCpuWindows(profile: HardwareProfile, run: RunFn): Promise<void> {
  const { code, stdout } = await run(["wmic", "cpu", "get", "Name,NumberOfCores,NumberOfLogicalProcessors", "/value"])
  if (code === 0 && stdout) {
    for (const raw of stdout.split("\n")) {
      const line = raw.trim()
      if (line.startsWith("Name=")) profile.cpuModel = line.split("=", 2)[1].trim() || profile.cpuModel
      else if (line.startsWith("NumberOfCores=")) {
        const n = parseInt(line.split("=", 2)[1].trim(), 10)
        if (Number.isFinite(n)) profile.cpuCoresPhysical = n
      } else if (line.startsWith("NumberOfLogicalProcessors=")) {
        const n = parseInt(line.split("=", 2)[1].trim(), 10)
        if (Number.isFinite(n)) profile.cpuCoresLogical = n
      }
    }
  }
  if (code !== 0 || !stdout.trim()) {
    const fallback = await run([
      "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors | ConvertTo-Json -Compress",
    ])
    if (fallback.code === 0 && fallback.stdout.trim()) {
      try {
        const data = JSON.parse(fallback.stdout) as Record<string, unknown> | Record<string, unknown>[]
        const cpus = Array.isArray(data) ? data : [data]
        profile.cpuModel = String(cpus[0]?.Name || "") || undefined
        const physical = cpus.reduce((total, cpu) => total + Number(cpu.NumberOfCores || 0), 0)
        const logical = cpus.reduce((total, cpu) => total + Number(cpu.NumberOfLogicalProcessors || 0), 0)
        if (physical > 0) profile.cpuCoresPhysical = physical
        if (logical > 0) profile.cpuCoresLogical = logical
      } catch {
        // os.cpus below remains available.
      }
    }
  }
  if (!profile.cpuModel) {
    try {
      profile.cpuModel = os.cpus()[0]?.model || undefined
    } catch {
      // ignore
    }
  }
  if (profile.cpuCoresLogical === undefined) {
    try {
      profile.cpuCoresLogical = os.cpus().length || undefined
    } catch {
      // ignore
    }
  }
}

export async function detectCpu(profile: HardwareProfile, deps?: DetectDeps): Promise<void> {
  const { run, readFile } = depsOrDefault(deps)
  if (profile.osName === "macOS") {
    await detectCpuMacOs(profile, run)
  } else if (profile.osName === "Windows") {
    await detectCpuWindows(profile, run)
  } else {
    // Linux or unknown.
    const { code, stdout } = await run(["lscpu"])
    if (code === 0 && stdout) {
      const res = parseLscpu(stdout)
      if (res) {
        if (res.model) profile.cpuModel = res.model
        if (res.physical) profile.cpuCoresPhysical = res.physical
        if (res.logical) profile.cpuCoresLogical = res.logical
      }
    }
    if (!profile.cpuModel || profile.cpuCoresLogical === undefined) {
      try {
        const data = await readFile("/proc/cpuinfo")
        const res = parseProcCpuinfo(data)
        if (res) {
          if (res.model && !profile.cpuModel) profile.cpuModel = res.model
          if (res.logical && profile.cpuCoresLogical === undefined) profile.cpuCoresLogical = res.logical
        }
      } catch {
        // ignore; universial fallback below
      }
    }
  }

  if (profile.cpuCoresLogical === undefined) {
    try {
      const n = os.cpus().length
      if (n > 0) profile.cpuCoresLogical = n
    } catch {
      // ignore
    }
  }
  if (profile.cpuModel === undefined && profile.cpuCoresLogical === undefined) {
    profile.notes.push("Could not detect CPU model or core count.")
  }
}

export async function detectRam(profile: HardwareProfile, deps?: DetectDeps): Promise<void> {
  const { run, readFile } = depsOrDefault(deps)
  if (profile.osName === "macOS") {
    const { code, stdout } = await run(["sysctl", "-n", "hw.memsize"])
    if (code === 0 && stdout.trim()) {
      const bytes = parseInt(stdout.trim(), 10)
      if (Number.isFinite(bytes)) profile.ramTotalGb = Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100
    }
  } else if (profile.osName === "Windows") {
    // os.totalmem() replaces ctypes GlobalMemoryStatusEx (no FFI in Bun).
    try {
      const bytes = os.totalmem()
      if (bytes > 0) {
        profile.ramTotalGb = Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100
        return
      }
    } catch {
      // fall through to wmic
    }
    const { code, stdout } = await run(["wmic", "computersystem", "get", "TotalPhysicalMemory", "/value"])
    if (code === 0 && stdout) {
      const m = stdout.match(/TotalPhysicalMemory=(\d+)/)
      if (m) {
        const bytes = parseInt(m[1], 10)
        if (Number.isFinite(bytes)) profile.ramTotalGb = Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100
      }
    }
  } else {
    try {
      const data = await readFile("/proc/meminfo")
      profile.ramTotalGb = parseMeminfo(data)
    } catch {
      // fall through to totalmem
    }
  }

  // Last-ditch: os.totalmem() (covers the old sysconf + psutil fallbacks).
  if (profile.ramTotalGb === undefined) {
    try {
      const bytes = os.totalmem()
      if (bytes > 0) profile.ramTotalGb = Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100
    } catch {
      // ignore
    }
  }
  if (profile.ramTotalGb === undefined) profile.notes.push("Could not detect total RAM.")
}

export async function detectNvidiaGpus(run: RunFn = runCommand): Promise<GpuInfo[]> {
  const { code, stdout } = await run([
    "nvidia-smi",
    "--query-gpu=name,memory.total,driver_version",
    "--format=csv,noheader,nounits",
  ])
  if (code !== 0 || !stdout.trim()) return []
  return parseNvidiaSmi(stdout)
}

export async function detectAmdGpus(run: RunFn = runCommand): Promise<GpuInfo[]> {
  const { code, stdout } = await run(["rocm-smi", "--showproductname", "--showmeminfo", "vram"])
  if (code !== 0 || !stdout.trim()) return []
  return parseRocmSmi(stdout)
}

export function detectAppleGpu(profile: HardwareProfile): void {
  if (isAppleSilicon(profile)) {
    profile.gpus.push({
      vendor: "apple",
      name: profile.cpuModel || "Apple Silicon",
      vramGb: undefined,
      notes: "Unified memory shared with the system; no separate VRAM.",
    })
  }
}

export async function detectIntelOrIntegratedLinux(profile: HardwareProfile, run: RunFn = runCommand): Promise<void> {
  const { code, stdout } = await run(["lspci"])
  if (code !== 0 || !stdout) return
  for (const line of stdout.split("\n")) {
    if (!line.includes("VGA compatible controller") && !line.includes("3D controller")) continue
    const m = line.match(/:\s*(.+)$/)
    if (!m) continue
    const name = m[1].trim()
    const lname = name.toLowerCase()
    if (lname.includes("nvidia")) continue // nvidia-smi already ran
    let vendor = "unknown"
    if (lname.includes("amd") || lname.includes("radeon") || lname.includes("ati")) vendor = "amd"
    else if (lname.includes("intel")) vendor = "intel"
    profile.gpus.push({ vendor, name, vramGb: undefined, notes: "Integrated / no separate VRAM detected." })
  }
}

export async function detectWindowsGpusWmi(run: RunFn = runCommand): Promise<GpuInfo[]> {
  const { code, stdout } = await run([
    "wmic",
    "path",
    "win32_VideoController",
    "get",
    "Name,AdapterRAM,DriverVersion",
    "/value",
  ])
  if (code === 0 && stdout.trim()) return parseWmiVideoControllers(stdout)
  const fallback = await run([
    "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
    "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress",
  ])
  if (fallback.code !== 0 || !fallback.stdout.trim()) return []
  try {
    const data = JSON.parse(fallback.stdout) as Record<string, unknown> | Record<string, unknown>[]
    const controllers = Array.isArray(data) ? data : [data]
    const records = controllers.map((gpu) =>
      `AdapterRAM=${gpu.AdapterRAM ?? ""}\nDriverVersion=${gpu.DriverVersion ?? ""}\nName=${gpu.Name ?? ""}`,
    )
    return parseWmiVideoControllers(records.join("\n\n"))
  } catch {
    return []
  }
}

export async function detectGpus(profile: HardwareProfile, deps?: DetectDeps): Promise<void> {
  const { run } = depsOrDefault(deps)
  detectAppleGpu(profile)
  let nvidia: GpuInfo[] = []
  try {
    nvidia = await detectNvidiaGpus(run)
  } catch (e) {
    profile.notes.push(`NVIDIA probe failed: ${e}`)
  }
  profile.gpus.push(...nvidia)
  if (nvidia.length === 0) {
    try {
      profile.gpus.push(...(await detectAmdGpus(run)))
    } catch (e) {
      profile.notes.push(`AMD probe failed: ${e}`)
    }
  }
  if (profile.gpus.length === 0 && profile.osName === "Linux") {
    try {
      await detectIntelOrIntegratedLinux(profile, run)
    } catch (e) {
      profile.notes.push(`Integrated-GPU probe failed: ${e}`)
    }
  }
  if (profile.gpus.length === 0 && profile.osName === "Windows") {
    try {
      if (nvidia.length === 0) profile.gpus.push(...(await detectWindowsGpusWmi(run)))
    } catch (e) {
      profile.notes.push(`WMI GPU probe failed: ${e}`)
    }
  }
  if (profile.gpus.length === 0) {
    profile.notes.push("No dedicated GPU detected; the model will run on CPU and use system RAM.")
  }
}

export interface DiskUsage {
  freeGb: number
  totalGb: number
}

export function parseDfKiloBlocks(output: string): DiskUsage | undefined {
  // `df -k <home>`: second line `<fs> <1k-blocks> <used> <available> ...`.
  const lines = output.trim().split("\n")
  if (lines.length < 2) return undefined
  const parts = lines[1].trim().split(/\s+/)
  if (parts.length < 4) return undefined
  const totalKb = parseInt(parts[1], 10)
  const availKb = parseInt(parts[3], 10)
  if (!Number.isFinite(totalKb) || !Number.isFinite(availKb)) return undefined
  return {
    freeGb: Math.round((availKb / 1024 / 1024) * 100) / 100,
    totalGb: Math.round((totalKb / 1024 / 1024) * 100) / 100,
  }
}

export async function detectDisk(
  profile: HardwareProfile,
  deps?: DetectDeps & { home?: string; statfs?: (path: string) => { bfree: number; blocks: number; bsize: number } },
): Promise<void> {
  const { run } = depsOrDefault(deps)
  const home = deps?.home ?? os.homedir()
  const statfs = deps?.statfs
  if (statfs) {
    try {
      const st = statfs(home)
      profile.diskFreeGb = Math.round(((st.bfree * st.bsize) / 1024 / 1024 / 1024) * 100) / 100
      profile.diskTotalGb = Math.round(((st.blocks * st.bsize) / 1024 / 1024 / 1024) * 100) / 100
      return
    } catch (e) {
      profile.notes.push(`Disk-space detection failed: ${e}`)
      return
    }
  }
  try {
    const fs = await import("node:fs")
    const st = fs.statfsSync(home)
    profile.diskFreeGb = Math.round(((st.bfree * st.bsize) / 1024 / 1024 / 1024) * 100) / 100
    profile.diskTotalGb = Math.round(((st.blocks * st.bsize) / 1024 / 1024 / 1024) * 100) / 100
  } catch {
    const { code, stdout } = await run(["df", "-k", home])
    if (code === 0 && stdout) {
      const usage = parseDfKiloBlocks(stdout)
      if (usage) {
        profile.diskFreeGb = usage.freeGb
        profile.diskTotalGb = usage.totalGb
        return
      }
    }
    profile.notes.push(`Disk-space detection failed for ${home}.`)
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function detectHardware(deps?: DetectDeps): Promise<HardwareProfile> {
  const profile = emptyProfile()
  try {
    await detectOs(profile, deps)
  } catch (e) {
    profile.notes.push(`OS detection crashed: ${e}`)
  }
  try {
    await detectCpu(profile, deps)
  } catch (e) {
    profile.notes.push(`CPU detection crashed: ${e}`)
  }
  try {
    await detectRam(profile, deps)
  } catch (e) {
    profile.notes.push(`RAM detection crashed: ${e}`)
  }
  try {
    await detectGpus(profile, deps)
  } catch (e) {
    profile.notes.push(`GPU detection crashed: ${e}`)
  }
  try {
    await detectDisk(profile, deps)
  } catch (e) {
    profile.notes.push(`Disk detection crashed: ${e}`)
  }
  return profile
}

export * as OnboardingHardware from "./hardware"
