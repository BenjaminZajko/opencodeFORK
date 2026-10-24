import { createSignal, onCleanup, onMount, Show } from "solid-js"
import open from "open"
import { useTerminalDimensions } from "@opentui/solid"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useToast } from "../ui/toast"
import { currentSponsor } from "../olivecode/sponsor"

/** Stable sponsor cards: a welcome card and a smaller chat composer placement. */
export function SponsorPlacement(props: { placement?: "welcome" | "chat" } = {}) {
  const { theme } = useTheme()
  const toast = useToast()
  const dimensions = useTerminalDimensions()
  const compact = () => dimensions().height <= 24
  const welcome = () => props.placement === "welcome" && !compact()
  const [sponsor, setSponsor] = createSignal(currentSponsor())
  let timer: ReturnType<typeof setTimeout> | undefined

  const refresh = () => {
    const campaign = currentSponsor()
    setSponsor(campaign)
    // Check again at expiration, or once per minute for a future campaign.
    const delay = campaign ? Math.min(60_000, Math.max(1, Date.parse(campaign.ends) - Date.now())) : 60_000
    timer = setTimeout(refresh, delay)
  }
  onMount(refresh)
  onCleanup(() => clearTimeout(timer))

  const visit = () => {
    // An expired campaign must never remain clickable between refreshes.
    const campaign = currentSponsor()
    if (!campaign) {
      setSponsor(undefined)
      return
    }
    void open(campaign.website).catch(() => {
      toast.show({ variant: "error", message: "Could not open the sponsor website." })
    })
  }

  return (
    <box
      height={compact() ? 3 : welcome() ? 5 : 4}
      flexShrink={0}
      width="100%"
      border
      borderStyle="rounded"
      borderColor={theme.borderSubtle}
      backgroundColor={theme.backgroundPanel}
      title="Sponsored"
      paddingLeft={1}
      paddingRight={1}
    >
      <Show when={sponsor()} fallback={
        <>
          <text fg={theme.textMuted} truncate wrapMode="none">Ad unavailable right now.</text>
          <Show when={!compact()}>
            <text fg={theme.textMuted} truncate wrapMode="none">Sponsorship helps keep OliveCode free.</text>
          </Show>
        </>
      }>
        {(campaign) => (
          <>
            <box flexDirection="row" height={1} gap={2}>
              <text fg={theme.text} attributes={TextAttributes.BOLD} truncate wrapMode="none" onMouseUp={visit}>{campaign().name}</text>
              <Show when={!welcome()}>
                <text fg={theme.primary} truncate wrapMode="none" onMouseUp={visit}>{`${new URL(campaign().website).hostname} ↗`}</text>
              </Show>
            </box>
            <Show when={!compact()}>
              <text fg={theme.textMuted} truncate wrapMode="none">{campaign().message}</text>
            </Show>
            <Show when={welcome()}>
              <text fg={theme.primary} truncate wrapMode="none" onMouseUp={visit}>{`Visit sponsor · ${new URL(campaign().website).hostname} ↗`}</text>
            </Show>
          </>
        )}
      </Show>
    </box>
  )
}
