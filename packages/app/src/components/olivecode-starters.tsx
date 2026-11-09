import { For } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "../context/language"

const starters = [
  {
    title: "olivecode.starter.explore",
    description: "olivecode.starter.explore.description",
    prompt: "olivecode.starter.explore.prompt",
    icon: "magnifying-glass",
  },
  {
    title: "olivecode.starter.fix",
    description: "olivecode.starter.fix.description",
    prompt: "olivecode.starter.fix.prompt",
    icon: "code",
  },
  {
    title: "olivecode.starter.review",
    description: "olivecode.starter.review.description",
    prompt: "olivecode.starter.review.prompt",
    icon: "check",
  },
] as const

export function OliveCodeStarters(props: { onChoose: (prompt: string) => void }) {
  const language = useLanguage()
  return (
    <div class="olive-starters">
      <For each={starters}>
        {(item) => (
          <button
            class="olive-starter"
            title={language.t(item.description)}
            onClick={() => props.onChoose(language.t(item.prompt))}
          >
            <Icon name={item.icon} size="small" />
            <span>{language.t(item.title)}</span>
          </button>
        )}
      </For>
    </div>
  )
}
