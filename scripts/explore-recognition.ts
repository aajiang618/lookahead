/**
 * Exploration, not a test. Answers three questions about what is actually
 * knowable before an OLL is finished, so the recognition tips can be computed
 * from the cube rather than asserted from memory.
 *
 *   1. Does the (corner class, edge class) pair determine the PLL?
 *   2. For a given algorithm, does the STARTING corner class determine the
 *      resulting corner class — or does it depend on finer detail?
 *   3. Which last-layer pieces are identifiable from the front and right faces
 *      before the algorithm runs?
 */

import { PLL_CASES, OLL_CASES } from '../src/cube/cases.ts'
import { pieceMapOf, CORNER_SLOT_FACELETS, EDGE_SLOT_FACELETS } from '../src/cube/tracking.ts'
import { algPermutation, destinationTable, SOLVED } from '../src/cube/engine.ts'

/** All permutations of four slots. */
function permutations(): number[][] {
  const out: number[][] = []
  const walk = (left: number[], acc: number[]) => {
    if (left.length === 0) return void out.push([...acc])
    for (let i = 0; i < left.length; i++) {
      walk([...left.slice(0, i), ...left.slice(i + 1)], [...acc, left[i]])
    }
  }
  walk([0, 1, 2, 3], [])
  return out
}

/** Rotate slot indices by `n` quarter turns. */
const rotate = (n: number) => (slot: number) => (slot + n) % 4

/** Compose: apply `a` then `b`. Both map slot -> slot. */
const compose = (a: number[], b: (s: number) => number) => a.map((to) => b(to))

function isIdentity(p: number[]) {
  return p.every((to, from) => to === from)
}

/** Slots swapped, if the permutation is a single transposition. */
function transposition(p: number[]): [number, number] | null {
  const moved = p.map((to, from) => [from, to]).filter(([f, t]) => f !== t)
  if (moved.length !== 2) return null
  const [[a, b], [c, d]] = moved as [[number, number], [number, number]]
  return a === d && b === c ? [a, b] : null
}

/**
 * How a solver would describe the corner permutation after the right AUF:
 * solved, two adjacent corners swapped, or two diagonal corners swapped.
 */
function cornerClass(perm: number[]): string {
  for (let r = 0; r < 4; r++) {
    const candidate = compose(perm, rotate(r))
    if (isIdentity(candidate)) return 'solved'
    const swap = transposition(candidate)
    if (swap) {
      const gap = Math.abs(swap[0] - swap[1])
      return gap === 2 ? 'diagonal' : 'adjacent'
    }
  }
  return 'other'
}

function edgeClass(perm: number[]): string {
  for (let r = 0; r < 4; r++) {
    const candidate = compose(perm, rotate(r))
    if (isIdentity(candidate)) return 'solved'
    const swap = transposition(candidate)
    if (swap) return Math.abs(swap[0] - swap[1]) === 2 ? 'opposite pair' : 'adjacent pair'
    const moved = candidate.filter((to, from) => to !== from).length
    if (moved === 3) return '3-cycle'
    if (moved === 4) {
      // Two independent swaps: opposite pairs (H) or adjacent pairs (Z).
      const a = candidate[0]
      return a === 2 ? 'double opposite' : 'double adjacent'
    }
  }
  return 'other'
}

/** The permutation a PLL algorithm applies, from its own solved-cube effect. */
function pllPerm(alg: string) {
  const map = pieceMapOf(alg)
  return map
}

console.log('\n1. Does (corner class, edge class) identify the PLL?\n')
{
  const seen = new Map<string, string[]>()
  for (const pll of PLL_CASES) {
    const map = pllPerm(pll.alg)
    // A PLL algorithm SOLVES the case, so the case's own arrangement is the
    // inverse of what the algorithm does.
    const invert = (p: number[]) => {
      const out = new Array<number>(4)
      p.forEach((to, from) => (out[to] = from))
      return out
    }
    const key = `${cornerClass(invert(map.corners))} / ${edgeClass(invert(map.edges))}`
    const list = seen.get(key) ?? []
    list.push(pll.name)
    seen.set(key, list)
  }
  for (const [key, names] of [...seen.entries()].sort()) {
    console.log(`   ${key.padEnd(34)} ${names.join(', ')}`)
  }
  const ambiguous = [...seen.values()].filter((v) => v.length > 1).length
  console.log(`\n   ${seen.size} distinct signatures, ${ambiguous} shared by more than one case`)
}

console.log('\n2. Does the starting corner class determine the resulting one?\n')
{
  const all = permutations()
  let algsWhereClassSuffices = 0
  const examples: string[] = []

  for (const oll of OLL_CASES) {
    const sigma = pieceMapOf(oll.alg).corners
    const byStartClass = new Map<string, Set<string>>()
    for (const start of all) {
      // Apply the start arrangement, then the algorithm.
      const result = start.map((_, from) => sigma[start[from]])
      const sc = cornerClass(start)
      const rc = cornerClass(result)
      const set = byStartClass.get(sc) ?? new Set()
      set.add(rc)
      byStartClass.set(sc, set)
    }
    const deterministic = [...byStartClass.values()].every((s) => s.size === 1)
    if (deterministic) algsWhereClassSuffices++
    else if (examples.length < 3) {
      examples.push(
        `${oll.name}: ` +
          [...byStartClass.entries()].map(([k, v]) => `${k}->{${[...v].join('|')}}`).join('  '),
      )
    }
  }
  console.log(`   ${algsWhereClassSuffices} of ${OLL_CASES.length} algorithms: start class alonedetermines result class`)
  for (const e of examples) console.log(`   counterexample ${e}`)
}

