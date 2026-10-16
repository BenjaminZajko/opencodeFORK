import { createSignal, onCleanup, onMount } from "solid-js"
import { readRemotePresence, type RemotePresence } from "@opencode-ai/core/olivecode/remote-status"
import { useTuiPaths } from "../context/runtime"

export function useRemotePresence() {
  const paths = useTuiPaths()
  const [presence, setPresence] = createSignal<RemotePresence>()
  let disposed = false
  const refresh = async () => {
    const value = await readRemotePresence(paths.state)
    if (!disposed) setPresence(value)
  }
  onMount(() => { void refresh() })
  const timer = setInterval(() => { void refresh() }, 5000)
  onCleanup(() => { disposed = true; clearInterval(timer) })
  return presence
}
