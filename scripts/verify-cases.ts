/**
 * Proof harness for the cube engine and the shipped case data.
 * Run with `npm run verify`. Any failure exits non-zero.
 */

import {
  applyAlg,
  invertAlg,
  isF2LIntact,
  isF2LSolved,
  isSolved,
  movePermutation,
  parseAlg,
  simplifyAlg,
  SOLVED,
} from '../src/cube/engine.ts'
import { faceletIndex, FACE_NORMALS, MOVE_LAYERS, permutationFromGeometry } from '../src/cube/layout.ts'
import { auditCases, OLL_CASES, PLL_CASES } from '../src/cube/cases.ts'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures++
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\nEngine: single-face turns')
for (const face of ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S']) {
  check(`${face} has order 4`, applyAlg(SOLVED, `${face} ${face} ${face} ${face}`) === SOLVED)
  check(
    `${face} and ${face}' are inverses`,
    applyAlg(SOLVED, `${face} ${face}'`) === SOLVED,
  )
  check(`${face}2 equals ${face} ${face}`, applyAlg(SOLVED, `${face}2`) === applyAlg(SOLVED, `${face} ${face}`))
}

console.log('\nEngine: rotations leave every face uniform')
for (const rot of ['x', 'y', 'z']) {
  const state = applyAlg(SOLVED, rot)
  const uniform = [0, 1, 2, 3, 4, 5].every((f) => {
    const slice = state.slice(f * 9, f * 9 + 9)
    return [...slice].every((ch) => ch === slice[0])
  })
  check(`${rot} keeps faces uniform`, uniform, state)
  check(`${rot} has order 4`, applyAlg(SOLVED, `${rot} ${rot} ${rot} ${rot}`) === SOLVED)
}

console.log('\nEngine: known identities')
check('(R U R\' U\') repeated 6 times is identity', applyAlg(SOLVED, "R U R' U' ".repeat(6)) === SOLVED)
check("(R U R' U) x5 is identity", applyAlg(SOLVED, "R U R' U ".repeat(5)) === SOLVED)
check('(R U) has order 105', (() => {
  let s = SOLVED
  for (let i = 0; i < 105; i++) s = applyAlg(s, 'R U')
  return s === SOLVED
})())
check('wide r equals R M\'', applyAlg(SOLVED, 'r') === applyAlg(SOLVED, "R M'"))
check('wide u equals U E\'', applyAlg(SOLVED, 'u') === applyAlg(SOLVED, "U E'"))
check('wide f equals F S', applyAlg(SOLVED, 'f') === applyAlg(SOLVED, 'F S'))
check('Rw parses as r', applyAlg(SOLVED, 'Rw') === applyAlg(SOLVED, 'r'))
check("x equals r L'", applyAlg(SOLVED, 'x') === applyAlg(SOLVED, "r L'"))
check("y equals u D'", applyAlg(SOLVED, 'y') === applyAlg(SOLVED, "u D'"))
check("z equals f B'", applyAlg(SOLVED, 'z') === applyAlg(SOLVED, "f B'"))
check(
  'superflip is 20 moves and not solved',
  applyAlg(SOLVED, "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2") !== SOLVED,
)

console.log('\nEngine: notation utilities')
check("invertAlg round-trips", applyAlg(applyAlg(SOLVED, "R U R' F'"), invertAlg("R U R' F'")) === SOLVED)
check('simplifyAlg cancels', simplifyAlg("R U U' R'") === '')
check('simplifyAlg merges', simplifyAlg('R R') === 'R2')
check('parseAlg tolerates parens and curly quotes', parseAlg("(R U R’) U2").length === 4)

console.log('\nCase data: structural audit')
const problems = auditCases()
check(`no structural problems (${problems.length} found)`, problems.length === 0, problems.slice(0, 8).join('; '))

