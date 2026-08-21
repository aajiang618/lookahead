/**
 * Piece tracking — how an OLL algorithm moves the last layer around.
 *
 * This is the heart of predicting PLL before the OLL is finished, and it rests
 * on one fact that is easy to miss:
 *
 *   An OLL algorithm applies a FIXED permutation to the last-layer pieces.
 *
 * It does not matter which case you are looking at or what the side stickers
 * say — running "R U R' U' R' F R F'" always sends the piece in one slot to the
 * same other slot. The only thing that varies between solves is which pieces
 * are sitting in those slots when you start.
 *
 * So predicting the PLL is not guesswork. It is: read where a couple of pieces
 * are now, apply the algorithm's known permutation, and you know where they
 * will be. That permutation is computed here, per algorithm, from the engine —
 * never transcribed.
 */

import { algPermutation, destinationTable, parseAlg, type ParsedMove } from './engine.ts'

/** Last-layer corner slots, clockwise from back-left. */
export const CORNER_SLOTS = ['UBL', 'UBR', 'UFR', 'UFL'] as const
/** Last-layer edge slots, clockwise from back. */
export const EDGE_SLOTS = ['UB', 'UR', 'UF', 'UL'] as const

export type CornerSlot = (typeof CORNER_SLOTS)[number]
export type EdgeSlot = (typeof EDGE_SLOTS)[number]

/** Every facelet belonging to each corner slot: the U sticker and both sides. */
export const CORNER_SLOT_FACELETS: number[][] = [
  [0, 36, 47], // UBL: U, L, B
  [2, 45, 11], // UBR: U, B, R
  [8, 9, 20], // UFR: U, R, F
  [6, 18, 38], // UFL: U, F, L
]

export const EDGE_SLOT_FACELETS: number[][] = [
  [1, 46], // UB
  [5, 10], // UR
  [7, 19], // UF
  [3, 37], // UL
]

/** Human-friendly names for the pieces, the way a cuber would say them. */
export const CORNER_LABELS: Record<CornerSlot, string> = {
  UBL: 'back-left corner',
  UBR: 'back-right corner',
  UFR: 'front-right corner',
  UFL: 'front-left corner',
}
export const EDGE_LABELS: Record<EdgeSlot, string> = {
  UB: 'back edge',
  UR: 'right edge',
  UF: 'front edge',
  UL: 'left edge',
}

function slotContaining(facelet: number, slots: number[][]): number {
  return slots.findIndex((list) => list.includes(facelet))
}

export interface PieceMap {
  /** `corners[i]` is the slot the piece starting in corner slot `i` ends in. */
  corners: number[]
  /** `edges[i]` is the slot the piece starting in edge slot `i` ends in. */
  edges: number[]
  /** True when nothing moves — the algorithm only twists and flips in place. */
  cornersFixed: boolean
  edgesFixed: boolean
  /** Cycle notation over slot indices, e.g. [[0,2,1]] for a 3-cycle. */
  cornerCycles: number[][]
  edgeCycles: number[][]
}

/**
 * Where each last-layer piece ends up after the algorithm runs.
 * Slots are indices into CORNER_SLOTS / EDGE_SLOTS.
 */
export function pieceMapOf(alg: string | ParsedMove[]): PieceMap {
  const dest = destinationTable(algPermutation(alg))

  const follow = (slots: number[][]) =>
    slots.map((facelets) => {
      // Any sticker of the piece identifies it; take the first that lands
      // somewhere we recognise. Last-layer pieces stay in the last layer under
      // an OLL algorithm, so one of them always does.
      for (const facelet of facelets) {
        const landed = slotContaining(dest[facelet], slots)
        if (landed !== -1) return landed
      }
      return -1
    })

  const corners = follow(CORNER_SLOT_FACELETS)
  const edges = follow(EDGE_SLOT_FACELETS)

  return {
    corners,
    edges,
    cornersFixed: corners.every((to, from) => to === from),
    edgesFixed: edges.every((to, from) => to === from),
    cornerCycles: cyclesOf(corners),
    edgeCycles: cyclesOf(edges),
  }
}

/** Decompose a permutation into its non-trivial cycles. */
export function cyclesOf(map: number[]): number[][] {
  const seen = new Set<number>()
  const cycles: number[][] = []
  for (let start = 0; start < map.length; start++) {
    if (seen.has(start) || map[start] === start) continue
    const cycle: number[] = []
    let at = start
    while (!seen.has(at)) {
      seen.add(at)
      cycle.push(at)
      at = map[at]
    }
    if (cycle.length > 1) cycles.push(cycle)
  }
  return cycles
}

/** Plain-language summary of what an algorithm does to the last layer. */
export function describePieceMap(map: PieceMap): string {
  const parts: string[] = []
  const name = (cycle: number[], labels: readonly string[]) =>
    cycle.map((i) => labels[i]).join(' → ') + ` → ${labels[cycle[0]]}`

  if (map.cornersFixed) {
    parts.push('Corners stay put — only their twist changes.')
  } else {
    for (const cycle of map.cornerCycles) {
      parts.push(
        cycle.length === 2
          ? `Corners ${CORNER_SLOTS[cycle[0]]} and ${CORNER_SLOTS[cycle[1]]} swap.`
          : `Corners cycle ${name(cycle, CORNER_SLOTS)}.`,
      )
    }
  }

  if (map.edgesFixed) {
    parts.push('Edges stay put — only their flip changes.')
  } else {
    for (const cycle of map.edgeCycles) {
      parts.push(
        cycle.length === 2
          ? `Edges ${EDGE_SLOTS[cycle[0]]} and ${EDGE_SLOTS[cycle[1]]} swap.`
          : `Edges cycle ${name(cycle, EDGE_SLOTS)}.`,
      )
    }
  }

  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Step-by-step tracking
// ---------------------------------------------------------------------------

export interface TrackStep {
  /** Move just played, or null for the starting position. */
  move: string | null
  /** Index into the algorithm, -1 for the start. */
  index: number
  /** Where each tracked facelet currently is. */
  positions: number[]
}

/**
 * Follow a set of facelets move by move. The renderer highlights
 * `positions` at each step, so a solver can literally watch the piece they are
 * meant to be tracking travel through the algorithm.
 */
export function trackFacelets(alg: string, facelets: number[]): TrackStep[] {
  const moves = parseAlg(alg)
  const steps: TrackStep[] = [{ move: null, index: -1, positions: [...facelets] }]

  let current = [...facelets]
  for (let i = 0; i < moves.length; i++) {
    const dest = destinationTable(algPermutation([moves[i]]))
    current = current.map((p) => dest[p])
    steps.push({ move: moves[i].label, index: i, positions: [...current] })
  }
  return steps
}

/** The facelets of one last-layer piece, for handing to `trackFacelets`. */
export function faceletsOfSlot(kind: 'corner' | 'edge', slot: number): number[] {
  return kind === 'corner' ? CORNER_SLOT_FACELETS[slot] : EDGE_SLOT_FACELETS[slot]
}

/**
 * The pieces worth watching for a given algorithm: one corner and one edge that
 * actually move. Tracking a piece that stays put teaches nothing, and following
 * all eight at once is not a thing anyone can do at speed.
 */
export function suggestedTracking(map: PieceMap): { corner: number; edge: number } {
  const corner = map.corners.findIndex((to, from) => to !== from)
  const edge = map.edges.findIndex((to, from) => to !== from)
  return {
    // Fall back to the front-right pair, which is where the eye already is
    // during most last-layer algorithms.
    corner: corner === -1 ? 2 : corner,
    edge: edge === -1 ? 2 : edge,
  }
}
