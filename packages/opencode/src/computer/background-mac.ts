/** The endpoint is a user-configured SSH alias, never a model-supplied command. */
export function backgroundMacHost(value = process.env.OLIVECODE_BACKGROUND_MAC_SSH) {
  if (!value) throw new Error("Background Mac needs an isolated macOS VM or second Mac. Configure its trusted SSH alias using OLIVECODE_BACKGROUND_MAC_SSH; no action was sent to your main Mac.")
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value)) throw new Error("Use a trusted SSH host alias, without a username, password, command, URL or shell characters.")
  return value
}
export function sshArguments(host: string) {
  backgroundMacHost(host)
  return ["-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ForwardAgent=no", "-o", "ClearAllForwardings=yes", "-o", "ConnectTimeout=10", "--", host,
    'exec "$HOME/Library/Application Support/OliveCode/OliveCode Computer.app/Contents/MacOS/OliveCode Computer"']
}
export function assertIsolated(local: string, remote: unknown) {
  if (!/^[a-f0-9]{64}$/.test(local) || typeof remote !== "string" || !/^[a-f0-9]{64}$/.test(remote)) throw new Error("Could not verify the isolated Mac. No desktop action was sent.")
  if (local === remote) throw new Error("Background Mac points to your main Mac. Use a separate macOS VM or second Mac; no desktop input was sent.")
}