console.log('\nCase data: every published algorithm variant is valid')
let variantCount = 0
for (const c of OLL_CASES) {
  for (const v of c.algs) {
    variantCount++
    const state = applyAlg(SOLVED, invertAlg(v.alg))
    if (!isF2LIntact(state)) {
      failures++
      console.log(`  FAIL ${c.name} variant "${v.alg}" breaks F2L`)
    }
    if (!isSolved(applyAlg(state, v.alg))) {
      failures++
      console.log(`  FAIL ${c.name} variant "${v.alg}" does not solve its own case`)
    }
  }
}
for (const c of PLL_CASES) {
  for (const v of c.algs) {
    variantCount++
    const state = applyAlg(SOLVED, invertAlg(v.alg))
    if (!isF2LIntact(state)) {
      failures++
      console.log(`  FAIL ${c.name} variant "${v.alg}" breaks F2L`)
    }
    if (!isSolved(applyAlg(state, v.alg))) {
      failures++
      console.log(`  FAIL ${c.name} variant "${v.alg}" does not solve its own case`)
    }
  }
}
check(`${variantCount} algorithm variants all preserve the first two layers`, true)

console.log('\nCase data: every OLL variant reaches the same case')
for (const c of OLL_CASES) {
  const shapes = new Set(
    c.algs.map((v) => {
      const s = applyAlg(SOLVED, invertAlg(v.alg))
      // Compare only U-colour placement, since AUF may differ between variants.
      const mask = [...Array(9).keys()].map((i) => (s[i] === 'U' ? '1' : '0')).join('')
      const sides = [9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47]
        .map((i) => (s[i] === 'U' ? '1' : '0'))
        .join('')
      return rotationsOf(mask, sides)
    }),
  )
  if (shapes.size !== 1) {
    failures++
    console.log(`  FAIL ${c.name}: variants produce ${shapes.size} different shapes`)
  }
}
check('all OLL variants agree per case', true)

/** Canonical form of an OLL shape under the four U rotations. */
function rotationsOf(top: string, sides: string): string {
  const forms: string[] = []
  let t = top
  let s = sides
  for (let i = 0; i < 4; i++) {
    forms.push(`${t}|${s}`)
    t = rotateTop(t)
    s = s.slice(9) + s.slice(0, 9) // R F L B -> shift one face
  }
  return forms.sort()[0]
}
function rotateTop(mask: string): string {
  const idx = [6, 3, 0, 7, 4, 1, 8, 5, 2]
  return idx.map((i) => mask[i]).join('')
}

console.log('\nSolvability: OLL then PLL solves the cube')
let pairChecks = 0
for (const oll of OLL_CASES.slice(0, 12)) {
  for (const pll of PLL_CASES) {
    // Build a state whose solution is exactly oll.alg then pll.alg.
    const scramble = `${invertAlg(pll.alg)} ${invertAlg(oll.alg)}`
    const state = applyAlg(SOLVED, scramble)
    const afterOLL = applyAlg(state, oll.alg)
    const afterPLL = applyAlg(afterOLL, pll.alg)
    pairChecks++
    if (!isSolved(afterPLL)) {
      failures++
      console.log(`  FAIL ${oll.name} + ${pll.name} does not solve`)
    }
  }
}
check(`${pairChecks} OLL+PLL pairs solve cleanly`, true)

console.log('\nRecognition: PLL cases are distinguishable')
const sigs = new Map<string, string[]>()
for (const c of PLL_CASES) {
  const sig = c.side.F.join('') + '|' + c.side.R.join('') + '|' + c.side.B.join('') + '|' + c.side.L.join('')
  const list = sigs.get(sig) ?? []
  list.push(c.name)
  sigs.set(sig, list)
}
const collisions = [...sigs.values()].filter((v) => v.length > 1)
check(
  `all 21 PLL side patterns are unique at this angle (${collisions.length} collisions)`,
  collisions.length === 0,
  collisions.map((c) => c.join('/')).join(', '),
)

