/**
 * Exploration, not a test.
 *
 * Question: can the PLL be read off the OLL stage the way cubers actually read
 * a case — by comparing two stickers and saying "same colour", "opposite
 * colours", "neither" — rather than by tracking pieces through the algorithm?
 *
 * Why relations rather than colours: an AUF changes every absolute colour in
 * the last layer but changes no relation between two of them. A rule written
 * in relations is therefore AUF-proof by construction, which is exactly the
 * property a recognition rule has to have.
 *
 * Method: for one OLL and one algorithm, enumerate the 84 states it can be
 * facing (21 PLLs x 4 AUFs), score every available comparison by how well it
 * splits the 21 answers, and greedily build a small decision tree.
 */

import { OLL_CASES, PLL_CASES, type OLLCase } from '../src/cube/cases.ts'
import { applyAlg, invertAlg, simplifyAlg, SOLVED, type Facelets } from '../src/cube/engine.ts'
import { TWO_SIDED_FACELETS, faceOf } from '../src/cube/recognition.ts'

const AUFS = ['', 'U', "U'", 'U2']
const OPPOSITE: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' }

type Relation = 'same' | 'opposite' | 'neither'

function relate(a: string, b: string): Relation {
  if (a === b) return 'same'
  if (OPPOSITE[a] === b) return 'opposite'
  return 'neither'
}

/** Every state this algorithm can be looking at, labelled by its answer. */
function outcomes(alg: string): Array<{ label: string; state: Facelets }> {
  const out: Array<{ label: string; state: Facelets }> = []
  for (const pll of PLL_CASES) {
    for (const auf of AUFS) {
      const solution = simplifyAlg([alg, auf, pll.alg].filter(Boolean).join(' '))
      out.push({ label: pll.name, state: applyAlg(SOLVED, invertAlg(solution)) })
    }
  }
  return out
}

/** The stickers a solver can actually see and identify before starting. */
function readable(oll: OLLCase): number[] {
  return [...TWO_SIDED_FACELETS].filter((f) => oll.state[f] !== 'U').sort((a, b) => a - b)
}

interface Question {
  a: number
  b: number
}

/** Shannon entropy of the label distribution, in bits. */
function entropy(labels: string[]): number {
  const counts = new Map<string, number>()
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1)
  let h = 0
  for (const n of counts.values()) {
    const p = n / labels.length
    h -= p * Math.log2(p)
  }
  return h
}

const distinct = (labels: string[]) => new Set(labels).size

interface Node {
  question: Question | null
  branches: Map<Relation, Node>
  labels: string[]
  depth: number
}

function build(
  rows: Array<{ label: string; state: Facelets }>,
  questions: Question[],
  depth: number,
  maxDepth: number,
): Node {
  const labels = rows.map((r) => r.label)
  if (distinct(labels) <= 1 || depth >= maxDepth) {
    return { question: null, branches: new Map(), labels, depth }
  }

  let best: { q: Question; gain: number; split: Map<Relation, typeof rows> } | null = null
  for (const q of questions) {
    const split = new Map<Relation, typeof rows>()
    for (const row of rows) {
      const rel = relate(row.state[q.a], row.state[q.b])
      if (!split.has(rel)) split.set(rel, [])
      split.get(rel)!.push(row)
    }
    if (split.size < 2) continue
    let after = 0
    for (const part of split.values()) after += (part.length / rows.length) * entropy(part.map((r) => r.label))
    const gain = entropy(labels) - after
    if (!best || gain > best.gain + 1e-9) best = { q, gain, split }
  }

  if (!best || best.gain <= 1e-9) return { question: null, branches: new Map(), labels, depth }

  const branches = new Map<Relation, Node>()
  for (const [rel, part] of best.split) branches.set(rel, build(part, questions, depth + 1, maxDepth))
  return { question: best.q, branches, labels, depth }
}

function leaves(node: Node): Node[] {
  if (!node.question) return [node]
  return [...node.branches.values()].flatMap(leaves)
}

const NAME: Record<string, string> = { U: 'top', F: 'front', R: 'right' }
const describe = (f: number) => `${NAME[faceOf(f)]}[${f}]`

// --- Run it ---------------------------------------------------------------

let worstLeaf = 0
let totalDepth = 0
let totalLeaves = 0
const summary: Array<{ name: string; depth: number; worst: number; questions: number }> = []

for (const oll of OLL_CASES) {
  const rows = outcomes(oll.alg)
  const stickers = readable(oll)
  const questions: Question[] = []
  for (let i = 0; i < stickers.length; i++) {
    for (let j = i + 1; j < stickers.length; j++) questions.push({ a: stickers[i], b: stickers[j] })
  }

  const tree = build(rows, questions, 0, 4)
  const ls = leaves(tree)
  const worst = Math.max(...ls.map((l) => distinct(l.labels)))
  const depth = Math.max(...ls.map((l) => l.depth))
  worstLeaf = Math.max(worstLeaf, worst)
  totalDepth += depth
  totalLeaves += ls.length
  summary.push({ name: oll.name, depth, worst, questions: stickers.length })
}

console.log(`${OLL_CASES.length} cases`)
console.log(`  readable stickers: ${Math.min(...summary.map((s) => s.questions))}–${Math.max(...summary.map((s) => s.questions))}`)
console.log(`  tree depth: max ${Math.max(...summary.map((s) => s.depth))}, mean ${(totalDepth / summary.length).toFixed(2)}`)
console.log(`  worst leaf: ${worstLeaf} answers still tied`)
console.log(`  leaves per case: ${(totalLeaves / summary.length).toFixed(1)}`)
console.log(
  `  cases whose tree is not pure at depth 4: ${summary.filter((s) => s.worst > 1).length}`,
)

// One case in full, to see what the rules actually read like.
const show = OLL_CASES[20]
const rows = outcomes(show.alg)
const stickers = readable(show)
const qs: Question[] = []
for (let i = 0; i < stickers.length; i++)
  for (let j = i + 1; j < stickers.length; j++) qs.push({ a: stickers[i], b: stickers[j] })
const tree = build(rows, qs, 0, 4)

console.log(`\n${show.name} — ${show.alg}`)
const walk = (node: Node, prefix: string) => {
  if (!node.question) {
    console.log(`${prefix}=> ${[...new Set(node.labels)].join(', ')}`)
    return
  }
  console.log(`${prefix}${describe(node.question.a)} vs ${describe(node.question.b)}:`)
  for (const [rel, child] of node.branches) walk(child, `${prefix}  ${rel} -> `)
}
walk(tree, '  ')
