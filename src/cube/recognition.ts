/**
 * Recognition tips — what to look at, and what it tells you.
 *
 * Everything here is computed from the cube. Three findings drive the design,
 * each established by `scripts/explore-recognition.ts` and locked down by
 * `scripts/verify-cases.ts`:
 *
 *  1. Every one of the 57 OLL cases is unambiguous from the U face plus the
 *     front and right faces. Two-sided prediction always works — you never
 *     have to turn the cube to know what is coming.
 *  2. The corner permutation class and the edge permutation class together
 *     narrow the 21 PLLs to between one and three candidates. This is the same
 *     split cubers already use, and it falls out of the maths rather than
 *     being asserted.
 *  3. For 20 of the 57 algorithms, knowing only the STARTING corner class is
 *     not enough to know the finishing class — it depends which specific
 *     corners are where. Those cases get the piece-by-piece route instead of a
 *     shortcut that would be wrong.
 */

import { applyAlg, invertAlg, simplifyAlg, SOLVED, type Facelets } from './engine.ts'
import { PLL_CASES, type OLLCase, type PLLCase } from './cases.ts'
import {
  CORNER_SLOT_FACELETS,
  CORNER_SLOTS,
  describePieceMap,
  EDGE_SLOT_FACELETS,
  EDGE_SLOTS,
  pieceMapOf,
  type PieceMap,
} from './tracking.ts'

// ---------------------------------------------------------------------------
// Permutation classes
// ---------------------------------------------------------------------------

export type CornerClass = 'solved' | 'adjacent' | 'diagonal' | 'double' | 'cycle'
export type EdgeClass =
  | 'solved'
  | '3-cycle'
  | 'adjacent pair'
  | 'opposite pair'
  | 'double adjacent'
  | 'double opposite'
  /** No real PLL produces this; kept so the classifier never has to lie. */
  | '4-cycle'

const rotate = (n: number) => (slot: number) => (slot + n) % 4

/**
 * Absorb an AUF into the arrangement.
 *
 * Turning the U layer moves the pieces but not their home slots, so a piece
 * that was in slot `i` and belongs at `perm[i]` is afterwards in slot `r(i)`
 * and still belongs at `perm[i]`. The new arrangement is therefore
 * `perm ∘ r` — composed on the RIGHT. Composing on the left instead builds a
 * different coset, and in S4 those are genuinely different sets, which quietly
 * misclassifies every three-cycle.
 */
const applyRotation = (perm: number[], n: number) => perm.map((_, from) => perm[rotate(n)(from)])
const isIdentity = (p: number[]) => p.every((to, from) => to === from)

/** The two slots exchanged, if the permutation is a single swap. */
function singleSwap(p: number[]): [number, number] | null {
  const moved = p.map((to, from) => [from, to] as const).filter(([f, t]) => f !== t)
  if (moved.length !== 2) return null
  const [[a, b], [c, d]] = moved
  return a === d && b === c ? [a, b] : null
}

/** Number of slots a permutation displaces. */
const displaced = (p: number[]) => p.filter((to, from) => to !== from).length

const isDoubleSwap = (p: number[]) => displaced(p) === 4 && p.every((to, from) => p[to] === from)

function cornerShape(p: number[]): CornerClass {
  if (isIdentity(p)) return 'solved'
  const swap = singleSwap(p)
  if (swap) return Math.abs(swap[0] - swap[1]) === 2 ? 'diagonal' : 'adjacent'
  if (isDoubleSwap(p)) return 'double'
  return 'cycle'
}

function edgeShape(p: number[]): EdgeClass {
  if (isIdentity(p)) return 'solved'
  const swap = singleSwap(p)
  if (swap) return Math.abs(swap[0] - swap[1]) === 2 ? 'opposite pair' : 'adjacent pair'
  if (displaced(p) === 3) return '3-cycle'
  if (isDoubleSwap(p)) return p[0] === 2 ? 'double opposite' : 'double adjacent'
  return '4-cycle'
}