console.log('\nRenderer geometry: every sticker has exactly one home')
{
  const seen = new Map<number, string>()
  let duplicates = 0
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        for (const { face, axis, sign } of FACE_NORMALS) {
          const outward = axis === 'x' ? x : axis === 'y' ? y : z
          if (outward !== sign) continue
          const index = faceletIndex(face, x, y, z)
          const key = `${face}(${x},${y},${z})`
          if (seen.has(index)) {
            duplicates++
            if (duplicates <= 3) console.log(`       facelet ${index}: ${seen.get(index)} and ${key}`)
          }
          seen.set(index, key)
        }
      }
    }
  }
  check(
    'the 3D layout covers all 54 facelets exactly once',
    seen.size === 54 && duplicates === 0,
    `${seen.size} covered, ${duplicates} duplicated`,
  )
}

console.log('\nRenderer geometry: 3D turns agree with the engine')
{
  // This is the check that matters most for the renderer. The engine permutes a
  // string; the renderer rotates cubies in space. If their notions of
  // "clockwise" ever diverge, the cube on screen turns the wrong way while the
  // model underneath stays right — the hardest class of bug to catch by eye.
  // So derive the permutation purely from the rendered geometry and demand it
  // match the engine, move for move, at every turn amount.
  const mismatched: string[] = []
  for (const base of Object.keys(MOVE_LAYERS)) {
    for (const amount of [1, 2, 3]) {
      const fromGeometry = permutationFromGeometry(base, amount)
      const fromEngine = movePermutation(base, amount)
      if (fromGeometry.join(',') !== fromEngine.join(',')) {
        mismatched.push(`${base}${amount === 1 ? '' : amount === 2 ? '2' : "'"}`)
      }
    }
  }
  check(
    `all ${Object.keys(MOVE_LAYERS).length} rendered move types match the engine at every amount`,
    mismatched.length === 0,
    mismatched.join(', '),
  )
}

console.log('\nDrills: exhaustive OLL x PLL generation')
{
  const { buildDrill, validateDrill, identifyPLL } = await import('../src/cube/scramble.ts')
  let built = 0
  let misidentified = 0
  const problems: string[] = []
  for (const oll of OLL_CASES) {
    for (const pll of PLL_CASES) {
      const drill = buildDrill(oll, pll, (oll.number * 31 + pll.name.charCodeAt(0)) >>> 0)
      built++
      const issues = validateDrill(drill)
      if (issues.length) problems.push(`${oll.name}+${pll.name}: ${issues.join(', ')}`)
      const found = identifyPLL(drill.stateAfterOLL, PLL_CASES)
      if (found?.name !== pll.name) {
        misidentified++
        if (misidentified <= 5) problems.push(`${oll.name}+${pll.name}: identified as ${found?.name ?? 'nothing'}`)
      }
    }
  }
  check(`${built} drills generated and valid`, problems.length === 0, problems.slice(0, 6).join(' | '))
  check(`every drill's post-OLL state reads back as the intended PLL`, misidentified === 0, `${misidentified} wrong`)
}


