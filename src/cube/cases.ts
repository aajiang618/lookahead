/**
 * OLL and PLL case definitions.
 *
 * Algorithms come from the J Perm dataset in `data/`. Every geometric property
 * below (top masks, side masks, sticker permutations, two-sided recognition
 * patterns) is COMPUTED from those algorithms by the engine at module load —
 * nothing about a case's appearance is hand-transcribed, so a diagram can never
 * disagree with the algorithm that produces it.
 */

import ollData from '../../data/OLL.json' with { type: 'json' }
import pllData from '../../data/PLL.json' with { type: 'json' }
import {
  applyAlg,
  invertAlg,
  isF2LSolved,
  isOLLSolved,
  LL_SIDE_FACELETS,
  ollSideMask,
  ollTopMask,
  SOLVED,
  type Facelets,
} from './engine.ts'

export type SideFace = 'F' | 'R' | 'B' | 'L'
export const SIDE_ORDER: SideFace[] = ['F', 'R', 'B', 'L']

export interface AlgVariant {
  alg: string
  note?: string
}

export interface OLLCase {
  id: string
  /** 1–57 */
  number: number
  name: string
  /** J Perm's shape family: Dot, Fish, Lightning, T shape, … */
  group: string
  algs: AlgVariant[]
  /** Preferred algorithm — the first one J Perm lists. */
  alg: string
  /** State with this OLL pending, first two layers solved. */
  state: Facelets
  /** Nine U-face stickers, true where the sticker already shows the U colour. */
  top: boolean[]
  /** U-coloured stickers spilling onto each side face, left to right. */
  side: Record<SideFace, boolean[]>
  /** How many U stickers are already up — 0, 1, 2, or 4. */
  orientedCorners: number
  orientedEdges: number
}

export interface PLLCase {
  id: string
  /** `Aa`, `T`, `Gc`, … */
  name: string
  /** J Perm's family: Adj corners, Diag corners, G perm, Edge perm. */
  group: string
  algs: AlgVariant[]
  alg: string
  /** State with this PLL pending: first two layers solved, top face all U. */
  state: Facelets
  /**
   * The side colours of the last layer as they appear on a solved-OLL cube,
   * per face, left to right. `F` means "this sticker is the front colour".
   */
  side: Record<SideFace, string[]>
  /** Two-sided recognition block read off the front and right faces. */
  recognition: PLLRecognition
  /** Cubies that actually move, for the arrow overlay. */
  arrows: PLLArrow[]
}

export type BlockPattern = 'headlights' | 'bar' | 'outer-pair' | 'checker'

export interface PLLRecognition {
  /** Pattern name per face, keyed the way a cuber reads it. */
  faces: Record<SideFace, BlockPattern>
  /** Human sentence describing what the front and right faces look like. */
  summary: string
}

export interface PLLArrow {
  kind: 'corner' | 'edge'
  /** Position index 0–3 around the U layer, starting at back-left, clockwise. */
  from: number
  to: number
}

// ---------------------------------------------------------------------------
// Raw dataset shape
// ---------------------------------------------------------------------------

interface RawCase {
  subset: string
  algs: Record<string, { note?: string }>
}
interface RawFile {
  cases: Record<string, RawCase>
}

function variants(raw: RawCase): AlgVariant[] {
  return Object.entries(raw.algs).map(([alg, meta]) => ({ alg, note: meta.note }))
}

// ---------------------------------------------------------------------------
// OLL
// ---------------------------------------------------------------------------

function buildOLL(): OLLCase[] {
  const raw = (ollData as unknown as RawFile).cases
  return Object.entries(raw).map(([name, entry]) => {
    const algs = variants(entry)
    const alg = algs[0].alg
    // Undoing the algorithm from solved leaves exactly this OLL on top.
    const state = applyAlg(SOLVED, invertAlg(alg))
    const top = ollTopMask(state)
    const side = ollSideMask(state)
    const number = Number(name.replace(/\D+/g, ''))
    const cornerSlots = [0, 2, 6, 8]
    const edgeSlots = [1, 3, 5, 7]
    return {
      id: `oll-${number}`,
      number,
      name,
      group: entry.subset,
      algs,
      alg,
      state,
      top,
      side,
      orientedCorners: cornerSlots.filter((i) => top[i]).length,
      orientedEdges: edgeSlots.filter((i) => top[i]).length,
    }
  })
}

export const OLL_CASES: OLLCase[] = buildOLL().sort((a, b) => a.number - b.number)
export const OLL_BY_ID = new Map(OLL_CASES.map((c) => [c.id, c]))

// ---------------------------------------------------------------------------
// PLL
// ---------------------------------------------------------------------------

