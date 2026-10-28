import { verifySponsor, type Sponsor } from "@opencode-ai/core/olivecode/sponsor"

export function createSponsorReporter(options: {
  endpoint: string
  publicKey: string
  campaign: Sponsor
  request?: typeof fetch
}) {
  const controller = new AbortController()
  const request = options.request ?? fetch
  const base = options.endpoint.endsWith("/") ? options.endpoint : options.endpoint + "/"
  let receipt: string | undefined
  let viewed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  async function event(kind: "view" | "click") {
    if (controller.signal.aborted || !receipt || (kind === "click" && !viewed)) return
    const response = await request(new URL("v1/event", base), {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
      body: JSON.stringify({ receipt, kind }),
    }).catch(() => undefined)
    if (kind === "view" && response?.ok && !controller.signal.aborted) viewed = true
  }
  async function start() {
    const response = await request(new URL("v1/delivery", base), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
    }).catch(() => undefined)
    if (!response?.ok || controller.signal.aborted) return
    const data: unknown = await response.json().catch(() => undefined)
    if (
      !data ||
      typeof data !== "object" ||
      !("campaign" in data) ||
      !("receipt" in data) ||
      typeof data.receipt !== "string" ||
      data.receipt.length > 1024
    )
      return
    const envelope = data.campaign
    if (
      !envelope ||
      typeof envelope !== "object" ||
      !("payload" in envelope) ||
      typeof envelope.payload !== "string" ||
      !("signature" in envelope) ||
      typeof envelope.signature !== "string"
    )
      return
    const campaign = verifySponsor({ payload: envelope.payload, signature: envelope.signature }, options.publicKey)
    if (!campaign || campaign.id !== options.campaign.id || controller.signal.aborted) return
    receipt = data.receipt
    timer = setTimeout(() => void event("view"), 1100)
  }
  void start()
  return {
    click: () => {
      void event("click")
    },
    stop: () => {
      controller.abort()
      clearTimeout(timer)
    },
  }
}