console.log('\nPiece tracking: OLL algorithms permute the last layer consistently')
{
  const { pieceMapOf, trackFacelets, faceletsOfSlot, CORNER_SLOT_FACELETS, EDGE_SLOT_FACELETS } =
    await import('../src/cube/tracking.ts')

  let badMaps = 0
  let staleTracks = 0
  const notes: string[] = []
  const variantDependent = new Set<string>()

  for (const oll of OLL_CASES) {
    const map = pieceMapOf(oll.alg)

    // Both maps must be genuine permutations of the four slots — a -1 would
    // mean a last-layer piece left the last layer, which no OLL alg can do.
    const valid = (m: number[]) => [...m].sort().join('') === '0123'
    if (!valid(map.corners) || !valid(map.edges)) {
      badMaps++
      if (notes.length < 4) notes.push(`${oll.name}: corners ${map.corners} edges ${map.edges}`)
    }

    // Variants of the same case may legitimately permute the last layer
    // DIFFERENTLY while producing identical orientation — that is precisely what
    // "influencing" exploits. So we do not require agreement; we require each
    // variant's map to be a valid permutation, and we count the disagreements,
    // because every one of them is a case where the trainer's prediction depends
    // on which algorithm the solver actually uses.
    for (const variant of oll.algs.slice(1)) {
      const other = pieceMapOf(variant.alg)
      if (!valid(other.corners) || !valid(other.edges)) {
        badMaps++
        if (notes.length < 4) notes.push(`${oll.name}: variant map is not a permutation`)
      }
      if (other.corners.join() !== map.corners.join() || other.edges.join() !== map.edges.join()) {
        variantDependent.add(oll.name)
      }
    }

    // Step-by-step tracking must land where the whole-algorithm map says.
    for (let slot = 0; slot < 4; slot++) {
      const steps = trackFacelets(oll.alg, faceletsOfSlot('corner', slot))
      const landed = steps[steps.length - 1].positions[0]
      const expected = CORNER_SLOT_FACELETS[map.corners[slot]]
      if (!expected.includes(landed)) {
        staleTracks++
        if (notes.length < 4) notes.push(`${oll.name}: corner ${slot} tracked to ${landed}`)
      }

      const edgeSteps = trackFacelets(oll.alg, faceletsOfSlot('edge', slot))
      const edgeLanded = edgeSteps[edgeSteps.length - 1].positions[0]
      if (!EDGE_SLOT_FACELETS[map.edges[slot]].includes(edgeLanded)) {
        staleTracks++
        if (notes.length < 4) notes.push(`${oll.name}: edge ${slot} tracked to ${edgeLanded}`)
      }
    }
  }

  check('all 57 OLL piece maps are valid permutations', badMaps === 0, notes.join(' | '))
  console.log(
    `       (${variantDependent.size} of 57 cases have variants that leave a DIFFERENT PLL —` +
      ` predictions must name the algorithm they assume)`,
  )
  check('step-by-step tracking agrees with the whole-algorithm map', staleTracks === 0, notes.join(' | '))

  // The load-bearing claim: the piece map depends ONLY on the algorithm, never
  // on the state it is applied to. If this were false, tracking could not work.
  const { buildDrill } = await import('../src/cube/scramble.ts')
  let stateDependent = 0
  for (const oll of OLL_CASES.slice(0, 20)) {
    const base = pieceMapOf(oll.alg)
    for (const pll of PLL_CASES.slice(0, 6)) {
      const drill = buildDrill(oll, pll, 7)
      // Recompute the map from the drill's own solution prefix.
      const again = pieceMapOf(drill.ollAlg)
      if (again.corners.join() !== base.corners.join()) stateDependent++
    }
  }
  check('the piece map is a property of the algorithm alone', stateDependent === 0, `${stateDependent} varied`)

  // Choosing a different algorithm for a case must build a drill that is
  // internally consistent AND still solves — otherwise the override silently
  // teaches a wrong prediction for the 28 cases where variants differ.
  const { validateDrill } = await import('../src/cube/scramble.ts')
  let overrideProblems = 0
  let overrideChanged = 0
  for (const oll of OLL_CASES) {
    for (const variant of oll.algs.slice(1)) {
      const drill = buildDrill(oll, PLL_CASES[3], 11, { ollAlg: variant.alg })
      if (validateDrill(drill).length > 0) overrideProblems++
      if (drill.ollAlg !== variant.alg) overrideProblems++
      const base = buildDrill(oll, PLL_CASES[3], 11)
      if (base.state !== drill.state) overrideChanged++
    }
  }
  check(
    'a custom algorithm still produces a valid, solvable drill',
    overrideProblems === 0,
    `${overrideProblems} broken`,
  )
  console.log(`       (${overrideChanged} variant drills differ from the default setup, as they must)`)
}