/** How complicated a permutation is to describe. Lower is simpler. */
function complexity(p: number[]): number {
  if (isIdentity(p)) return 0
  if (singleSwap(p)) return 1
  if (isDoubleSwap(p)) return 2
  if (displaced(p) === 3) return 2
  return 3
}

/**
 * Classify a last-layer arrangement.
 *
 * Corners and edges must be quotiented by the SAME rotation, because an AUF
 * turns the whole layer at once. Classifying them independently lets each pick
 * its own flattering angle, and then H perm — whose edge permutation is
 * literally identical to a U2 turn — reads as "edges already solved".
 *
 * Which of the four rotations counts as canonical is a real choice. Picking the
 * one that simplifies the CORNERS alone breaks E perm: its corners become a
 * single diagonal swap, but its perfectly solved edges then read as a
 * four-cycle. So the score is the simplicity of the PAIR, with corners breaking
 * ties. That reproduces the conventional descriptions: E is a double corner
 * swap with solved edges, H is solved corners with both opposite edges swapped.
 */
export function classifyArrangement(
  corners: number[],
  edges: number[],
): { corners: CornerClass; edges: EdgeClass; rotation: number } {
  let best = { corners: 'cycle' as CornerClass, edges: '4-cycle' as EdgeClass, rotation: 0 }
  let bestScore = [Infinity, Infinity]

  for (let r = 0; r < 4; r++) {
    const c = applyRotation(corners, r)
    const e = applyRotation(edges, r)
    const score = [complexity(c) + complexity(e), complexity(c)]
    if (score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
      bestScore = score
      best = { corners: cornerShape(c), edges: edgeShape(e), rotation: r }
    }
  }
  return best
}

export function cornerClassOf(perm: number[]): CornerClass {
  return classifyArrangement(perm, [0, 1, 2, 3]).corners
}

/**
 * The permutation a PLL case presents.
 *
 * Note there is no inversion here, which is easy to get wrong. A PLL algorithm
 * solves its own case, so if the algorithm carries the piece in slot `i` to
 * slot `map[i]`, then the piece sitting in slot `i` is precisely the one that
 * belongs at `map[i]`. The algorithm's piece map IS the case's arrangement.
 */
export function classesOfPll(pll: PLLCase): { corners: CornerClass; edges: EdgeClass } {
  const map = pieceMapOf(pll.alg)
  const { corners, edges } = classifyArrangement(map.corners, map.edges)
  return { corners, edges }
}

const PLL_CLASS_INDEX: Array<{ pll: PLLCase; corners: CornerClass; edges: EdgeClass }> =
  PLL_CASES.map((pll) => ({ pll, ...classesOfPll(pll) }))

/** Which PLLs remain once you know the corner and edge classes. */
export function candidatesFor(corners: CornerClass, edges: EdgeClass): PLLCase[] {
  return PLL_CLASS_INDEX.filter((e) => e.corners === corners && e.edges === edges).map((e) => e.pll)
}

export const CORNER_CLASS_LABEL: Record<CornerClass, string> = {
  solved: 'corners already permuted',
  adjacent: 'two adjacent corners swapped',
  diagonal: 'two diagonal corners swapped',
  double: 'both corner pairs swapped',
  cycle: 'three corners cycling',
}

export const EDGE_CLASS_LABEL: Record<EdgeClass, string> = {
  solved: 'edges already permuted',
  '3-cycle': 'a three-edge cycle',
  'adjacent pair': 'two adjacent edges swapped',
  'opposite pair': 'two opposite edges swapped',
  'double adjacent': 'both adjacent edge pairs swapped',
  'double opposite': 'both opposite edge pairs swapped',
  '4-cycle': 'a four-edge cycle',
}

// ---------------------------------------------------------------------------
// What is visible before the algorithm
// ---------------------------------------------------------------------------

