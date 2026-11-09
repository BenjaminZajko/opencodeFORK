import { type ComponentProps } from "solid-js"
import { Mark } from "../../components/logo"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  return (
    <svg viewBox="0 0 720 129" class={props.class} fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <svg x="248" y="45" width="42" height="35" viewBox="0 0 170 140">
        <Mark />
      </svg>
      <text
        x="306"
        y="74"
        fill="var(--v2-text-text-base)"
        font-family="system-ui, sans-serif"
        font-size="30"
        font-weight="550"
        letter-spacing="-1"
      >
        OliveCode
      </text>
    </svg>
  )
}