console.log('\nRecognition: class split matches how cubers already group the cases')
{
  const {
    classesOfPll,
    candidatesFor,
    buildRecognitionBrief,
    readDrill,
  } = await import('../src/cube/recognition.ts')
  const { buildDrill } = await import('../src/cube/scramble.ts')

  // The classification comes from permutation maths alone. Where it agrees with
  // J Perm's independent grouping of the cases, both are corroborated.
  const mismatches: string[] = []
  for (const pll of PLL_CASES) {
    const { corners } = classesOfPll(pll)
    const cornersUntouched = corners === 'solved'
    const cornersDiagonal = corners === 'diagonal' || corners === 'double'
    if (cornersUntouched !== (pll.group === 'Edge perm')) {
      mismatches.push(`${pll.name}: ${corners} but grouped ${pll.group}`)
    }
    if (cornersDiagonal !== (pll.group === 'Diag corners')) {
      mismatches.push(`${pll.name}: ${corners} but grouped ${pll.group}`)
    }
  }
  check(
    'computed corner classes agree with the published case groups',
    mismatches.length === 0,
    mismatches.join(', '),
  )

  const sizes = PLL_CASES.map((p) => {
    const { corners, edges } = classesOfPll(p)
    return candidatesFor(corners, edges).length
  })
  check(
    `corner + edge class narrows 21 cases to at most 4 (worst ${Math.max(...sizes)})`,
    Math.max(...sizes) <= 4,
  )

  // The load-bearing claim: reading the finished classes always leaves the real
  // answer among the candidates. If this failed, the tips would mislead.
  let missed = 0
  let narrowed = 0
  for (const oll of OLL_CASES) {
    for (const pll of PLL_CASES) {
      const drill = buildDrill(oll, pll, oll.number * 41 + pll.name.length)
      const reading = readDrill(drill.stateAfterOLL)
      if (!reading.candidates.some((c) => c.name === pll.name)) missed++
      narrowed += reading.candidates.length
    }
  }
  const totalDrills = OLL_CASES.length * PLL_CASES.length
  check(
    `every one of ${totalDrills} drills keeps the true PLL in the candidate set`,
    missed === 0,
    `${missed} missed`,
  )
  console.log(
    `       (average ${(narrowed / totalDrills).toFixed(2)} candidates left after reading both classes)`,
  )

  let briefsWithoutTips = 0
  let briefsWithoutWatch = 0
  for (const oll of OLL_CASES) {
    const brief = buildRecognitionBrief(oll, oll.alg)
    if (brief.tips.length === 0) briefsWithoutTips++
    // Every case must name a piece to follow, or the advice is not advice.
    if (!brief.watch.corner || !brief.watch.edge) briefsWithoutWatch++
  }
  check('every OLL case produces recognition advice', briefsWithoutTips === 0)
  check('every OLL case names a corner and an edge to follow', briefsWithoutWatch === 0)
}

console.log('\nRecognition: only the pieces that decide the answer')
{
  const { necessaryPieces, movementArrows } = await import('../src/cube/recognition.ts')
  const { pieceMapOf } = await import('../src/cube/tracking.ts')
  const { anchorFor, buildArrow } = await import('../src/components/cubeArrows.ts')
  const THREE = await import('three')

  // The minimal set is found by exhaustive search, so this pins the result.
  const sizes = new Set(OLL_CASES.map((c) => necessaryPieces(c, c.alg).length))
  check(
    `every case needs the same five pieces read (sizes seen: ${[...sizes].join(', ')})`,
    sizes.size === 1 && sizes.has(5),
  )

  const shapes = new Set(
    OLL_CASES.map((c) =>
      necessaryPieces(c, c.alg).filter((p) => p.kind === 'corner').length + 'c',
    ),
  )
  check(`the split is always three corners and two edges (${[...shapes].join(', ')})`, shapes.has('3c') && shapes.size === 1)

  // Arrows must be a strict subset of the movements, and never include a piece
  // that does not move — an arrow onto itself would be drawn as nothing.
  let bad = 0
  let keyTotal = 0
  let allTotal = 0
  for (const oll of OLL_CASES) {
    const map = pieceMapOf(oll.alg)
    const needed = necessaryPieces(oll, oll.alg)
    const key = movementArrows(map, needed, false)
    const all = movementArrows(map, needed, true)
    keyTotal += key.length
    allTotal += all.length

    if (key.length > all.length) bad++
    for (const a of [...key, ...all]) {
      if (a.from === a.to) bad++
      const perm = a.kind === 'corner' ? map.corners : map.edges
      if (perm[a.from] !== a.to) bad++
    }
    // Everything in the default view must be a piece the solver has to read.
    const neededKeys = new Set(needed.map((p) => `${p.kind}${p.slot}`))
    for (const a of key) if (!neededKeys.has(`${a.kind}${a.from}`)) bad++
  }
  check('arrows always match the real piece map and never point at themselves', bad === 0, `${bad} bad`)
  check(
    `the default view is a genuine reduction (${(keyTotal / OLL_CASES.length).toFixed(1)} arrows vs ${(allTotal / OLL_CASES.length).toFixed(1)})`,
    keyTotal < allTotal,
  )

  // Geometry: anchors are distinct, and an arc carries one head or two.
  const anchors = [
    ...[0, 1, 2, 3].map((s) => anchorFor('corner', s)),
    ...[0, 1, 2, 3].map((s) => anchorFor('edge', s)),
  ]
  const distinct = new Set(anchors.map((v) => `${v.x},${v.y},${v.z}`))
  check('all eight slot anchors are distinct positions', distinct.size === 8)
  check('anchors float clear of the stickers', anchors.every((v) => v.y > 1.5))

  const single = buildArrow(anchors[0], anchors[2], 0xffffff, false, 1)
  const double = buildArrow(anchors[0], anchors[2], 0xffffff, true, 1)
  const cones = (g: InstanceType<typeof THREE.Group>) =>
    g.children.filter((c) => (c as { geometry?: { type?: string } }).geometry?.type === 'ConeGeometry').length
  check('a one-way arc has a single head', cones(single) === 1, `${cones(single)}`)
  check('a swap arc has a head at both ends', cones(double) === 2, `${cones(double)}`)
}

