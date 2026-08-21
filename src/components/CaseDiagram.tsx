/**
 * The flat case diagram — the cuber's own notation for a last-layer case.
 *
 * A top-down view of the U face with the visible side stickers tabbed around
 * it, which is how every algorithm sheet has drawn these cases for decades.
 * Fast to scan, and unlike the 3D view it shows all four sides at once.
 *
 * Facelet positions are derived from the same layout the renderer uses, so a
 * diagram cannot disagree with the cube beside it.
 */

import type { Facelets } from '../cube/engine.ts'
import type { PLLArrow } from '../cube/cases.ts'

const FACE_VAR: Record<string, string> = {
  U: 'var(--face-u)',
  D: 'var(--face-d)',
  F: 'var(--face-f)',
  B: 'var(--face-b)',
  R: 'var(--face-r)',
  L: 'var(--face-l)',
}

/** Side stickers in drawing order, reading the way the diagram is laid out. */
const BACK_TABS = [47, 46, 45] // left to right above the grid
const FRONT_TABS = [18, 19, 20] // left to right below the grid
const LEFT_TABS = [36, 37, 38] // top to bottom, left of the grid
const RIGHT_TABS = [11, 10, 9] // top to bottom, right of the grid

const CELL = 20
const GAP = 2.5
const TAB = 7
const TAB_GAP = 3
const GRID = CELL * 3 + GAP * 2
const PAD = TAB + TAB_GAP + 2
const SIZE = GRID + PAD * 2

function cellXY(row: number, col: number): [number, number] {
  return [PAD + col * (CELL + GAP), PAD + row * (CELL + GAP)]
}

/** Centre of a U-layer slot, for arrow endpoints. */
function slotCentre(kind: 'corner' | 'edge', slot: number): [number, number] {
  const corners: Array<[number, number]> = [
    [0, 0],
    [0, 2],
    [2, 2],
    [2, 0],
  ]
  const edges: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 1],
    [1, 0],
  ]
  const [row, col] = (kind === 'corner' ? corners : edges)[slot]
  const [x, y] = cellXY(row, col)
  return [x + CELL / 2, y + CELL / 2]
}

export interface CaseDiagramProps {
  facelets: Facelets
  /**
   * Draw the U face as a shape rather than in colour: solid where the sticker
   * is already oriented, empty where it is not. This is how OLL is read.
   */
  mode?: 'orientation' | 'permutation'
  /** Movement arrows, for PLL. */
  arrows?: PLLArrow[]
  size?: number
  /** Accessible description. Diagrams without one are marked decorative. */
  title?: string
  className?: string
  /** Draw the two faces used for two-sided recognition brighter than the rest. */
  emphasiseTwoSided?: boolean
}

export function CaseDiagram({
  facelets,
  mode = 'permutation',
  arrows = [],
  size = 128,
  title,
  className,
  emphasiseTwoSided = false,
}: CaseDiagramProps) {
  const topFill = (index: number) => {
    if (mode === 'orientation') {
      return facelets[index] === 'U' ? 'var(--face-u)' : 'var(--face-blank)'
    }
    return FACE_VAR[facelets[index]] ?? 'var(--face-blank)'
  }

  const tabFill = (index: number) => {
    if (mode === 'orientation') {
      return facelets[index] === 'U' ? 'var(--face-u)' : 'var(--ink-ghost)'
    }
    return FACE_VAR[facelets[index]] ?? 'var(--face-blank)'
  }

  // In two-sided recognition you only ever see the front and right faces.
  const dimmed = (face: 'F' | 'R' | 'B' | 'L') =>
    emphasiseTwoSided && face !== 'F' && face !== 'R' ? 0.24 : 1

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* U face */}
      {Array.from({ length: 9 }, (_, i) => {
        const [x, y] = cellXY(Math.floor(i / 3), i % 3)
        return (
          <rect
            key={`u${i}`}
            x={x}
            y={y}
            width={CELL}
            height={CELL}
            rx={2.5}
            fill={topFill(i)}
            stroke="rgb(0 0 0 / 45%)"
            strokeWidth={0.75}
          />
        )
      })}

      {/* Back tabs */}
      <g opacity={dimmed('B')}>
        {BACK_TABS.map((index, i) => {
          const [x] = cellXY(0, i)
          return (
            <rect
              key={`b${index}`}
              x={x}
              y={PAD - TAB - TAB_GAP}
              width={CELL}
              height={TAB}
              rx={1.5}
              fill={tabFill(index)}
            />
          )
        })}
      </g>

      {/* Front tabs */}
      <g opacity={dimmed('F')}>
        {FRONT_TABS.map((index, i) => {
          const [x] = cellXY(0, i)
          return (
            <rect
              key={`f${index}`}
              x={x}
              y={PAD + GRID + TAB_GAP}
              width={CELL}
              height={TAB}
              rx={1.5}
              fill={tabFill(index)}
            />
          )
        })}
      </g>

      {/* Left tabs */}
      <g opacity={dimmed('L')}>
        {LEFT_TABS.map((index, i) => {
          const [, y] = cellXY(i, 0)
          return (
            <rect
              key={`l${index}`}
              x={PAD - TAB - TAB_GAP}
              y={y}
              width={TAB}
              height={CELL}
              rx={1.5}
              fill={tabFill(index)}
            />
          )
        })}
      </g>

      {/* Right tabs */}
      <g opacity={dimmed('R')}>
        {RIGHT_TABS.map((index, i) => {
          const [, y] = cellXY(i, 0)
          return (
            <rect
              key={`r${index}`}
              x={PAD + GRID + TAB_GAP}
              y={y}
              width={TAB}
              height={CELL}
              rx={1.5}
              fill={tabFill(index)}
            />
          )
        })}
      </g>

      {/* Movement arrows */}
      {arrows.length > 0 && (
        <g>
          <defs>
            <marker
              id="arrowhead"
              viewBox="0 0 8 8"
              refX="6"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0.5 1 L7 4 L0.5 7 z" fill="var(--ground)" />
            </marker>
          </defs>
          {arrows.map((arrow, i) => {
            const [x1, y1] = slotCentre(arrow.kind, arrow.from)
            const [x2, y2] = slotCentre(arrow.kind, arrow.to)
            // Bow the line away from the centre so opposing arrows stay legible.
            const mid = [(x1 + x2) / 2, (y1 + y2) / 2]
            const centre = PAD + GRID / 2
            const bow = 0.22
            const cx = mid[0] + (mid[0] - centre) * bow
            const cy = mid[1] + (mid[1] - centre) * bow
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                fill="none"
                stroke="var(--ground)"
                strokeWidth={2.6}
                strokeLinecap="round"
                markerEnd="url(#arrowhead)"
                opacity={0.82}
              />
            )
          })}
        </g>
      )}
    </svg>
  )
}
