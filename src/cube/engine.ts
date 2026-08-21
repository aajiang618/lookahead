/**
 * 3x3x3 facelet engine.
 *
 * State is 54 facelets in Kociemba order: U(0-8) R(9-17) F(18-26) D(27-35) L(36-44) B(45-53)
 *
 *              U0 U1 U2
 *              U3 U4 U5
 *              U6 U7 U8
 *   L36 L37 L38  F18 F19 F20  R9  R10 R11  B45 B46 B47
 *   L39 L40 L41  F21 F22 F23  R12 R13 R14  B48 B49 B50
 *   L42 L43 L44  F24 F25 F26  R15 R16 R17  B51 B52 B53
 *              D27 D28 D29
 *              D30 D31 D32
 *              D33 D34 D35
 *
 * Row 0 of U (0,1,2) is the BACK row; row 2 (6,7,8) is the FRONT row.
 * Row 0 of D (27,28,29) is the FRONT row; row 2 (33,34,35) is the BACK row.
 * B is drawn as seen from the front through the cube: B47 is adjacent to L, B45 adjacent to R.
 *
 * Every permutation below was derived by tracing the physical ring of each layer.
 * `scripts/verify-cases.ts` proves them: order-4 turns, sexy-move order 6,
 * commutator identities, and the fact that all 78 shipped algorithms leave the
 * first two layers untouched.
 */

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'
export const FACE_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B']

/** A state is 54 face letters. Index i holds the color currently shown at facelet i. */
export type Facelets = string

export const SOLVED: Facelets =
  'UUUUUUUUU' + 'RRRRRRRRR' + 'FFFFFFFFF' + 'DDDDDDDDD' + 'LLLLLLLLL' + 'BBBBBBBBB'

/** Cycles are written in motion order: a -> b -> c -> d -> a. */
type Cycle = readonly number[]

const FACE_CYCLES: Record<Face, Cycle[]> = {
  // Top layer turns clockwise seen from above: F -> L -> B -> R -> F
  U: [
    [0, 2, 8, 6],
    [1, 5, 7, 3],
    [18, 36, 45, 9],
    [19, 37, 46, 10],
    [20, 38, 47, 11],
  ],
  // Right layer turns clockwise seen from the right: F -> U -> B -> D -> F
  R: [
    [9, 11, 17, 15],
    [10, 14, 16, 12],
    [20, 2, 51, 29],
    [23, 5, 48, 32],
    [26, 8, 45, 35],
  ],
  // Front layer turns clockwise seen from the front: U -> R -> D -> L -> U
  F: [
    [18, 20, 26, 24],
    [19, 23, 25, 21],
    [6, 9, 29, 44],
    [7, 12, 28, 41],
    [8, 15, 27, 38],
  ],
  // Bottom layer turns clockwise seen from below: F -> R -> B -> L -> F
  D: [
    [27, 29, 35, 33],
    [28, 32, 34, 30],
    [24, 15, 51, 42],
    [25, 16, 52, 43],
    [26, 17, 53, 44],
  ],
  // Left layer turns clockwise seen from the left: F -> D -> B -> U -> F
  L: [
    [36, 38, 44, 42],
    [37, 41, 43, 39],
    [18, 27, 53, 0],
    [21, 30, 50, 3],
    [24, 33, 47, 6],
  ],
  // Back layer turns clockwise seen from behind: U -> L -> D -> R -> U
  B: [
    [45, 47, 53, 51],
    [46, 50, 52, 48],
    [0, 42, 35, 11],
    [1, 39, 34, 14],
    [2, 36, 33, 17],
  ],
}

/** Middle-slice turns. M follows L, E follows D, S follows F — the usual convention. */
const SLICE_CYCLES: Record<'M' | 'E' | 'S', Cycle[]> = {
  // M is the layer between L and R, turning with L.
  M: [
    [19, 28, 52, 1],
    [22, 31, 49, 4],
    [25, 34, 46, 7],
  ],
  // E is the layer between U and D, turning with D.
  E: [
    [21, 12, 48, 39],
    [22, 13, 49, 40],
    [23, 14, 50, 41],
  ],
  // S is the layer between F and B, turning with F.
  S: [
    [3, 10, 32, 43],
    [4, 13, 31, 40],
    [5, 16, 30, 37],
  ],
}

function permFromCycles(cycles: Cycle[]): number[] {
  // perm[dst] = src — the facelet that moves INTO position dst.
  const perm = Array.from({ length: 54 }, (_, i) => i)
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length; i++) {
      const src = cycle[i]
      const dst = cycle[(i + 1) % cycle.length]
      perm[dst] = src
    }
  }
  return perm
}