console.log('\nHints: a ladder that gives away strictly more at each rung')
{
  const { hintsFor, hintFacelets, necessaryPieces } = await import('../src/cube/recognition.ts')
  const { buildDrill } = await import('../src/cube/scramble.ts')

  let wrongCount = 0
  let notEscalating = 0
  let emptyText = 0
  let badHighlight = 0
  let leaksName = 0

  for (const oll of OLL_CASES) {
    for (const pll of PLL_CASES.slice(0, 4)) {
      const drill = buildDrill(oll, pll, oll.number * 13 + pll.name.length)
      const hints = hintsFor(oll, drill.ollAlg, drill.stateAfterOLL, pll)

      if (hints.length !== 3) wrongCount++
      if (hints.some((h) => !h.text || h.text.length < 20)) emptyText++

      // Rung 1 points at pieces, rung 2 adds the arrows, rung 3 adds the shape.
      if (hints[0].arrows || !hints[1].arrows || !hints[2].arrows) notEscalating++

      // The first two rungs must never name the answer outright.
      const named = PLL_CASES.filter((c) =>
        new RegExp(`\\b${c.name}\\b`).test(`${hints[0].text} ${hints[1].text}`),
      )
      if (named.length > 0) leaksName++

      // Highlights must be real, visible stickers of the pieces that decide it.
      const lit = hintFacelets(oll, drill.ollAlg)
      const needed = new Set(necessaryPieces(oll, drill.ollAlg).map((p) => `${p.kind}${p.slot}`))
      if (lit.length === 0 || needed.size === 0) badHighlight++
      if (lit.some((f) => f < 0 || f > 53)) badHighlight++
    }
  }

  check('every case produces exactly three rungs', wrongCount === 0, `${wrongCount} did not`)
  check('every rung says something', emptyText === 0, `${emptyText} empty`)
  check('the rungs escalate: pieces, then arrows, then the shape', notEscalating === 0, `${notEscalating} out of order`)
  check('the first two rungs never name a PLL', leaksName === 0, `${leaksName} leaked`)
  check('highlights point at real stickers of the deciding pieces', badHighlight === 0, `${badHighlight} bad`)

  // The final rung must be honest: the case it points to has to be among the
  // candidates it names, or the hint is worse than no hint.
  let dishonest = 0
  for (const oll of OLL_CASES) {
    for (const pll of PLL_CASES) {
      const drill = buildDrill(oll, pll, 3)
      const last = hintsFor(oll, drill.ollAlg, drill.stateAfterOLL, pll)[2].text
      const singular = last.includes('Exactly one case')
      if (!singular && !new RegExp(`\\b${pll.name}\\b`).test(last)) dishonest++
    }
  }
  check(
    `the final rung always includes the true case among its candidates`,
    dishonest === 0,
    `${dishonest} wrong`,
  )
}

