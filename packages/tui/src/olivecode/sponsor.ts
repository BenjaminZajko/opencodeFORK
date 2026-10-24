import { verifySponsor } from "@opencode-ai/core/olivecode/sponsor"
import { signedSponsor, sponsorPublicKey } from "./sponsor-config"
export type { Sponsor } from "@opencode-ai/core/olivecode/sponsor"

export function currentSponsor(now = new Date()) {
  return verifySponsor(signedSponsor, sponsorPublicKey, now)
}
