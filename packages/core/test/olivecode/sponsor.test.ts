import { expect, test } from "bun:test"
import { generateKeyPairSync, sign } from "node:crypto"
import { validSponsor, verifySponsor } from "../../src/olivecode/sponsor"

const keys = generateKeyPairSync("ed25519")
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString()
const campaign = { id: "test-campaign", name: "Test sponsor", message: "Developer tools", website: "https://example.com", starts: "2026-10-01T00:00:00Z", ends: "2026-11-01T00:00:00Z" }
const now = new Date("2026-10-02T00:00:00Z")
const payload = JSON.stringify(campaign)
const envelope = { payload, signature: sign(null, Buffer.from(payload), keys.privateKey).toString("base64url") }
test("publisher-signed active campaign is accepted", () => expect(verifySponsor(envelope, publicKey, now)).toEqual(campaign))
test("altered copy, destination, or signature is rejected", () => {
  expect(verifySponsor({ ...envelope, payload: payload.replace("Developer tools", "Changed") }, publicKey, now)).toBeUndefined()
  expect(verifySponsor({ ...envelope, signature: "a".repeat(86) }, publicKey, now)).toBeUndefined()
  const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString()
  expect(verifySponsor(envelope, other, now)).toBeUndefined()
})
test("empty preview and expired campaigns show nothing", () => {
  expect(verifySponsor(undefined, undefined, now)).toBeUndefined()
  expect(verifySponsor(envelope, publicKey, new Date(campaign.ends))).toBeUndefined()
  expect(verifySponsor(envelope, publicKey, new Date("2026-09-01"))).toBeUndefined()
})
test("unsafe sponsor content and invalid dates are rejected", () => {
  for (const change of [{ website: "javascript:alert(1)" }, { website: "https://user:pass@example.com" }, { name: "hello\nworld" }, { name: "" }, { message: "x".repeat(73) }, { starts: campaign.ends }, { id: "../secret" }, { extra: "unexpected" }]) {
    expect(validSponsor({ ...campaign, ...change }, now)).toBeUndefined()
  }
})
