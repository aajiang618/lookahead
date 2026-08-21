/**
 * Curriculum tests.
 *
 * One track: the 57 OLL cases, introduced easiest-to-track first. There is no
 * separate PLL-recognition track any more, so there is no gate to test — only
 * that the order is sane and the whole set is reachable.
 */

import {
  allItemIds,
  caseIdOf,
  nextGroupIds,
  nextUnlockCandidates,
  OLL_UNLOCK_ORDER,
  predictItemId,
} from '../src/train/curriculum.ts'
import { OLL_BY_ID, OLL_CASES } from '../src/cube/cases.ts'
import { emptyProgress, newItem, type Progress } from '../src/train/store.ts'

let fail = 0
const check = (label: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? '' : ` — ${detail}`}`)
  if (!cond) fail++
}

console.log('\nOne track, all 57 cases')
{
  const p: Progress = emptyProgress()
  check('every schedulable item is an OLL prediction', allItemIds().every((id) => id.startsWith('predict:')))
  check(`the order covers all ${OLL_CASES.length} cases exactly once`, new Set(OLL_UNLOCK_ORDER).size === OLL_CASES.length)

  const seed = nextGroupIds(p, 4)
  check('a fresh profile seeds four cases', seed.length === 4)
  const first = OLL_BY_ID.get(caseIdOf(seed[0]))
  check(
    `the first case is an easy one to track (${first?.name}, ${first?.group})`,
    first?.group === 'Corners oriented' || first?.group === 'Edges oriented',
    String(first?.group),
  )

  // Walk the whole curriculum and confirm it reaches all 57 without stalling.
  const picked: string[] = []
  for (let i = 0; i < 200; i++) {
    const next = nextUnlockCandidates(p).ids
    if (next.length === 0) break
    for (const id of next) {
      const item = newItem(id)
      item.phase = 'building'
      p.items[id] = item
      picked.push(id)
    }
  }
  check(`all ${OLL_CASES.length} cases are reachable (${picked.length} unlocked)`, picked.length === OLL_CASES.length)
  check('the curriculum terminates', nextUnlockCandidates(p).ids.length === 0)
  check('no duplicates along the way', new Set(picked).size === picked.length)
}

console.log('\nUnlock order is easiest-first')
{
  const groups = OLL_UNLOCK_ORDER.slice(0, 9).map((id) => OLL_BY_ID.get(id)?.group)
  check(
    'the first nine cases are short, easy-to-track families',
    groups.every((g) => ['Corners oriented', 'Edges oriented', 'T shape', 'Square'].includes(g ?? '')),
    groups.join(', '),
  )
  const dotPositions = OLL_UNLOCK_ORDER.map((id, i) => ({ i, g: OLL_BY_ID.get(id)?.group }))
    .filter((x) => x.g === 'Dot')
    .map((x) => x.i)
  check('dot cases come last', Math.min(...dotPositions) > 40, `first dot at ${Math.min(...dotPositions)}`)

  check(
    'item ids round-trip to their case',
    OLL_CASES.every((c) => caseIdOf(predictItemId(c.id)) === c.id),
  )
}

console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail}`}\n`)
process.exit(fail === 0 ? 0 : 1)
