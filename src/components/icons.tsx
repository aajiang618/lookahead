/**
 * The tab icons and the drill's two aids, traced from Heroicons (outline, 24px,
 * MIT) — inlined rather than installed, because a handful of paths do not
 * justify a dependency and the offline build must not fetch anything.
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      {children}
    </svg>
  )
}

/**
 * heroicons: arrows-right-left — the movement arcs on the cube.
 *
 * An icon rather than a labelled button because it sits beside the cube during
 * a rep, where a word would be one more thing to read while the clock runs.
 */
export function ArrowsIcon() {
  return (
    <Frame>
      <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </Frame>
  )
}

/**
 * heroicons: rectangle-group — before and after, side by side.
 *
 * Two panels rather than an arrow or an eye: what the control opens is a pair
 * of diagrams, and the icon says pair.
 */
export function CompareIcon() {
  return (
    <Frame>
      <path d="M3.75 6A2.25 2.25 0 016 3.75h1.5A2.25 2.25 0 019.75 6v12A2.25 2.25 0 017.5 20.25H6A2.25 2.25 0 013.75 18V6zM14.25 6A2.25 2.25 0 0116.5 3.75H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25h-1.5A2.25 2.25 0 0114.25 18V6z" />
    </Frame>
  )
}

/** heroicons: light-bulb — the hint ladder. */
export function HintIcon() {
  return (
    <Frame>
      <path d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.4 14.4 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </Frame>
  )
}

/** heroicons: bolt — training. */
export function BoltIcon() {
  return (
    <Frame>
      <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </Frame>
  )
}

/** heroicons: squares-2x2 — the case library. */
export function SquaresIcon() {
  return (
    <Frame>
      <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </Frame>
  )
}

/** heroicons: chart-bar — history and settings. */
export function ChartIcon() {
  return (
    <Frame>
      <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </Frame>
  )
}