/** Faces a solver can see without turning the cube: the top, front and right. */
export const TWO_SIDED_FACELETS = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, // U
  9, 10, 11, // R top row
  18, 19, 20, // F top row
])

export type FaceName = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'

export function faceOf(facelet: number): FaceName {
  return (['U', 'R', 'F', 'D', 'L', 'B'] as FaceName[])[Math.floor(facelet / 9)]
}

const FACE_WORD: Record<FaceName, string> = {
  U: 'top',
  R: 'right',
  F: 'front',
  D: 'bottom',
  L: 'left',
  B: 'back',
}

export interface SlotVisibility {
  kind: 'corner' | 'edge'
  slot: number
  name: string
  /** Facelets carrying an identifying (non-U) colour that the solver can see. */
  visible: Array<{ facelet: number; face: FaceName; where: string }>
  /** True when nothing identifies this piece from the two-sided view. */
  hidden: boolean
  /** Where this piece ends up after the algorithm. */
  destination: number
  destinationName: string
  moves: boolean
}

function visibilityFor(
  state: Facelets,
  kind: 'corner' | 'edge',
  slot: number,
  map: PieceMap,
): SlotVisibility {
  const facelets = kind === 'corner' ? CORNER_SLOT_FACELETS[slot] : EDGE_SLOT_FACELETS[slot]
  const names = kind === 'corner' ? CORNER_SLOTS : EDGE_SLOTS
  const destination = kind === 'corner' ? map.corners[slot] : map.edges[slot]

  const visible = facelets
    .filter((f) => TWO_SIDED_FACELETS.has(f) && state[f] !== 'U')
    .map((f) => ({ facelet: f, face: faceOf(f), where: FACE_WORD[faceOf(f)] }))

  return {
    kind,
    slot,
    name: names[slot],
    visible,
    hidden: visible.length === 0,
    destination,
    destinationName: names[destination],
    moves: destination !== slot,
  }
}

// ---------------------------------------------------------------------------
// Corner-class shortcut, where it is valid
// ---------------------------------------------------------------------------

/*
 * There was a "corner class in, corner class out" shortcut here. It has been
 * removed rather than fixed. It was already invalid for 20 of the 57
 * algorithms, and once classification became joint over corners and edges — as
 * it must be, since one AUF turns both — a corner-only outcome table stopped
 * being a coherent idea at all. What replaces it is exact and always true:
 * follow the actual pieces, then read the finished classes.
 */

// ---------------------------------------------------------------------------
// The pieces you actually have to read
// ---------------------------------------------------------------------------

const AUFS = ['', 'U', "U'", 'U2']

export interface PieceRef {
  kind: 'corner' | 'edge'
  slot: number
}

/** Convenience order: start where the eye already is and work backwards. */
const CONVENIENCE = [2, 1, 3, 0]

const necessaryCache = new Map<string, PieceRef[]>()

/**
 * The smallest set of last-layer pieces whose identities pin down the answer.
 *
 * Found by exhaustive search over every subset of the readable pieces, checked
 * against all 21 outcomes at all four AUFs. The answer is consistently five —
 * three corners and two edges — which means three of the eight pieces can
 * always be ignored: a permutation of four is fixed once you know three of
 * them, and the AUF absorbs one more degree of freedom.
 *
 * Ties are broken toward the front-right, so the set you are asked to read is
 * the one already under your eyes.
 */