/**
 * Read a face's three last-layer stickers and name the block pattern.
 * `headlights` = outer two match, middle differs. `bar` = all three match.
 * `outer-pair` = two adjacent match. `checker` = all three differ.
 */
function classifyFace(colors: string[]): BlockPattern {
  const [a, b, c] = colors
  if (a === b && b === c) return 'bar'
  if (a === c) return 'headlights'
  if (a === b || b === c) return 'outer-pair'
  return 'checker'
}

const PATTERN_LABEL: Record<BlockPattern, string> = {
  bar: 'a solid 3-bar',
  headlights: 'headlights',
  'outer-pair': 'a 2-bar',
  checker: 'no block',
}

/** Corner and edge slots around the U layer, clockwise from back-left. */
const CORNER_STICKERS: Array<[number, number]> = [
  [36, 47], // UBL: L face + B face
  [45, 11], // UBR: B face + R face
  [9, 20], // UFR: R face + F face
  [18, 38], // UFL: F face + L face
]
const EDGE_STICKERS = [46, 10, 19, 37] // UB, UR, UF, UL

function faceColorsOf(state: Facelets): Record<SideFace, string[]> {
  const out = {} as Record<SideFace, string[]>
  for (const face of SIDE_ORDER) {
    out[face] = LL_SIDE_FACELETS[face].map((i) => state[i])
  }
  return out
}

/**
 * Work out where each last-layer cubie has to travel. We compare the scrambled
 * state against solved by matching sticker colour pairs, which identifies the
 * physical cubie sitting in each slot.
 */
function computeArrows(state: Facelets): PLLArrow[] {
  const arrows: PLLArrow[] = []

  const solvedCorner = CORNER_STICKERS.map(([a, b]) => [SOLVED[a], SOLVED[b]].sort().join(''))
  CORNER_STICKERS.forEach(([a, b], slot) => {
    const key = [state[a], state[b]].sort().join('')
    const home = solvedCorner.indexOf(key)
    if (home !== -1 && home !== slot) arrows.push({ kind: 'corner', from: slot, to: home })
  })

  const solvedEdge = EDGE_STICKERS.map((i) => SOLVED[i])
  EDGE_STICKERS.forEach((i, slot) => {
    const home = solvedEdge.indexOf(state[i])
    if (home !== -1 && home !== slot) arrows.push({ kind: 'edge', from: slot, to: home })
  })

  return arrows
}

function buildPLL(): PLLCase[] {
  const raw = (pllData as unknown as RawFile).cases
  return Object.entries(raw).map(([rawName, entry]) => {
    const algs = variants(entry)
    const alg = algs[0].alg
    const state = applyAlg(SOLVED, invertAlg(alg))
    const side = faceColorsOf(state)
    const faces = {} as Record<SideFace, BlockPattern>
    for (const face of SIDE_ORDER) faces[face] = classifyFace(side[face])
    const name = rawName.replace(/\s*perm$/i, '')
    return {
      id: `pll-${name}`,
      name,
      group: entry.subset,
      algs,
      alg,
      state,
      side,
      recognition: {
        faces,
        summary: `Front shows ${PATTERN_LABEL[faces.F]}, right shows ${PATTERN_LABEL[faces.R]}.`,
      },
      arrows: computeArrows(state),
    }
  })
}

export const PLL_CASES: PLLCase[] = buildPLL().sort((a, b) => a.name.localeCompare(b.name))
export const PLL_BY_ID = new Map(PLL_CASES.map((c) => [c.id, c]))
export const PLL_BY_NAME = new Map(PLL_CASES.map((c) => [c.name, c]))

// ---------------------------------------------------------------------------
// Integrity checks — cheap enough to run at load, and they fail loudly.
// ---------------------------------------------------------------------------

export function auditCases(): string[] {
  const problems: string[] = []
  for (const c of OLL_CASES) {
    if (!isF2LSolved(c.state)) problems.push(`${c.name}: algorithm disturbs the first two layers`)
    if (isOLLSolved(c.state)) problems.push(`${c.name}: algorithm leaves nothing to orient`)
    if (!isOLLSolved(applyAlg(c.state, c.alg))) problems.push(`${c.name}: algorithm does not orient`)
  }
  for (const c of PLL_CASES) {
    if (!isF2LSolved(c.state)) problems.push(`${c.name}: algorithm disturbs the first two layers`)
    if (!isOLLSolved(c.state)) problems.push(`${c.name}: algorithm leaves the top face unoriented`)
    if (c.arrows.length === 0) problems.push(`${c.name}: nothing moves`)
  }
  if (OLL_CASES.length !== 57) problems.push(`expected 57 OLL cases, found ${OLL_CASES.length}`)
  if (PLL_CASES.length !== 21) problems.push(`expected 21 PLL cases, found ${PLL_CASES.length}`)
  return problems
}