function compose(first: number[], second: number[]): number[] {
  // Apply `first`, then `second`.
  return second.map((src) => first[src])
}

function invert(perm: number[]): number[] {
  const out = new Array<number>(54)
  for (let dst = 0; dst < 54; dst++) out[perm[dst]] = dst
  return out
}

function repeat(perm: number[], times: number): number[] {
  let out = Array.from({ length: 54 }, (_, i) => i)
  for (let i = 0; i < times; i++) out = compose(out, perm)
  return out
}

const BASE: Record<string, number[]> = {}
for (const face of FACE_ORDER) BASE[face] = permFromCycles(FACE_CYCLES[face])
for (const slice of ['M', 'E', 'S'] as const) BASE[slice] = permFromCycles(SLICE_CYCLES[slice])

// Rotations: x follows R, y follows U, z follows F.
BASE.x = compose(compose(BASE.R, invert(BASE.L)), invert(BASE.M))
BASE.y = compose(compose(BASE.U, invert(BASE.D)), invert(BASE.E))
BASE.z = compose(compose(BASE.F, invert(BASE.B)), BASE.S)

// Wide turns: two layers together.
BASE.r = compose(BASE.R, invert(BASE.M))
BASE.l = compose(BASE.L, BASE.M)
BASE.u = compose(BASE.U, invert(BASE.E))
BASE.d = compose(BASE.D, BASE.E)
BASE.f = compose(BASE.F, BASE.S)
BASE.b = compose(BASE.B, invert(BASE.S))

