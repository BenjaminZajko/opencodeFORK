import { expect, test } from "bun:test"
import { assertIsolated, backgroundMacHost, sshArguments } from "../../src/computer/background-mac"
test("background Mac accepts only a user configured host alias and pins SSH authentication", () => {
  expect(backgroundMacHost("olivecode-vm")).toBe("olivecode-vm")
  for (const host of ["", "-oProxyCommand=evil", "user@host", "host;touch /tmp/bad", "https://host", "$(whoami)"]) expect(() => backgroundMacHost(host)).toThrow()
  const args = sshArguments("olivecode-vm")
  expect(args).toContain("StrictHostKeyChecking=yes")
  expect(args).toContain("BatchMode=yes")
  expect(args).toContain("ForwardAgent=no")
  expect(args.at(-2)).toBe("olivecode-vm")
})
test("unknown identities and main-Mac targets fail closed", () => {
  const host = "a".repeat(64), guest = "b".repeat(64)
  expect(() => assertIsolated(host, host)).toThrow("main Mac")
  for (const value of [undefined, "", "unknown", "a".repeat(63)]) expect(() => assertIsolated(host, value)).toThrow("verify")
  expect(() => assertIsolated(host, guest)).not.toThrow()
})