console.log('\n3. Which pieces are readable before the algorithm runs?\n')
{
  // A last-layer sticker identifies its piece only if it is NOT the U colour.
  // Two-sided recognition means only the front and right faces are visible.
  const FRONT_RIGHT = new Set([9, 10, 11, 18, 19, 20])
  const tally = new Map<number, number>()
  for (const oll of OLL_CASES) {
    let readable = 0
    for (const slots of [CORNER_SLOT_FACELETS, EDGE_SLOT_FACELETS]) {
      for (const facelets of slots) {
        const visible = facelets.filter((f) => FRONT_RIGHT.has(f) && oll.state[f] !== 'U')
        if (visible.length > 0) readable++
      }
    }
    tally.set(readable, (tally.get(readable) ?? 0) + 1)
  }
  for (const [n, count] of [...tally.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`   ${count} cases have ${n} of 8 pieces identifiable from the front and right`)
  }
}

void destinationTable
void algPermutation
void SOLVED

console.log('\n4. Given only what is visible, is the PLL determined?\n')
{
  const { buildDrill } = await import('../src/cube/scramble.ts')
  // A twisted corner shows one of its colours on the U face, and you can see
  // the U face. Leaving it out of the signature understates what is knowable.
  const U_FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  const FRONT_RIGHT = [...U_FACE, 9, 10, 11, 18, 19, 20]
  const ALL_SIDES = [...U_FACE, 9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47]

  let twoSidedOk = 0
  let fourSidedOk = 0
  const worst: string[] = []

  for (const oll of OLL_CASES) {
    const byTwo = new Map<string, Set<string>>()
    const byFour = new Map<string, Set<string>>()

    for (const pll of PLL_CASES) {
      // No AUF variation: we are asking what a fixed presentation reveals.
      const drill = buildDrill(oll, pll, 1, { varyAuf: false, varyAngle: false })
      const sig2 = FRONT_RIGHT.map((f) => drill.state[f]).join('')
      const sig4 = ALL_SIDES.map((f) => drill.state[f]).join('')
      ;(byTwo.get(sig2) ?? byTwo.set(sig2, new Set()).get(sig2)!).add(pll.name)
      ;(byFour.get(sig4) ?? byFour.set(sig4, new Set()).get(sig4)!).add(pll.name)
    }

    const twoClean = [...byTwo.values()].every((s) => s.size === 1)
    const fourClean = [...byFour.values()].every((s) => s.size === 1)
    if (twoClean) twoSidedOk++
    if (fourClean) fourSidedOk++
    if (!fourClean && worst.length < 4) {
      const clash = [...byFour.values()].find((s) => s.size > 1)
      worst.push(`${oll.name}: ${[...(clash ?? [])].join('/')} look identical even on all four sides`)
    }
  }

  console.log(`   ${twoSidedOk} of ${OLL_CASES.length} cases: the PLL is determined from the FRONT and RIGHT alone`)
  console.log(`   ${fourSidedOk} of ${OLL_CASES.length} cases: determined once you can see ALL FOUR sides`)
  for (const w of worst) console.log(`   ${w}`)
}

console.log('\n5. Two-sided predictability, across every AUF\n')
{
  const { buildDrill } = await import('../src/cube/scramble.ts')
  const U_FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  const VISIBLE = [...U_FACE, 9, 10, 11, 18, 19, 20] // U + front + right
  const AUFS = ['', 'U', "U'", 'U2']

  let clean = 0
  const clashes: string[] = []

  for (const oll of OLL_CASES) {
    const bySig = new Map<string, Set<string>>()
    for (const pll of PLL_CASES) {
      for (let a = 0; a < AUFS.length; a++) {
        // Rebuild with each AUF by seeding deterministically per AUF slot.
        const drill = buildDrill(oll, pll, a, { varyAuf: true, varyAngle: false })
        const sig = VISIBLE.map((f) => drill.state[f]).join('')
        ;(bySig.get(sig) ?? bySig.set(sig, new Set()).get(sig)!).add(pll.name)
      }
    }
    const ok = [...bySig.values()].every((s) => s.size === 1)
    if (ok) clean++
    else if (clashes.length < 5) {
      const bad = [...bySig.entries()].find(([, s]) => s.size > 1)
      clashes.push(`${oll.name}: ${[...(bad?.[1] ?? [])].join(' / ')}`)
    }
  }
  console.log(`   ${clean} of ${OLL_CASES.length} cases are unambiguous from U + front + right`)
  for (const c of clashes) console.log(`   ambiguous ${c}`)

  // And how much is left hidden: how many LL pieces cannot be identified at all
  // from that view, so the solver must infer them.
  const FRONT_RIGHT_SIDES = new Set([9, 10, 11, 18, 19, 20])
  let totalHidden = 0
  for (const oll of OLL_CASES) {
    let hidden = 0
    for (const slots of [CORNER_SLOT_FACELETS, EDGE_SLOT_FACELETS]) {
      for (const facelets of slots) {
        const identifying = facelets.filter(
          (f) => oll.state[f] !== 'U' && (f < 9 || FRONT_RIGHT_SIDES.has(f)),
        )
        if (identifying.length === 0) hidden++
      }
    }
    totalHidden += hidden
  }
  console.log(`   on average ${(totalHidden / OLL_CASES.length).toFixed(1)} of 8 pieces show no identifying colour from that view`)
}
