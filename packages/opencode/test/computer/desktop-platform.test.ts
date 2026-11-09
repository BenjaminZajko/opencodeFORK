import { expect, test } from "bun:test"
import { platformCommand } from "../../src/computer/desktop-platform"

test("portable launchers carry only fixed bundled code, never model input", async () => {
  const windows = await platformCommand("win32")
  expect(windows.binary).toEndWith("\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
  expect(windows.args.slice(0, 5)).toEqual(["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-Command"])
  expect(windows.args).not.toContain("Bypass")
  expect(windows.args.at(-1)).toContain("ConvertFrom-Json -InputObject $line")
  const linux = await platformCommand("linux")
  expect(linux.binary).toBe("/usr/bin/python3")
  expect(linux.args.slice(0, 3)).toEqual(["-I", "-u", "-c"])
  expect(linux.args.at(-1)).toContain("request = json.loads(line)")
  await expect(platformCommand("freebsd")).rejects.toThrow("Browser mode")
})

test("Linux adapter reports missing dependencies without observing the host", async () => {
  const command = await platformCommand("linux")
  const child = Bun.spawn([command.binary, ...command.args], {
    stdin: new Response('{"action":"status"}\n{"action":"close"}\n').body!,
    stdout: "pipe", stderr: "pipe", env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: "", DISPLAY: "", WAYLAND_DISPLAY: "", PYTHONNOUSERSITE: "1" },
  })
  const [output, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect(code).toBe(0)
  expect(error).toBe("")
  const lines = output.trim().split("\n").map((line) => JSON.parse(line))
  expect(lines[0].ok).toBe(true)
  expect(lines[0].result).toMatchObject({ platform: "Linux", ready: false, experimental: true })
  expect(lines[0].result.capabilities).toMatchObject({ windowScreenshots: false, inWindowDrag: false })
  expect(lines[0].result).not.toHaveProperty("text")
  expect(lines[0].result).not.toHaveProperty("controls")
  expect(lines[1].result.closed).toBe(true)
})

test("Linux AT-SPI safety contract uses stateful app/control fixtures", async () => {
  const child = Bun.spawn(["/usr/bin/python3", "test/computer/desktop_linux_contract.py"], { stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect(code, out + err).toBe(0)
})
