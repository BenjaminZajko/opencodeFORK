import { RGBA, TextAttributes } from "@opentui/core"
import { For, Show } from "solid-js"
import { useTheme } from "../context/theme"

// Solid terminal cells keep the fruit and its pimento crisp in any font.
const fruit = [
  "               ll",
  "     bbbbb   lll ",
  "   bbbbbbbbbslll ",
  "  bbbhbbbbbpPPb  ",
  "  bbbbbbbbbbbbb  ",
  "   bbbbbbbbbbb   ",
  "     dbbbbbdd    ",
]
const fruitRows = fruit.map((row) => [...row])
const colors = {
  dark: {
    b: RGBA.fromHex("#78BF78"),
    d: RGBA.fromHex("#438451"),
    h: RGBA.fromHex("#B4E5A0"),
    l: RGBA.fromHex("#A9D87D"),
    s: RGBA.fromHex("#438451"),
    p: RGBA.fromHex("#A3453E"),
    P: RGBA.fromHex("#DE8261"),
  },
  light: {
    b: RGBA.fromHex("#377E47"),
    d: RGBA.fromHex("#235D35"),
    h: RGBA.fromHex("#88B66F"),
    l: RGBA.fromHex("#67984E"),
    s: RGBA.fromHex("#235D35"),
    p: RGBA.fromHex("#81362F"),
    P: RGBA.fromHex("#B75C40"),
  },
} as const
const codeColors = {
  dark: {
    b: RGBA.fromHex("#65D0A4"),
    h: RGBA.fromHex("#B6EED1"),
    d: RGBA.fromHex("#3C9472"),
  },
  light: {
    b: RGBA.fromHex("#176F52"),
    h: RGBA.fromHex("#6EAD8C"),
    d: RGBA.fromHex("#0D513C"),
  },
} as const

const tallC = ["  hbbbb", " bb    ", "bb     ", "bb     ", "bb     ", " bb    ", "  dbbbb"]
const small = {
  L: [" bb  ", "bb   ", "bb   ", "bb   ", "bb   ", "dbbbb"],
  I: ["hbbbb", "  bb ", "  bb ", "  bb ", "  bb ", "bbbbd"],
  V: ["hb  bb", "bb  bb", "bb  bb", " bb bb", " bb bb", "  bbb "],
  E: ["hbbbb", "bb   ", "bb   ", "bbbd ", "bb   ", "bbbbd"],
  O: [" hbb ", "bb bb", "bb bb", "bb bb", "bb bb", " dbb "],
  D: ["hbbb ", "bb bb", "bb bb", "bb bb", "bb bb", "dbbb "],
} as const

const word = (value: string, row: number) =>
  [...value].map((letter) => small[letter as keyof typeof small][row]).join(" ")

const lockup = Array.from({ length: 7 }, (_, row) => ({
  live: row === 0 ? " ".repeat(word("LIVE", 0).length) : word("LIVE", row - 1),
  c: tallC[row],
  ode: row === 0 ? " ".repeat(word("ODE", 0).length) : word("ODE", row - 1),
}))

export function Logo(props: { compact?: boolean; hero?: "wide" | "stacked" }) {
  const { theme, mode } = useTheme()
  const ink = (pixel: string) => pixel === " " ? theme.background : colors[mode()][pixel as keyof typeof colors.dark]
  const codeInk = (pixel: string) => pixel === " " ? theme.background : codeColors[mode()][pixel as keyof typeof codeColors.dark]
  const brand = () => colors[mode()].b
  const fruitRow = (row: number) => <For each={fruitRows[row]}>
    {(pixel) => <span style={{ fg: ink(pixel), bg: ink(pixel) }}>{pixel === " " ? " " : "█"}</span>}
  </For>
  const letters = (value: string, color: typeof ink) => <For each={[...value]}>
    {(pixel) => <span style={{ fg: color(pixel), bg: color(pixel) }}>{pixel === " " ? " " : "█"}</span>}
  </For>
  return (
    <Show when={props.hero} fallback={
      <text attributes={TextAttributes.BOLD} wrapMode="none">
        <span style={{ fg: colors[mode()].b }}>◕ Olive</span>
        <span style={{ fg: codeColors[mode()].b }}>Code</span>
      </text>
    }>
      <Show when={props.hero === "wide"} fallback={
        <box flexDirection="column" alignItems="center">
          <For each={fruitRows}>{(_, index) => <text wrapMode="none">{fruitRow(index())}</text>}</For>
          <text fg={brand()} attributes={TextAttributes.BOLD}>OliveCode</text>
        </box>
      }>
        <box>
          <For each={lockup}>
            {(row, index) => <text wrapMode="none">{fruitRow(index())}{letters(row.live, ink)}{letters(` ${row.c} ${row.ode}`, codeInk)}</text>}
          </For>
        </box>
      </Show>
    </Show>
  )
}
