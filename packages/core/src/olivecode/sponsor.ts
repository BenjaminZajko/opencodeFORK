import { createPublicKey, verify } from "node:crypto"

export type Sponsor = {
  id: string
  name: string
  message: string
  website: string
  starts: string
  ends: string
}
export type SignedSponsor = { payload: string; signature: string }

export function validSponsor(value: unknown, now = new Date()): Sponsor | undefined {
  if (!Number.isFinite(now.getTime())) return
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const item = value as Record<string, unknown>
  const fields = ["id", "name", "message", "website", "starts", "ends"] as const
  if (Object.keys(item).some((key) => !fields.includes(key as typeof fields[number]))) return
  if (fields.some((key) => typeof item[key] !== "string" || !item[key])) return
  const active = item as Sponsor
  if (!active.name.trim() || !active.message.trim()) return
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(active.id)) return
  if (active.name.length > 32 || active.message.length > 72 || active.website.length > 512) return
  if (/[\x00-\x1f\x7f]/.test(active.name + active.message + active.website)) return
  try {
    const url = new URL(active.website)
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return
  } catch { return }
  const start = Date.parse(active.starts)
  const end = Date.parse(active.ends)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || now.getTime() < start || now.getTime() >= end) return
  return active
}

// The app contains only a PUBLIC verification key. Private signing keys stay with the publisher.
export function verifySponsor(envelope: SignedSponsor | undefined, publicKey: string | undefined, now = new Date()): Sponsor | undefined {
  if (!envelope || !publicKey || typeof envelope.payload !== "string" || envelope.payload.length > 4096 || typeof envelope.signature !== "string") return
  try {
    const key = createPublicKey(publicKey)
    if (key.asymmetricKeyType !== "ed25519") return
    const signature = Buffer.from(envelope.signature, "base64url")
    if (signature.length !== 64 || signature.toString("base64url") !== envelope.signature) return
    if (!verify(null, Buffer.from(envelope.payload), key, signature)) return
    return validSponsor(JSON.parse(envelope.payload), now)
  } catch { return }
}