export function necessaryPieces(oll: OLLCase, alg: string): PieceRef[] {
  const key = `${oll.id}|${alg}`
  const cached = necessaryCache.get(key)
  if (cached) return cached

  const states = outcomeStates(alg)
  const pieces: Array<PieceRef & { facelets: number[] }> = [
    ...[0, 1, 2, 3].map((slot) => ({ kind: 'corner' as const, slot, facelets: CORNER_SLOT_FACELETS[slot] })),
    ...[0, 1, 2, 3].map((slot) => ({ kind: 'edge' as const, slot, facelets: EDGE_SLOT_FACELETS[slot] })),
  ]

  const readable = (p: (typeof pieces)[number]) =>
    p.facelets.filter((f) => TWO_SIDED_FACELETS.has(f) && oll.state[f] !== 'U')

  const usable = pieces
    .filter((p) => readable(p).length > 0)
    .sort((a, b) => CONVENIENCE.indexOf(a.slot) - CONVENIENCE.indexOf(b.slot))

  const determines = (subset: typeof usable) => {
    const facelets = subset.flatMap(readable)
    const seen = new Map<string, string>()
    for (const { label, state } of states) {
      const sig = facelets.map((f) => state[f]).join('')
      const prev = seen.get(sig)
      if (prev !== undefined && prev !== label) return false
      seen.set(sig, label)
    }
    return true
  }

  let answer = usable.map(({ kind, slot }) => ({ kind, slot }))
  outer: for (let size = 1; size <= usable.length; size++) {
    const combos: Array<typeof usable> = []
    const walk = (start: number, acc: typeof usable) => {
      if (acc.length === size) {
        combos.push([...acc])
        return
      }
      for (let i = start; i < usable.length; i++) walk(i + 1, [...acc, usable[i]])
    }
    walk(0, [])
    for (const combo of combos) {
      if (determines(combo)) {
        answer = combo.map(({ kind, slot }) => ({ kind, slot }))
        break outer
      }
    }
  }

  necessaryCache.set(key, answer)
  return answer
}

const outcomeCache = new Map<string, Array<{ label: string; state: Facelets }>>()

/** Every state this algorithm can be facing, labelled by the PLL it resolves to. */
function outcomeStates(alg: string): Array<{ label: string; state: Facelets }> {
  const cached = outcomeCache.get(alg)
  if (cached) return cached
  const out: Array<{ label: string; state: Facelets }> = []
  for (const pll of PLL_CASES) {
    for (const auf of AUFS) {
      const solution = simplifyAlg([alg, auf, pll.alg].filter(Boolean).join(' '))
      out.push({ label: pll.name, state: applyAlg(SOLVED, invertAlg(solution)) })
    }
  }
  outcomeCache.set(alg, out)
  return out
}

/**
 * The slots you actually read when recognising a PLL two-sided: the three
 * corners and two edges whose stickers face front or right.
 *
 * Worth noting that the exhaustive minimal-set search in `necessaryPieces`
 * arrives at exactly these five from an entirely different direction — it knows
 * nothing about which faces you can see, only about which readings distinguish
 * the outcomes. Two independent derivations landing on the same five pieces is
 * a good sign both are right.
 */
export const TWO_SIDED_CORNER_SLOTS = [1, 2, 3] // UBR, UFR, UFL
export const TWO_SIDED_EDGE_SLOTS = [1, 2] // UR, UF

export interface MovementArrow {
  kind: 'corner' | 'edge'
  from: number
  to: number
  /** Drawn boldly: this is a piece you actually have to read. */
  emphasis: boolean
}

/**
 * The movements that matter for two-sided recognition.
 *
 * Pointing INTO the front-right slots rather than out of them, which is the
 * direction the question is actually asked in: you are not wondering where the
 * piece in front of you goes, you are wondering what will be sitting on the
 * front and right faces when the algorithm finishes, because that is what you
 * will be reading. Pieces already in place are left alone.
 */
export function recognitionArrows(map: PieceMap): MovementArrow[] {
  const out: MovementArrow[] = []
  const collect = (kind: 'corner' | 'edge', perm: number[], targets: number[]) => {
    for (const target of targets) {
      const from = perm.findIndex((to) => to === target)
      if (from === -1 || from === target) continue
      out.push({ kind, from, to: target, emphasis: true })
    }
  }
  collect('corner', map.corners, TWO_SIDED_CORNER_SLOTS)
  collect('edge', map.edges, TWO_SIDED_EDGE_SLOTS)
  return out
}

