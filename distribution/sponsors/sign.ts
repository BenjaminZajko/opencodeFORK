import { createPrivateKey, sign } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { validSponsor } from "../../packages/core/src/olivecode/sponsor"

// bun distribution/sponsors/sign.ts campaign.json PRIVATE-KEY.pem signed-campaign.json
const [source, keyFile, output] = process.argv.slice(2)
if (!source || !keyFile || !output) throw new Error("Usage: sign.ts campaign.json private-key.pem signed-campaign.json")
const campaign = JSON.parse(await readFile(source, "utf8"))
// Validate at the campaign start so scheduled future campaigns can be signed.
if (!validSponsor(campaign, new Date(campaign.starts))) throw new Error("Invalid sponsor campaign")
const key = createPrivateKey(await readFile(keyFile, "utf8"))
if (key.asymmetricKeyType !== "ed25519") throw new Error("An Ed25519 signing key is required")
const payload = JSON.stringify(campaign)
const signature = sign(null, Buffer.from(payload), key).toString("base64url")
await writeFile(output, JSON.stringify({ payload, signature }, null, 2) + "\n", { flag: "wx" })
console.log("Signed campaign saved. The private key was not included.")