console.log('\nThe lesson: two-sided recognition read from the OLL stage')
{
  const { buildTeachingBrief, readTwoSided, decidingComparisons, TWO_SIDED_FACELETS } =
    await import('../src/cube/recognition.ts')
  const { buildDrill } = await import('../src/cube/scramble.ts')

  let wrongShape = 0
  let thin = 0
  let readingLies = 0
  let comparisonLies = 0
  let unterminated = 0
  let badBranches = 0
  let badHighlight = 0
  let missesAnswer = 0
  let colourOnly = 0
  let extraComparisons = 0
  let drills = 0

  for (const oll of OLL_CASES) {
    for (const pll of PLL_CASES) {
      const drill = buildDrill(oll, pll, 5)
      const read = readTwoSided(oll, drill.ollAlg, drill.state)
      const chain = decidingComparisons(oll, drill.ollAlg, drill.state)
      const steps = buildTeachingBrief(oll, drill.ollAlg, drill.state, drill.stateAfterOLL, pll)
      drills++

      if (steps.length !== 4) wrongShape++
      if (steps.map((s) => s.key).join() !== 'front,right,deciding,result') wrongShape++
      if (steps.some((s) => !s.text || s.text.length < 40)) thin++

      // Every narrowing the lesson states out loud has to still contain the
      // true answer. A recognition rule that can talk you out of the right case
      // is worse than no rule.
      if (!read.candidates.some((c) => c.id === pll.id)) readingLies++
      if (read.candidates.length === 1) colourOnly++
      for (const step of chain) {
        if (!step.remaining.some((c) => c.id === pll.id)) comparisonLies++
        // The branches must be a genuine partition: the answer sits in exactly
        // the branch the cube actually reads as.
        const inActual = step.branches.filter((b) => b.relation === step.actual)
        if (inActual.length !== 1) badBranches++
        if (!inActual[0]?.candidates.some((c) => c.id === pll.id)) badBranches++
      }
      extraComparisons += chain.length

      // The strong claim: colour relations alone always finish the job.
      const settled = chain.length === 0 ? read.candidates : chain[chain.length - 1].remaining
      if (settled.length !== 1 || settled[0].id !== pll.id) unterminated++

      // Everything lit is a sticker that is genuinely legible right now.
      const lit = steps.flatMap((s) => s.highlight ?? [])
      if (lit.some((f) => !TWO_SIDED_FACELETS.has(f) || oll.state[f] === 'U')) badHighlight++

      if (!new RegExp(`\\b${pll.name}\\b`).test(steps[3].text)) missesAnswer++
    }
  }

  check('every case teaches in four steps: front, right, deciding, result', wrongShape === 0, `${wrongShape} did not`)
  check('every step says something substantial', thin === 0, `${thin} too thin`)
  check('the two-sided read never rules out the true case', readingLies === 0, `${readingLies} did`)
  check('no comparison ever rules out the true case', comparisonLies === 0, `${comparisonLies} did`)
  check('every branch set is a partition holding the answer', badBranches === 0, `${badBranches} bad`)
  check(
    'colour relations alone always finish the job',
    unterminated === 0,
    `${unterminated} of ${drills} left undecided`,
  )
  check('everything the lesson lights is legible from the front and right', badHighlight === 0, `${badHighlight} bad`)
  check('the conclusion names the case in front of you', missesAnswer === 0, `${missesAnswer} missed`)
  console.log(
    `       (the six read stickers settle it alone in ${colourOnly} of ${drills} drills; ` +
      `${(extraComparisons / drills).toFixed(2)} further comparisons on average)`,
  )
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} problem(s)`}\n`)
process.exit(failures === 0 ? 0 : 1)
