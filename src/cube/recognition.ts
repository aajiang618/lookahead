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

import {
  algPermutation,
  applyAlg,
  invertAlg,
  simplifyAlg,
  SOLVED,
  type Facelets,
} from './engine.ts'
import { PLL_CASES, type BlockPattern, type OLLCase, type PLLCase } from './cases.ts'
import {
  CORNER_LABELS,
  CORNER_SLOT_FACELETS,
  CORNER_SLOTS,
  EDGE_LABELS,
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
 * A ladder, not a lump — and the same explanation the lesson gave.
 *
 * A hint used to be a different account of the case from the one it was taught
 * with: pieces, then arrows, then shape. Two vocabularies for one skill is one
 * too many, so a hint is now the colour reading, handed over a rung at a time —
 * where to look, what it says, and finally the comparison that settles it.
 *
 * Each rung gives away strictly more than the last, and by the last the rep has
 * already stopped counting toward pace; see `applyTrial`.
 */
export function hintsFor(oll: OLLCase, alg: string, state: Facelets, pll: PLLCase): Hint[] {
  const read = readTwoSided(oll, alg, state)
  const comparisons = decidingComparisons(oll, alg, state)
  const lit = [...read.front, ...read.right].filter((s) => s.visible).map((s) => s.from as number)

  const rows: Hint[] = [
    {
      text:
        `Read what is about to become your front row — ${read.front.map((s) => s.where).join(', ')} — ` +
        `and your right row — ${read.right.map((s) => s.where).join(', ')}.`,
      highlight: lit,
    },
    {
      text:
        `${read.frontPattern ? `They land as ${BLOCK_READING[read.frontPattern]} on the front` : 'The front cannot be read in full yet'}` +
        `${read.rightPattern ? ` and ${BLOCK_READING[read.rightPattern]} on the right` : ' and nor can the right'}. ` +
        (read.candidates.length === 1
          ? `Only ${read.candidates[0].name} reads like that.`
          : `That leaves ${candidateWords(read.candidates)}.`),
      highlight: lit,
    },
  ]

  if (comparisons.length > 0) {
    const first = comparisons[0]
    rows.push({
      text:
        `Compare ${first.a.where} with ${first.b.where}: ` +
        first.branches
          .map((b) => `${RELATION_SHORT[b.relation]} → ${candidateWords(b.candidates, 3)}`)
          .join('; ') +
        '.',
      highlight: [first.a.facelet, first.b.facelet],
    })
  } else {
    rows.push({
      text: `Nothing else to compare — those six stickers name it on their own: ${pll.name}.`,
      highlight: lit,
    })
  }

  return rows
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
// Two-sided reading, from the OLL stage
// ---------------------------------------------------------------------------

/**
 * The six stickers a two-sided read is made of, after the algorithm: the top
 * row of the front face and the top row of the right face, each left to right.
 */
const READ_POSITIONS: Array<{ facelet: number; face: 'F' | 'R'; order: number }> = [
  { facelet: 18, face: 'F', order: 0 },
  { facelet: 19, face: 'F', order: 1 },
  { facelet: 20, face: 'F', order: 2 },
  { facelet: 9, face: 'R', order: 0 },
  { facelet: 10, face: 'R', order: 1 },
  { facelet: 11, face: 'R', order: 2 },
]

const OPPOSITE_FACE: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' }

/** How two stickers relate, in the only three terms a cuber needs. */
export type ColourRelation = 'same' | 'opposite' | 'neither'

export function relateColours(a: string, b: string): ColourRelation {
  if (a === b) return 'same'
  if (OPPOSITE_FACE[a] === b) return 'opposite'
  return 'neither'
}

/** The slot a facelet belongs to, in notation: `UBR`, `UF`. */
function slotNameOf(facelet: number): string {
  const corner = CORNER_SLOT_FACELETS.findIndex((list) => list.includes(facelet))
  if (corner !== -1) return CORNER_SLOTS[corner]
  const edge = EDGE_SLOT_FACELETS.findIndex((list) => list.includes(facelet))
  if (edge !== -1) return EDGE_SLOTS[edge]
  return '?'
}

/** Which piece a facelet belongs to, said the way a cuber says it. */
function pieceNameOf(facelet: number): string {
  const corner = CORNER_SLOT_FACELETS.findIndex((list) => list.includes(facelet))
  if (corner !== -1) return CORNER_LABELS[CORNER_SLOTS[corner]]
  const edge = EDGE_SLOT_FACELETS.findIndex((list) => list.includes(facelet))
  if (edge !== -1) return EDGE_LABELS[EDGE_SLOTS[edge]]
  return 'piece'
}

export interface ReadSticker {
  /** Where it will be when the algorithm finishes: one of the six read spots. */
  lands: number
  face: 'F' | 'R'
  /** 0, 1, 2 — left to right across that face. */
  order: number
  /** Where it is sitting right now, or null when nothing shows it yet. */
  from: number | null
  visible: boolean
  /** The piece carrying it, legible or not. */
  carrier: string
  /** "back-right corner (top)" — somewhere you can point. */
  where: string
  /** Face letter of the colour, when it can be read now. */
  colour: string | null
}

export interface TwoSidedRead {
  front: ReadSticker[]
  right: ReadSticker[]
  /** The block each face will show, when all three of its stickers are legible. */
  frontPattern: BlockPattern | null
  rightPattern: BlockPattern | null
  /** Stickers still under the top colour, which have to come by elimination. */
  hidden: ReadSticker[]
  /** Every PLL consistent with the relations you can actually read right now. */
  candidates: PLLCase[]
}

/** Which block three side stickers make, in the cuber's four categories. */
function blockOf(colours: Array<string | null>): BlockPattern | null {
  const [a, b, c] = colours
  if (!a || !b || !c) return null
  if (a === b && b === c) return 'bar'
  if (a === c) return 'headlights'
  if (a === b || b === c) return 'outer-pair'
  return 'checker'
}

const readCache = new Map<string, ReadSticker[]>()

/**
 * Where the six read stickers are before the algorithm runs.
 *
 * A sticker keeps its colour through an algorithm — only its position changes —
 * so the front row you are going to read already exists somewhere on the cube,
 * and for most cases most of it is already in sight. `algPermutation` gives
 * `perm[destination] = source`, which is precisely the backwards question being
 * asked here: not "where does this piece go" but "what is going to be sitting
 * where I will be looking".
 */
function readStickersFor(oll: OLLCase, alg: string, state: Facelets): ReadSticker[] {
  const key = `${oll.id}|${alg}`
  let shape = readCache.get(key)
  if (!shape) {
    const perm = algPermutation(alg)
    shape = READ_POSITIONS.map(({ facelet, face, order }) => {
      const from = perm[facelet]
      // Legible now only if it faces the solver and is not under the top
      // colour. Which stickers those are is a property of the OLL shape, so it
      // is the same for every drill on this case.
      const visible = TWO_SIDED_FACELETS.has(from) && oll.state[from] !== 'U'
      return {
        lands: facelet,
        face,
        order,
        from: visible ? from : null,
        visible,
        // The piece that CARRIES the sticker, which is knowable even when the
        // sticker itself is not — naming the piece sitting where it will land
        // instead would point at the wrong cubie every time the algorithm
        // moves anything.
        carrier: pieceNameOf(from),
        // Compact on purpose: this name is read three at a time, in a strip
        // that must not grow. "back-right corner (top)" points at exactly one
        // sticker and costs a third of the words a sentence would.
        where: visible
          ? `${slotNameOf(from)} ${FACE_WORD[faceOf(from)]}`
          : `${slotNameOf(from)} (hidden)`,
        colour: null as string | null,
      }
    })
    readCache.set(key, shape)
  }

  return shape.map((sticker) => ({
    ...sticker,
    colour: sticker.visible && sticker.from !== null ? state[sticker.from] : null,
  }))
}

/**
 * The relations between every pair of legible read stickers.
 *
 * Relations rather than colours, because an AUF changes every absolute colour
 * in the last layer and changes no relation between two of them. A rule
 * written this way is AUF-proof by construction — which is the whole property a
 * recognition rule has to have.
 */
function relationSignature(stickers: ReadSticker[], state: Facelets): string {
  const legible = stickers.filter((s) => s.visible && s.from !== null)
  const parts: string[] = []
  for (let i = 0; i < legible.length; i++) {
    for (let j = i + 1; j < legible.length; j++) {
      parts.push(relateColours(state[legible[i].from as number], state[legible[j].from as number]))
    }
  }
  return parts.join('|')
}

const outcomeSignatureCache = new Map<string, Map<string, PLLCase[]>>()

/** What each possible reading of this case narrows the answer to. */
function signatureIndex(oll: OLLCase, alg: string): Map<string, PLLCase[]> {
  const key = `${oll.id}|${alg}`
  const cached = outcomeSignatureCache.get(key)
  if (cached) return cached

  const shape = readStickersFor(oll, alg, oll.state)
  const index = new Map<string, PLLCase[]>()
  for (const { label, state } of outcomeStates(alg)) {
    const signature = relationSignature(shape, state)
    const pll = PLL_CASES.find((c) => c.name === label)
    if (!pll) continue
    const bucket = index.get(signature)
    if (!bucket) index.set(signature, [pll])
    else if (!bucket.includes(pll)) bucket.push(pll)
  }
  outcomeSignatureCache.set(key, index)
  return index
}

/**
 * Read the case two-sided, before executing it.
 *
 * This is the recognition a solver actually wants: compare a couple of stickers
 * already in front of you and name the case, rather than tracking pieces
 * through an algorithm. It does not always finish the job — for 44 of the 57
 * cases one to three of the six read stickers are still under the top colour at
 * this stage — so the candidate list is honest about how far the colours alone
 * get you, and the pieces settle the rest.
 */
export function readTwoSided(oll: OLLCase, alg: string, state: Facelets): TwoSidedRead {
  const stickers = readStickersFor(oll, alg, state)
  const front = stickers.filter((s) => s.face === 'F')
  const right = stickers.filter((s) => s.face === 'R')

  const candidates =
    signatureIndex(oll, alg).get(relationSignature(stickers, state)) ?? [...PLL_CASES]

  return {
    front,
    right,
    frontPattern: blockOf(front.map((s) => s.colour)),
    rightPattern: blockOf(right.map((s) => s.colour)),
    hidden: stickers.filter((s) => !s.visible),
    candidates,
  }
}

// ---------------------------------------------------------------------------
// The teaching brief — what a case says the first time you meet it
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The comparison that decides it
// ---------------------------------------------------------------------------

/**
 * Every sticker a solver can identify from the front and right before starting.
 *
 * Wider than the six that land on the faces being read: a sticker on the far
 * side of a piece, or on top of it, is just as legible and just as informative,
 * and it is what settles the cases the six alone cannot.
 */
function legibleStickers(oll: OLLCase): number[] {
  return [...TWO_SIDED_FACELETS].filter((f) => oll.state[f] !== 'U').sort((a, b) => a - b)
}

const RELATION_ORDER: ColourRelation[] = ['same', 'opposite', 'neither']

export interface ComparisonBranch {
  relation: ColourRelation
  candidates: PLLCase[]
}

export interface Comparison {
  /** The two stickers to hold against each other. */
  a: { facelet: number; where: string }
  b: { facelet: number; where: string }
  /** What each possible answer would mean. Only the ones that can occur. */
  branches: ComparisonBranch[]
  /** Which it actually is, on the cube in front of you. */
  actual: ColourRelation
  /** What remains once this comparison is answered. */
  remaining: PLLCase[]
}

/** `UBR top` — compact enough to read three at a time. */
function stickerName(facelet: number): string {
  return `${slotNameOf(facelet)} ${FACE_WORD[faceOf(facelet)]}`
}

/**
 * The comparisons that finish the job, in the order to make them.
 *
 * Relations among every legible sticker determine the case for all 57 OLLs —
 * so this always terminates in a single answer, and the six stickers of the
 * two-sided read get there on their own for 13 of them. The rest need a mean of
 * 0.47 further comparisons, four at the very worst.
 *
 * Chosen greedily by worst branch: the question asked is the one whose least
 * helpful answer still leaves the fewest cases standing. Minimising the WORST
 * branch rather than the average is deliberate — a rule is only as good as the
 * reading that goes badly.
 */
export function decidingComparisons(oll: OLLCase, alg: string, state: Facelets): Comparison[] {
  const shape = readStickersFor(oll, alg, oll.state)
  const signature = relationSignature(shape, state)

  // Everything still consistent with the two-sided read.
  let rows = outcomeStates(alg).filter((row) => relationSignature(shape, row.state) === signature)
  const stickers = legibleStickers(oll)
  const out: Comparison[] = []

  const labelsOf = (list: typeof rows) => new Set(list.map((r) => r.label))

  while (labelsOf(rows).size > 1 && out.length < 4) {
    let best: { a: number; b: number; worst: number; split: Map<ColourRelation, typeof rows> } | null =
      null

    for (let i = 0; i < stickers.length; i++) {
      for (let j = i + 1; j < stickers.length; j++) {
        const split = new Map<ColourRelation, typeof rows>()
        for (const row of rows) {
          const relation = relateColours(row.state[stickers[i]], row.state[stickers[j]])
          const bucket = split.get(relation)
          if (bucket) bucket.push(row)
          else split.set(relation, [row])
        }
        if (split.size < 2) continue
        const worst = Math.max(...[...split.values()].map((part) => labelsOf(part).size))
        if (!best || worst < best.worst) best = { a: stickers[i], b: stickers[j], worst, split }
      }
    }

    if (!best) break

    const actual = relateColours(state[best.a], state[best.b])
    const branches: ComparisonBranch[] = [...best.split.entries()]
      .map(([relation, part]) => ({
        relation,
        candidates: [...labelsOf(part)]
          .map((name) => PLL_CASES.find((c) => c.name === name))
          .filter((c): c is PLLCase => Boolean(c)),
      }))
      // Same, opposite, neither: the order the question is actually asked in,
      // not alphabetical.
      .sort((x, y) => RELATION_ORDER.indexOf(x.relation) - RELATION_ORDER.indexOf(y.relation))

    const remaining = branches.find((br) => br.relation === actual)?.candidates ?? []
    out.push({
      a: { facelet: best.a, where: stickerName(best.a) },
      b: { facelet: best.b, where: stickerName(best.b) },
      branches,
      actual,
      remaining,
    })

    rows = best.split.get(actual) ?? []
  }

  return out
}

// ---------------------------------------------------------------------------
// Which way to read this case
// ---------------------------------------------------------------------------

/**
 * The two ways to know what an OLL will leave.
 *
 *  - `pattern`: read the stickers that are about to become the front and right
 *    rows and name the block they will make. The fast skill, and the one real
 *    two-sided recognition is built on.
 *  - `swaps`: track the pieces the algorithm moves. Slower to perform, but when
 *    an algorithm leaves a whole system alone — twelve of the 57 never move a
 *    corner, five never move an edge — it collapses half the problem to
 *    nothing: what you can see now is what you will be left with.
 *
 * Which is better is a property of the case, not a preference, so it is
 * measured rather than chosen.
 */
export type RecognitionMethod = 'pattern' | 'swaps'

export interface MethodChoice {
  method: RecognitionMethod
  /** True when the algorithm never permutes one of the two systems. */
  frozenSystem: boolean
  /** Read stickers still under the top colour, which must be inferred. */
  hiddenReadStickers: number
  /** Comparisons the colours need beyond the two rows, averaged over outcomes. */
  meanComparisons: number
  /** Of the five pieces that decide it, how many the algorithm moves. */
  movedPieces: number
  /** Of the five, how many show no colour from the front and right. */
  hiddenPieces: number
  patternCost: number
  swapCost: number
}

const methodCache = new Map<string, MethodChoice>()

/**
 * Read the colours unless following the pieces is decisively better.
 *
 * The two are not equally good to MEMORISE, which is the thing that matters
 * here. A colour pattern is a perceptual chunk and chunks collapse into a
 * single glance with practice; a piece mapping is a procedure, and a procedure
 * costs roughly the same every time you run it. So reading wins by default
 * even where it is more work today, because it is the route that gets faster.
 *
 * The exception is not "reading is expensive here" — it is "there is nothing to
 * do here at all". When an algorithm freezes a whole system, the corners or the
 * edges you can already see are the ones you will be left with, and that is not
 * a mapping to memorise, it is permission to skip half the problem. Zero work
 * beats cheap work, so those cases follow the pieces and the other 40 read.
 *
 * The costs are still measured, and still recorded on the choice, because they
 * are what the wording of the lesson is built from.
 */
export function recognitionMethod(oll: OLLCase, alg: string): MethodChoice {
  const key = `${oll.id}|${alg}`
  const cached = methodCache.get(key)
  if (cached) return cached

  const shape = readStickersFor(oll, alg, oll.state)
  const hiddenReadStickers = shape.filter((s) => !s.visible).length

  /*
   * Averaged over buckets rather than over the 84 outcome states: every state
   * with the same reading needs the same comparisons by construction, and there
   * are far fewer distinct readings than states. Same number, a tenth of the
   * work, which matters because this runs on a phone the first time a case
   * comes up.
   */
  const index = signatureIndex(oll, alg)
  const states = outcomeStates(alg)
  const representative = new Map<string, Facelets>()
  const weight = new Map<string, number>()
  for (const { state } of states) {
    const signature = relationSignature(shape, state)
    if (!representative.has(signature)) representative.set(signature, state)
    weight.set(signature, (weight.get(signature) ?? 0) + 1)
  }
  let comparisonTotal = 0
  for (const [signature, state] of representative) {
    comparisonTotal += decidingComparisons(oll, alg, state).length * (weight.get(signature) ?? 0)
  }
  const meanComparisons = comparisonTotal / states.length
  void index

  const map = pieceMapOf(alg)
  const brief = buildRecognitionBrief(oll, alg)
  const needed = necessaryPieces(oll, alg)
  const neededSlots = needed.map((p) =>
    brief.slots.find((s) => s.kind === p.kind && s.slot === p.slot),
  )
  const movedPieces = needed.filter((p) =>
    p.kind === 'corner' ? map.corners[p.slot] !== p.slot : map.edges[p.slot] !== p.slot,
  ).length
  const hiddenPieces = neededSlots.filter((s) => s?.hidden).length

  const patternCost = hiddenReadStickers + meanComparisons
  const swapCost = movedPieces + hiddenPieces

  const frozenSystem = map.cornersFixed || map.edgesFixed

  const choice: MethodChoice = {
    method: frozenSystem ? 'swaps' : 'pattern',
    frozenSystem,
    hiddenReadStickers,
    meanComparisons,
    movedPieces,
    hiddenPieces,
    patternCost,
    swapCost,
  }
  methodCache.set(key, choice)
  return choice
}

export interface TeachingStep {
  key: 'method' | 'result'
  heading: string
  text: string
  /** Facelets to light while this step is on screen. */
  highlight?: number[]
  /** Whether the movement arcs are drawn for this step. */
  arrows?: boolean
}

/** What the algorithm does to one kind of piece, in a clause. */
function movementClause(map: PieceMap, kind: 'corner' | 'edge'): string {
  const fixed = kind === 'corner' ? map.cornersFixed : map.edgesFixed
  const labels = kind === 'corner' ? CORNER_SLOTS : EDGE_SLOTS
  const cycles = kind === 'corner' ? map.cornerCycles : map.edgeCycles
  if (fixed) {
    return kind === 'corner' ? 'no corner moves, they only twist' : 'no edge moves, they only flip'
  }
  return cycles
    .map((cycle) =>
      cycle.length === 2
        ? `${labels[cycle[0]]} and ${labels[cycle[1]]} swap`
        : `${cycle.map((i) => labels[i]).join(' → ')} → ${labels[cycle[0]]}`,
    )
    .join('; ')
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

/**
 * What the two faces actually show once the algorithm has run.
 *
 * Computed from the resolved state rather than taken from the case's canonical
 * recognition summary, which describes the PLL at its own reference AUF. With a
 * different AUF on the cube the canonical description is a different case's
 * worth of words, and printing it under a reading that says otherwise makes the
 * lesson contradict itself.
 */
function landedBlocks(resolved: Facelets): {
  front: BlockPattern | null
  right: BlockPattern | null
} {
  return {
    front: blockOf([resolved[18], resolved[19], resolved[20]]),
    right: blockOf([resolved[9], resolved[10], resolved[11]]),
  }
}

/** What three stickers look like, said the way a cuber says it. */
const BLOCK_READING: Record<BlockPattern, string> = {
  bar: 'a solid bar',
  headlights: 'headlights',
  'outer-pair': 'a 2-bar',
  checker: 'no block',
}

const RELATION_SHORT: Record<ColourRelation, string> = {
  same: 'same',
  opposite: 'opposite',
  neither: 'neither',
}

/**
 * A candidate set, named when naming it helps and counted when it does not.
 *
 * Past about four, a list of case names stops being a thing you can hold and
 * starts being a wall — and "leaves 11 of the 21" is the more useful sentence
 * anyway, because what it tells you is that the colours have not done the job.
 */
function candidateWords(candidates: PLLCase[], limit = 4): string {
  const names = candidates.map((c) => c.name)
  if (names.length === 1) return `${names[0]}`
  if (names.length <= limit) return listOf(names)
  return `${names.length} of the 21`
}

/** The three stickers of one row, named compactly: `UBR top, UR top, UFL front`. */
function rowStickers(stickers: ReadSticker[]): string {
  return stickers.map((s) => s.where).join(', ')
}

/**
 * How to read this case, said out loud, once — in ONE step.
 *
 * Which route it teaches is decided per case by `recognitionMethod`, because
 * the two are not equally useful everywhere: reading the future front and right
 * rows is the faster skill, but where an algorithm never moves a corner, "the
 * corners you can see now are the corners you get" collapses half the problem
 * to nothing and no amount of colour comparison beats it.
 *
 * One step, not three. The lesson used to walk the front row, the right row and
 * the deciding comparison in sequence, which is three presses and three things
 * to hold before the cube is ever answered. What survives is the shortest true
 * statement of the method, with the conclusion kept back for the reveal.
 *
 * Every clause is computed from the algorithm and the state in front of you.
 */
export function buildTeachingBrief(
  oll: OLLCase,
  alg: string,
  state: Facelets,
  resolved: Facelets,
  pll: PLLCase,
): TeachingStep[] {
  const read = readTwoSided(oll, alg, state)
  const brief = buildRecognitionBrief(oll, alg)
  const map = brief.map
  const comparisons = decidingComparisons(oll, alg, state)
  const choice = recognitionMethod(oll, alg)

  const lit = [...read.front, ...read.right].filter((s) => s.visible).map((s) => s.from as number)

  const first = comparisons[0]
  const decider = first
    ? `; then ${first.a.where} vs ${first.b.where} — ` +
      first.branches
        .map((b) => `${RELATION_SHORT[b.relation]} → ${candidateWords(b.candidates, 3)}`)
        .join(', ') +
      (comparisons.length > 1 ? '; one more settles it' : '')
    : ''

  /*
   * ONE sentence: what to look at, what it says, and — when the rows do not
   * finish it — the comparison that does. Semicolons carry the structure; the
   * old three-clause prose carried words.
   */
  let step: TeachingStep
  if (choice.method === 'pattern') {
    step = {
      key: 'method',
      heading: 'Look for',
      text:
        `Front ${rowStickers(read.front)}${read.frontPattern ? ` → ${BLOCK_READING[read.frontPattern]}` : ''}; ` +
        `right ${rowStickers(read.right)}${read.rightPattern ? ` → ${BLOCK_READING[read.rightPattern]}` : ''}` +
        (read.candidates.length === 1
          ? ` — only ${read.candidates[0].name}.`
          : ` — leaves ${candidateWords(read.candidates)}${decider}.`),
      highlight: lit,
    }
  } else {
    const cornerClause = map.cornersFixed
      ? 'corners never move — what you see is what you get'
      : `corners ${movementClause(map, 'corner')}, so ${arrivalsInto(map, 'corner')}`
    const edgeClause = map.edgesFixed
      ? 'edges never move'
      : `edges ${movementClause(map, 'edge')}, so ${arrivalsInto(map, 'edge')}`
    step = {
      key: 'method',
      heading: 'Look for',
      text: `${cornerClause.charAt(0).toUpperCase()}${cornerClause.slice(1)}; ${edgeClause}.`,
      highlight: lit,
      arrows: true,
    }
  }

  const landed = landedBlocks(resolved)
  const landedWords = [
    landed.front ? `front ${BLOCK_READING[landed.front]}` : null,
    landed.right ? `right ${BLOCK_READING[landed.right]}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return [
    step,
    {
      key: 'result',
      heading: 'It landed as',
      text: `${pll.name} perm — ${landedWords}.`,
    },
  ]
}