/**
 * Which movements to draw over the cube.
 *
 * By default only the pieces that both MOVE and matter: a piece that stays put
 * has nothing to show, and a piece outside the necessary set is a distraction
 * from the five that decide the answer. `showAll` keeps the rest, drawn back.
 */
export function movementArrows(
  map: PieceMap,
  necessary: PieceRef[],
  showAll = false,
): MovementArrow[] {
  const needed = new Set(necessary.map((p) => `${p.kind}${p.slot}`))
  const out: MovementArrow[] = []

  const push = (kind: 'corner' | 'edge', perm: number[]) => {
    perm.forEach((to, from) => {
      if (to === from) return
      const emphasis = needed.has(`${kind}${from}`)
      if (!emphasis && !showAll) return
      out.push({ kind, from, to, emphasis })
    })
  }

  push('corner', map.corners)
  push('edge', map.edges)
  return out
}

// ---------------------------------------------------------------------------
// The brief
// ---------------------------------------------------------------------------

export interface RecognitionBrief {
  ollId: string
  alg: string
  map: PieceMap
  slots: SlotVisibility[]
  /** The corner and edge worth following, chosen for readability and movement. */
  watch: { corner: SlotVisibility | null; edge: SlotVisibility | null }
  /** Pieces that show no identifying colour from the two-sided view. */
  hidden: SlotVisibility[]
  /** Ordered advice, most useful first. */
  tips: string[]
}

/** Preference order: start where the eye already is, at the front right. */
const CORNER_PREFERENCE = [2, 1, 3, 0]
const EDGE_PREFERENCE = [2, 1, 3, 0]

function pickWatch(slots: SlotVisibility[], kind: 'corner' | 'edge'): SlotVisibility | null {
  const order = kind === 'corner' ? CORNER_PREFERENCE : EDGE_PREFERENCE
  const candidates = slots.filter((s) => s.kind === kind)
  // Readable and actually moved by the algorithm: following a piece that stays
  // put, or one you cannot identify, teaches nothing.
  const ideal = order.map((i) => candidates[i]).filter((s) => s && !s.hidden && s.moves)
  if (ideal.length > 0) return ideal[0]
  const readable = order.map((i) => candidates[i]).filter((s) => s && !s.hidden)
  if (readable.length > 0) return readable[0]
  return candidates[order[0]] ?? null
}

