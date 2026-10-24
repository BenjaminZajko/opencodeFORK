import { onCleanup } from "solid-js"

// A transport may ignore AbortSignal (for example an in-flight worker RPC).
// Race cancellation as well as passing the signal so every dialog can settle.
export function useDialogRequest() {
  const pending = new Set<AbortController>()
  let closed = false
  onCleanup(() => {
    closed = true
    for (const controller of pending) controller.abort(new DOMException("Dialog closed", "AbortError"))
  })

  return async <T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (closed) throw new DOMException("Dialog closed", "AbortError")
    const controller = new AbortController()
    pending.add(controller)
    const timeout = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), 10_000)
    try {
      return await Promise.race([
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true })
        }),
        request(controller.signal),
      ])
    } finally {
      clearTimeout(timeout)
      pending.delete(controller)
    }
  }
}
