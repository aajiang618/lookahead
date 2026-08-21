/**
 * Drill generation.
 *
 * A drill is a cube with the first two layers solved and the last layer set up
 * so that a specific OLL is pending, and finishing that OLL leaves a specific
 * PLL. That pair is the whole point of the trainer.
 *
 * One subtlety drives the design here. Several OLL shapes are rotationally
 * symmetric (OLL 20, 21, 28 and 57 among them), so the shape alone does not
 * tell you which way round to apply the algorithm — and applying it from a
 * different angle yields a genuinely different PLL. To keep every drill's
 * answer unambiguous, the cube state is always built so the OLL sits in its
 * canonical orientation, and no turn is ever inserted ahead of it.
 *
 * Visual variety comes from `viewTurns`, which the renderer applies to the
 * CAMERA. Rotating the camera cannot change the cube, so it cannot change the
 * answer. An earlier version put a `y` rotation in the scramble instead; that
 * rotates the cube out from under the algorithm and breaks every drill, which
 * is what the exhaustive check in `scripts/verify-cases.ts` exists to catch.
 */

import {
  applyAlg,
  invertAlg,
  isF2LSolved,
  isOLLSolved,
  isSolved,
  simplifyAlg,
  SOLVED,
  type Facelets,
} from './engine.ts'
import { OLL_BY_ID, PLL_BY_ID, type OLLCase, type PLLCase } from './cases.ts'

export interface Drill {
  /** Stable id so a drill can be replayed or shared. */
  seed: number
  ollId: string
  pllId: string
  /** Move sequence that takes a solved cube to the presented state. */
  scramble: string
  /** The presented state: F2L solved, OLL pending. */
  state: Facelets
  /** State after the OLL algorithm runs — the PLL the solver must have predicted. */
  stateAfterOLL: Facelets
  /**
   * Quarter turns the CAMERA is rotated by, 0-3. This is a viewing angle, not a
   * cube move: rotating the camera varies what the drill looks like without
   * touching the state, so it can never change the answer.
   */
  viewTurns: number
  /** The OLL algorithm the solver is assumed to execute. */
  ollAlg: string
  /** AUF applied between OLL and PLL. May be empty. */
  auf: string
  pllAlg: string
  /** Full solution from the presented state. */
  solution: string
}

/** Deterministic RNG so a seed always rebuilds the same drill. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

const AUFS = ['', 'U', "U'", 'U2']

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]
}

export interface BuildOptions {
  /** Rotate the whole cube for visual variety. Safe: cannot change the answer. */
  varyAngle?: boolean
  /** Vary the AUF between OLL and PLL. Changes the setup, not the PLL's identity. */
  varyAuf?: boolean
  /**
   * The OLL algorithm the solver actually uses, when it is not the default.
   * This is not cosmetic: 26 of the 57 cases have published variants that leave
   * a DIFFERENT PLL, so predicting against the wrong algorithm teaches the
   * wrong answer. See `scripts/verify-cases.ts`.
   */
  ollAlg?: string
}

export function buildDrill(
  oll: OLLCase,
  pll: PLLCase,
  seed: number = randomSeed(),
  options: BuildOptions = {},
): Drill {
  const { varyAngle = true, varyAuf = true, ollAlg = oll.alg } = options
  const rng = mulberry32(seed)

  const auf = varyAuf ? pick(rng, AUFS) : ''
  const viewTurns = varyAngle ? Math.floor(rng() * 4) : 0

  // What the solver will do from the presented state.
  const solution = simplifyAlg([ollAlg, auf, pll.alg].filter(Boolean).join(' '))
  // Getting there from solved is simply undoing that solution.
  const scramble = invertAlg(solution)

  const state = applyAlg(SOLVED, scramble)
  const stateAfterOLL = applyAlg(state, ollAlg)

  return {
    seed,
    ollId: oll.id,
    pllId: pll.id,
    scramble,
    state,
    stateAfterOLL,
    viewTurns,
    ollAlg,
    auf,
    pllAlg: pll.alg,
    solution,
  }
}

export function buildDrillById(
  ollId: string,
  pllId: string,
  seed?: number,
  options?: BuildOptions,
): Drill {
  const oll = OLL_BY_ID.get(ollId)
  const pll = PLL_BY_ID.get(pllId)
  if (!oll) throw new Error(`Unknown OLL case "${ollId}"`)
  if (!pll) throw new Error(`Unknown PLL case "${pllId}"`)
  return buildDrill(oll, pll, seed, options)
}

/**
 * Confirm a drill is internally consistent. Cheap, and worth running on every
 * generated drill: a malformed drill would silently teach the wrong answer.
 */
export function validateDrill(drill: Drill): string[] {
  const problems: string[] = []
  if (!isF2LSolved(drill.state)) problems.push('first two layers are not solved')
  if (isOLLSolved(drill.state)) problems.push('there is no OLL left to do')
  if (!isOLLSolved(drill.stateAfterOLL)) problems.push('the OLL algorithm does not orient the top')
  if (!isSolved(applyAlg(drill.state, drill.solution))) problems.push('the solution does not solve')
  return problems
}

/**
 * The PLL that a given post-OLL state actually shows, found by matching side
 * sticker patterns across all four AUF positions. Used to double-check a drill
 * and to grade free-scramble mode, where no case was chosen up front.
 */
export function identifyPLL(state: Facelets, candidates: PLLCase[]): PLLCase | null {
  const signature = (s: Facelets) =>
    [9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47].map((i) => s[i]).join('')

  for (let turns = 0; turns < 4; turns++) {
    const rotated = applyAlg(state, 'U '.repeat(turns).trim() || '')
    const sig = signature(rotated)
    const hit = candidates.find((c) => signature(c.state) === sig)
    if (hit) return hit
  }
  return null
}

/** A plain random-move scramble, for the free-scramble surface. */
export function randomScramble(length = 22, seed: number = randomSeed()): string {
  const rng = mulberry32(seed)
  const faces = ['U', 'D', 'L', 'R', 'F', 'B']
  const suffixes = ['', "'", '2']
  const axisOf: Record<string, number> = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 }
  const out: string[] = []
  let lastFace = ''
  let lastAxis = -1
  while (out.length < length) {
    const face = pick(rng, faces)
    if (face === lastFace) continue
    // Avoid three consecutive same-axis turns, which collapse.
    if (axisOf[face] === lastAxis && out.length >= 2) {
      const prev = out[out.length - 2][0]
      if (axisOf[prev] === lastAxis) continue
    }
    out.push(face + pick(rng, suffixes))
    lastFace = face
    lastAxis = axisOf[face]
  }
  return out.join(' ')
}
