export type RemoteLaunch = {
  action: "setup" | "start" | "status"
  channel: "telegram" | "whatsapp"
  directory: string
  mode: "coding" | "browser" | "visible" | "mac"
}
export type RemoteLaunchResult = "opened" | "missing-cli" | "unavailable"