export function buildRecognitionBrief(oll: OLLCase, alg: string): RecognitionBrief {
  const map = pieceMapOf(alg)
  const slots: SlotVisibility[] = [
    ...[0, 1, 2, 3].map((s) => visibilityFor(oll.state, 'corner', s, map)),
    ...[0, 1, 2, 3].map((s) => visibilityFor(oll.state, 'edge', s, map)),
  ]

  const watch = { corner: pickWatch(slots, 'corner'), edge: pickWatch(slots, 'edge') }
  const hidden = slots.filter((s) => s.hidden)

  const tips: string[] = []

  // With corners fixed, "watch this corner" is noise — the dedicated line
  // below says the useful thing instead.
  if (watch.corner && !map.cornersFixed) {
    const w = watch.corner
    tips.push(
      w.hidden
        ? 'No corner is identifiable from the front and right here — read the corners off the top face instead.'
        : `Watch the ${w.name} corner. Its colour shows on the ${w.visible.map((v) => v.where).join(' and ')}` +
          (w.moves ? `, and the algorithm carries it to ${w.destinationName}.` : `, and it stays put.`),
    )
  }

  if (watch.edge) {
    const w = watch.edge
    tips.push(
      w.hidden
        ? `No edge shows a colour from this angle — the top face is the only place to read them.`
        : `Watch the ${w.name} edge, readable on the ${w.visible.map((v) => v.where).join(' and ')}` +
          (w.moves ? `, ending at ${w.destinationName}.` : `, which does not move.`),
    )
  }

  if (map.cornersFixed) {
    tips.push(
      'This algorithm never moves a corner. The corners you can see now are the corners you will be left with, in the same places — so read them before you start and they are already decided.',
    )
  } else {
    tips.push(
      'Where the corners end up depends on which specific corners are where now, not just the shape they make — follow the piece, not the pattern.',
    )
  }

  if (map.edgesFixed) {
    tips.push('Edges are untouched, so the edge pattern you can see now is the one you will get.')
  }

  if (hidden.length > 0) {
    const list = hidden.map((h) => `the ${h.name} ${h.kind}`)
    const phrase =
      list.length === 1
        ? `${list[0]} shows`
        : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]} show`
    const sentence = `${phrase} no colour from this angle — infer ${list.length === 1 ? 'it' : 'them'} by elimination once the others are placed.`
    tips.push(sentence.charAt(0).toUpperCase() + sentence.slice(1))
  }

  return { ollId: oll.id, alg, map, slots, watch, hidden, tips }
}

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

/** How a block of three last-layer stickers reads, in the words cubers use. */
const BLOCK_NAME: Record<string, string> = {
  bar: 'a solid three-bar',
  headlights: 'headlights',
  'outer-pair': 'a two-bar',
  checker: 'no block',
}

/** What that name means in terms of colours, glossed once per pattern. */
const BLOCK_GLOSS: Record<string, string> = {
  bar: 'all three the same colour',
  headlights: 'the two outer stickers the same, the middle one different',
  'outer-pair': 'one adjacent pair the same, the third different',
  checker: 'all three colours different',
}

/** "a, b or c" rather than "a or b or c". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

/** The stickers worth staring at: the ones that decide this case. */
export function hintFacelets(oll: OLLCase, alg: string): number[] {
  const brief = buildRecognitionBrief(oll, alg)
  const needed = new Set(necessaryPieces(oll, alg).map((p) => `${p.kind}${p.slot}`))
  return brief.slots
    .filter((slot) => needed.has(`${slot.kind}${slot.slot}`))
    .flatMap((slot) => slot.visible.map((v) => v.facelet))
}

export interface Hint {
  /** One short line for the interface. */
  text: string
  /** Facelets to light on the cube at this level, if any. */
  highlight?: number[]
  /** Whether this level turns the movement arrows on. */
  arrows?: boolean
}

/**
 * A ladder, not a lump.
 *
 * Each rung gives away strictly more than the last: where to look, then what
 * the algorithm does to those pieces, then what pattern you will be left with.
 * Only the last rung comes close to the answer, and by then the rep has already
 * stopped counting toward pace — see `applyTrial`.
 */
export function hintsFor(oll: OLLCase, alg: string, resolved: Facelets, pll: PLLCase): Hint[] {
  const needed = necessaryPieces(oll, alg)
  const corners = needed.filter((p) => p.kind === 'corner').map((p) => CORNER_SLOTS[p.slot])
  const edges = needed.filter((p) => p.kind === 'edge').map((p) => EDGE_SLOTS[p.slot])
  const lit = hintFacelets(oll, alg)

  const reading = readDrill(resolved)
  const frontPattern = pll.recognition.faces.F
  const rightPattern = pll.recognition.faces.R
  const candidates = reading.candidates.map((c) => c.name)

  // Gloss each distinct pattern once, not once per face.
  const gloss = [...new Set([frontPattern, rightPattern])]
    .map((p) => `${BLOCK_NAME[p]} = ${BLOCK_GLOSS[p]}`)
    .join('; ')

  return [
    {
      text:
        `Only five pieces decide this: the ${corners.join(', ')} corners and the ` +
        `${edges.join(' and ')} edges. The other three follow from them.`,
      highlight: lit,
    },
    {
      text: describePieceMap(pieceMapOf(alg)),
      arrows: true,
      highlight: lit,
    },
    {
      text:
        `When it lands: ${BLOCK_NAME[frontPattern]} on the front, ` +
        `${BLOCK_NAME[rightPattern]} on the right — ${gloss}. ` +
        (candidates.length === 1
          ? 'Exactly one case looks like that.'
          : `That narrows it to ${listOf(candidates)}.`),
      arrows: true,
    },
  ]
}

// ---------------------------------------------------------------------------
// Reading one live drill
// ---------------------------------------------------------------------------

export interface DrillReading {
  resultCorners: CornerClass
  resultEdges: EdgeClass
  /** PLLs consistent with the finishing classes. */
  candidates: PLLCase[]
}

/**
 * How the last layer reads once the algorithm has run, and how far that alone
 * narrows the answer.
 *
 * There is deliberately no "starting class" here. Classification picks its
 * reference AUF jointly across corners and edges, so when the edges move the
 * reference can shift and the corners appear to change class even for an
 * algorithm that never touches a corner. True, but it reads as a contradiction,
 * and a starting class is not something a solver can act on anyway — the pieces
 * are. Those are handled by `buildRecognitionBrief`.
 */
export function readDrill(resolved: Facelets): DrillReading {
  const arrangement = (s: Facelets) => {
    const corners = CORNER_SLOT_FACELETS.map((facelets) => homeOf(s, facelets, CORNER_SLOT_FACELETS))
    const edges = EDGE_SLOT_FACELETS.map((facelets) => homeOf(s, facelets, EDGE_SLOT_FACELETS))
    return { corners, edges }
  }
  const { corners, edges } = arrangement(resolved)
  const end = classifyArrangement(corners, edges)

  return {
    resultCorners: end.corners,
    resultEdges: end.edges,
    candidates: candidatesFor(end.corners, end.edges),
  }
}

/** Which slot the piece currently occupying `facelets` actually belongs to. */
function homeOf(state: Facelets, facelets: number[], allSlots: number[][]): number {
  const colours = facelets
    .map((f) => state[f])
    .filter((c) => c !== 'U')
    .sort()
    .join('')
  const solvedKey = (slot: number[]) =>
    slot
      .map((f) => SOLVED_REFERENCE[f])
      .filter((c) => c !== 'U')
      .sort()
      .join('')
  const index = allSlots.findIndex((slot) => solvedKey(slot) === colours)
  return index === -1 ? 0 : index
}

const SOLVED_REFERENCE = SOLVED

// ---------------------------------------------------------------------------
// The teaching brief — what a case says the first time you meet it
// ---------------------------------------------------------------------------

export interface TeachingStep {
  key: 'corners' | 'edges' | 'result'
  heading: string
  text: string
  /** Facelets to light while this step is on screen. */
  highlight?: number[]
  /** Whether the movement arcs are drawn for this step. */
  arrows?: boolean
}

/** The needed slots of one kind, in the order the eye meets them. */
function neededSlots(
  brief: RecognitionBrief,
  needed: PieceRef[],
  kind: 'corner' | 'edge',
): SlotVisibility[] {
  const wanted = new Set(needed.filter((p) => p.kind === kind).map((p) => p.slot))
  return brief.slots.filter((s) => s.kind === kind && wanted.has(s.slot))
}

/**
 * `UFR ← UFL, UBR ← UFR, UFL stays` — what arrives in each slot you are going
 * to read.
 *
 * Every two-sided slot is named, including the ones nothing travels into. A
 * list that silently omits a slot reads as an oversight at exactly the moment
 * the solver is checking whether they have accounted for everything.
 */
function arrivalsInto(map: PieceMap, kind: 'corner' | 'edge'): string {
  const labels = kind === 'corner' ? CORNER_SLOTS : EDGE_SLOTS
  const perm = kind === 'corner' ? map.corners : map.edges
  const targets = kind === 'corner' ? TWO_SIDED_CORNER_SLOTS : TWO_SIDED_EDGE_SLOTS
  return targets
    .map((target) => {
      const from = perm.findIndex((to) => to === target)
      return from === target ? `${labels[target]} stays` : `${labels[target]} ← ${labels[from]}`
    })
    .join(', ')
}

/** "the UBR corner" / "the UBR and UFL corners". */
function slotList(slots: SlotVisibility[]): string {
  const names = slots.map((s) => s.name)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function movementLine(map: PieceMap, kind: 'corner' | 'edge'): string {
  const fixed = kind === 'corner' ? map.cornersFixed : map.edgesFixed
  const labels = kind === 'corner' ? CORNER_SLOTS : EDGE_SLOTS
  const cycles = kind === 'corner' ? map.cornerCycles : map.edgeCycles
  if (fixed) {
    return kind === 'corner'
      ? 'It never moves a corner, only twists them: these three stay put, so what you read now is what you get.'
      : 'It never moves an edge either, only flips them — the edges you read now are the ones you get.'
  }
  const described = cycles
    .map((cycle) =>
      cycle.length === 2
        ? `${labels[cycle[0]]} and ${labels[cycle[1]]} swap`
        : `${cycle.map((i) => labels[i]).join(' → ')} → ${labels[cycle[0]]}`,
    )
    .join('; ')
  return `It moves them: ${described}. So the slots you read fill from ${arrivalsInto(map, kind)}.`
}

/** A clause about the pieces this angle cannot see, or nothing. */
function blindClause(slots: SlotVisibility[]): string {
  const hidden = slots.filter((s) => s.hidden)
  if (hidden.length === 0) return ''
  const list = slotList(hidden)
  return ` ${list} show${hidden.length === 1 ? 's' : ''} no colour from here — take ${hidden.length === 1 ? 'it' : 'them'} by elimination once the rest are placed.`
}

/**
 * How to read this case, said out loud, once.
 *
 * Shown while a case is being introduced and never afterwards: the first time
 * you meet an OLL the useful thing is the method, not a test of a method you
 * have not been given. Corners first, then edges, then what the two readings
 * together leave — the same order a solver's eye actually takes, and the same
 * decomposition the classifier uses, so the words and the maths cannot drift
 * apart. Every clause is computed from the algorithm and the resolved state.
 */
export function buildTeachingBrief(
  oll: OLLCase,
  alg: string,
  resolved: Facelets,
  pll: PLLCase,
): TeachingStep[] {
  const brief = buildRecognitionBrief(oll, alg)
  const needed = necessaryPieces(oll, alg)
  const map = brief.map
  const reading = readDrill(resolved)

  const corners = neededSlots(brief, needed, 'corner')
  const edges = neededSlots(brief, needed, 'edge')
  const litOf = (slots: SlotVisibility[]) => slots.flatMap((s) => s.visible.map((v) => v.facelet))

  const others = reading.candidates.filter((c) => c.id !== pll.id).map((c) => c.name)

  return [
    {
      key: 'corners',
      heading: 'First the corners',
      text:
        `Read ${slotList(corners)} — ${corners.length === 1 ? 'the corner' : 'the corners'} that decide this case. ` +
        movementLine(map, 'corner') +
        blindClause(corners),
      highlight: litOf(corners),
      arrows: true,
    },
    {
      key: 'edges',
      heading: 'Then the edges',
      text:
        `Now ${slotList(edges)}. ` + movementLine(map, 'edge') + blindClause(edges),
      highlight: litOf(edges),
      arrows: true,
    },
    {
      key: 'result',
      heading: 'What that leaves',
      text:
        `It lands with ${CORNER_CLASS_LABEL[reading.resultCorners]} and ${EDGE_CLASS_LABEL[reading.resultEdges]} — ` +
        `${pll.recognition.summary} ` +
        (others.length === 0
          ? `Only ${pll.name} perm reads like that.`
          : `That pair leaves ${listOf([pll.name, ...others])}, and this one is ${pll.name}.`),
    },
  ]
}
