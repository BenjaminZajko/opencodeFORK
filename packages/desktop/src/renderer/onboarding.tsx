import { useServer, useSettings } from "@opencode-ai/app"
import { onMount } from "solid-js"

export function DesktopFirstLaunchOnboarding(props: { initialUrl: string; onLoaded: () => void }) {
  const server = useServer()
  const settings = useSettings()
  onMount(() => {
    void (async () => {
      try {
        await server.ready.promise
        const existing = await window.api.isOldLayoutEligible()
        settings.general.setOldLayoutEligible(existing)
        settings.general.initializeAgentVisibility(existing)
        // Start at home and let the person choose their real project.
        await window.api.finishFirstLaunchOnboarding(false)
      } catch (error) {
        console.error("OliveCode onboarding failed", error)
      } finally {
        props.onLoaded()
      }
    })()
  })
  return null
}