const MOVE_TOKEN = /^([URFDLBMESxyzrlufdb])(w?)(2'?|3'?|')?$/

export interface ParsedMove {
  /** Canonical base token after widening, e.g. `Rw` becomes `r`. */
  base: string
  /** 1 = clockwise, 2 = half turn, 3 = counter-clockwise. */
  amount: number
  /** The move as it should be displayed. */
  label: string
}

const WIDE_EQUIVALENT: Record<string, string> = { U: 'u', R: 'r', F: 'f', D: 'd', L: 'l', B: 'b' }

/**
 * Parse standard notation. Accepts `R`, `R'`, `R2`, `Rw`, `r`, `M'`, `x2`,
 * curly apostrophes, and bracketing parens/spacing used in published algs.
 */
export function parseAlg(alg: string): ParsedMove[] {
  const cleaned = alg.replace(/[()[\]]/g, ' ').replace(/’/g, "'").trim()
  if (!cleaned) return []
  const moves: ParsedMove[] = []
  for (const token of cleaned.split(/\s+/)) {
    const match = MOVE_TOKEN.exec(token)
    if (!match) throw new Error(`Unrecognised move "${token}" in "${alg}"`)
    const [, letter, wide, suffixRaw] = match
    const suffix = suffixRaw === '’' ? "'" : suffixRaw
    let base = letter
    if (wide === 'w') {
      const widened = WIDE_EQUIVALENT[letter]
      if (!widened) throw new Error(`"${letter}w" is not a valid wide turn`)
      base = widened
    }
    // `R'` and `R3` both mean three quarter-turns; `R2'` is just `R2`.
    const amount = suffix?.startsWith('2') ? 2 : suffix?.startsWith('3') || suffix === "'" ? 3 : 1
    moves.push({ base, amount, label: token })
  }
  return moves
}

/** The raw facelet permutation of a base move, for tooling and verification. */
export function movePermutation(base: string, amount: number): number[] {
  const table = BASE[base]
  if (!table) throw new Error(`No permutation for "${base}"`)
  return repeat(table, ((amount % 4) + 4) % 4)
}

const PERM_CACHE = new Map<string, number[]>()

function permForMove(move: ParsedMove): number[] {
  const key = `${move.base}${move.amount}`
  const cached = PERM_CACHE.get(key)
  if (cached) return cached
  const base = BASE[move.base]
  if (!base) throw new Error(`No permutation for "${move.base}"`)
  const perm = repeat(base, move.amount)
  PERM_CACHE.set(key, perm)
  return perm
}

export function applyMove(state: Facelets, move: ParsedMove): Facelets {
  const perm = permForMove(move)
  let out = ''
  for (let i = 0; i < 54; i++) out += state[perm[i]]
  return out
}

/**
 * The facelet permutation of a whole sequence, as `perm[destination] = source`.
 * Used to work out where a piece travels, rather than what colour ends up where.
 */
export function algPermutation(alg: string | ParsedMove[]): number[] {
  const moves = typeof alg === 'string' ? parseAlg(alg) : alg
  let out = Array.from({ length: 54 }, (_, i) => i)
  for (const move of moves) out = compose(out, permForMove(move))
  return out
}

/** Invert a `perm[destination] = source` table into `dest[source] = destination`. */
export function destinationTable(perm: number[]): number[] {
  const out = new Array<number>(54)
  for (let dst = 0; dst < 54; dst++) out[perm[dst]] = dst
  return out
}

export function applyAlg(state: Facelets, alg: string | ParsedMove[]): Facelets {
  const moves = typeof alg === 'string' ? parseAlg(alg) : alg
  let out = state
  for (const move of moves) out = applyMove(out, move)
  return out
}

/** The move sequence that undoes `alg`, written in standard notation. */
export function invertAlg(alg: string): string {
  const moves = parseAlg(alg)
  const out: string[] = []
  for (let i = moves.length - 1; i >= 0; i--) {
    const { base, amount } = moves[i]
    const suffix = amount === 1 ? "'" : amount === 2 ? '2' : ''
    out.push(`${base}${suffix}`)
  }
  return out.join(' ')
}

/** Collapse `R R'`, `U U U`, and other adjacent same-axis noise out of a sequence. */
export function simplifyAlg(alg: string): string {
  const moves = parseAlg(alg)
  const stack: ParsedMove[] = []
  for (const move of moves) {
    const top = stack[stack.length - 1]
    if (top && top.base === move.base) {
      const amount = (top.amount + move.amount) % 4
      stack.pop()
      if (amount !== 0) stack.push({ ...top, amount, label: '' })
    } else {
      stack.push({ ...move, label: '' })
    }
  }
  return stack
    .map(({ base, amount }) => `${base}${amount === 2 ? '2' : amount === 3 ? "'" : ''}`)
    .join(' ')
}

// ---------------------------------------------------------------------------
// Inspection helpers
// ---------------------------------------------------------------------------

/** Facelets belonging to the first two layers — everything the last layer must not disturb. */
export const F2L_FACELETS: number[] = (() => {
  const indices: number[] = []
  for (let i = 27; i <= 35; i++) indices.push(i) // all of D
  // Middle and bottom rows of every side face.
  for (const start of [9, 18, 36, 45]) for (let i = start + 3; i < start + 9; i++) indices.push(i)
  return indices
})()

/** Facelets of the last layer's side stickers, grouped by face, top row only. */
export const LL_SIDE_FACELETS: Record<'F' | 'R' | 'B' | 'L', [number, number, number]> = {
  F: [18, 19, 20],
  R: [9, 10, 11],
  B: [45, 46, 47],
  L: [36, 37, 38],
}

export function isF2LSolved(state: Facelets): boolean {
  return F2L_FACELETS.every((i) => state[i] === SOLVED[i])
}

/**
 * Like `isF2LSolved`, but tolerant of a net whole-cube rotation about the
 * vertical axis. Some published algorithms contain an uncompensated `y`, which
 * leaves the first two layers perfectly intact while relabelling the side
 * faces. Comparing each facelet to its own face centre sees through that.
 */
export function isF2LIntact(state: Facelets): boolean {
  return F2L_FACELETS.every((i) => state[i] === state[Math.floor(i / 9) * 9 + 4])
}

export function isOLLSolved(state: Facelets): boolean {
  for (let i = 0; i < 9; i++) if (state[i] !== 'U') return false
  return true
}

export function isSolved(state: Facelets): boolean {
  // A solve may end rotated by an AUF, so compare each face to its own centre.
  for (let f = 0; f < 6; f++) {
    const centre = state[f * 9 + 4]
    for (let i = 0; i < 9; i++) if (state[f * 9 + i] !== centre) return false
  }
  return true
}

/** The nine U-face stickers, `true` where the sticker is the U colour. */
export function ollTopMask(state: Facelets): boolean[] {
  return Array.from({ length: 9 }, (_, i) => state[i] === 'U')
}

/**
 * The U-colour stickers that spill onto the side faces, in reading order
 * per face (left to right as drawn on a top-down diagram).
 */
export function ollSideMask(state: Facelets): Record<'F' | 'R' | 'B' | 'L', boolean[]> {
  const out = {} as Record<'F' | 'R' | 'B' | 'L', boolean[]>
  for (const [face, indices] of Object.entries(LL_SIDE_FACELETS)) {
    out[face as 'F'] = indices.map((i) => state[i] === 'U')
  }
  return out
}
