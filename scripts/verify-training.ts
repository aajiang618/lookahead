/**
 * The training model.
 *
 * This file used to test a curriculum: an unlock order over the 57 cases,
 * easiest-to-track first, and a gate deciding when the next one was allowed
 * through. None of that exists — the solver picks the cases — so what is worth
 * testing is what replaced it:
 *
 *   - the seam is the unit of recognition, and coverage of it is systematic
 *   - a case teaches exactly once and tests forever after
 *   - a profile from the old model migrates without carrying its ghosts
 */

import { caseIdOf, OLL_GROUPS, predictItemId } from '../src/train/curriculum.ts'
import { OLL_CASES, PLL_CASES } from '../src/cube/cases.ts'
import { chooseOutcome } from '../src/train/useSession.ts'
import { applyTrial, ENCODE_TRIALS, isEncoding } from '../src/train/scheduler.ts'
import { mulberry32 } from '../src/cube/scramble.ts'
import { computeBaseline } from '../src/train/latency.ts'
import {
  DEFAULT_SETTINGS,
  emptyProgress,
  newItem,
  SCHEMA_VERSION,
  importProgress,
  type ItemProgress,
} from '../src/train/store.ts'

let fail = 0
const check = (label: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? '' : ` — ${detail}`}`)
  if (!cond) fail++
}

const baseline = computeBaseline([])

console.log('\nEvery case is selectable, and named the same way everywhere')
{
  check(
    'item ids round-trip to their case',
    OLL_CASES.every((c) => caseIdOf(predictItemId(c.id)) === c.id),
  )

  // The selection screen groups by shape family, so the families have to
  // partition the set — a case in no group is a case you cannot reach.
  const grouped = OLL_CASES.filter((c) => OLL_GROUPS.includes(c.group))
  check(
    `the shape families cover all ${OLL_CASES.length} cases`,
    grouped.length === OLL_CASES.length,
    `${grouped.length} covered`,
  )
  check('no family is empty', OLL_GROUPS.every((g) => OLL_CASES.some((c) => c.group === g)))
}

console.log('\nThe seam is the unit, and coverage of it is systematic')
{
  /*
   * The strong claim: drilling one OLL shows every one of its 21 outcomes in
   * exactly 21 reps, with no repeat before the set is exhausted. Uniform random
   * would take about 74 reps to cover 21 outcomes (the coupon-collector
   * expectation) and would still not guarantee it.
   */
  const rng = mulberry32(12345)
  const seen: string[] = []
  for (let i = 0; i < PLL_CASES.length; i++) {
    const pll = chooseOutcome(seen, rng)
    if (seen.includes(pll.id)) {
      check('no outcome repeats before all are seen', false, `${pll.name} repeated at rep ${i + 1}`)
      break
    }
    seen.push(pll.id)
  }
  check(
    `all ${PLL_CASES.length} outcomes appear within ${PLL_CASES.length} reps`,
    new Set(seen).size === PLL_CASES.length,
    `${new Set(seen).size} distinct`,
  )

  // Once exhausted it keeps drawing rather than stalling.
  const after = chooseOutcome(seen, rng)
  check('it keeps going once every outcome has been seen', Boolean(after))

  // And the record is what drives it: applyTrial has to write the seam down.
  let item: ItemProgress = { ...newItem(predictItemId('oll-21')), phase: 'building' }
  const trial = (pllId: string, unscored = false) =>
    applyTrial(
      item,
      {
        itemId: item.id,
        grade: 3,
        correct: true,
        netRt: 1,
        sessionId: 's1',
        viewTurns: 0,
        pllId,
        unscored,
      },
      1.2,
      baseline,
    )

  item = trial('pll-T')
  check('a rep records its seam', item.seenPlls.includes('pll-T'), item.seenPlls.join())
  item = trial('pll-T')
  check('the same seam is not recorded twice', item.seenPlls.length === 1, `${item.seenPlls.length}`)
  item = trial('pll-Ja')
  check('a second seam is added', item.seenPlls.length === 2)
  check('the rep stamps when the case was last seen', (item.lastSeenAt ?? 0) > 0)

  // A teaching rep is still an exposure: the seam happened whether or not it
  // was scored.
  let fresh: ItemProgress = { ...newItem('predict:oll-1'), phase: 'introducing' }
  fresh = applyTrial(
    fresh,
    { itemId: fresh.id, grade: 3, correct: true, netRt: 0, sessionId: 's1', viewTurns: 0, pllId: 'pll-H', unscored: true },
    1.2,
    baseline,
  )
  check('a teaching rep records its seam too', fresh.seenPlls.includes('pll-H'))
}

console.log('\nA case teaches once, then tests')
{
  check('exactly one teaching rep', ENCODE_TRIALS === 1, `${ENCODE_TRIALS}`)

  let item: ItemProgress = { ...newItem('predict:oll-7'), phase: 'introducing' }
  check('a brand-new case is in its teaching rep', isEncoding(item))

  item = applyTrial(
    item,
    { itemId: item.id, grade: 3, correct: true, netRt: 0, sessionId: 's1', viewTurns: 0, pllId: 'pll-Ua', unscored: true },
    1.2,
    baseline,
  )
  check('after teaching it is no longer encoding', !isEncoding(item))
  check('and it has moved into building', item.phase === 'building', item.phase)
  check('the teaching rep did not score', item.reps === 0, `${item.reps} scored reps`)
}

console.log('\nMigrating off the old model')
{
  /*
   * A version-4 profile: the schedule chose its cases, it had an answering mode
   * and a test selection, and it had learning state earned under lessons and
   * gates that no longer exist.
   */
  const legacy = {
    version: 4,
    createdAt: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      answerMode: 'reveal',
      testCases: ['oll-4', 'oll-21'],
      varyAngle: true,
      cubeZoom: 0.9,
      sessionSeconds: 420,
    },
    items: { 'predict:oll-4': { ...newItem('predict:oll-4'), phase: 'maintenance', reps: 40 } },
    logRtWindow: [0.1, 0.2],
    sessions: [],
    newByDay: {},
    streakDays: 9,
    lastTrainedDay: '2026-01-01',
  }

  const migrated = importProgress(JSON.stringify(legacy))

  check('the version is bumped', migrated.version === SCHEMA_VERSION, `${migrated.version}`)
  check('learning state is reset', Object.keys(migrated.items).length === 0)
  check('a deliberate setting survives', migrated.settings.sessionSeconds === 420)
  check('a hand-set cube zoom survives', migrated.settings.cubeZoom === 0.9)

  /*
   * The trap this migration has fallen into three times: a superseded default
   * is not a preference. varyAngle was the old default and it makes some drills
   * genuinely ambiguous, so it must come back off however the old file read.
   */
  check('a superseded default is reset, not carried', migrated.settings.varyAngle === false)

  // The test picker is the direct ancestor of the training selection, so a
  // chosen set is kept rather than silently emptied.
  check(
    'the old test selection becomes the training selection',
    migrated.settings.trainCases.join() === 'oll-4,oll-21',
    migrated.settings.trainCases.join(),
  )

  const dead = migrated.settings as Record<string, unknown>
  check('settings that no longer exist do not survive', !('answerMode' in dead) && !('testCases' in dead))

  // An item written before seams existed must not arrive missing the field —
  // the first rep would read `undefined.includes` and take the drill down.
  const older = {
    ...legacy,
    version: SCHEMA_VERSION,
    items: { 'predict:oll-9': { ...newItem('predict:oll-9'), seenPlls: undefined, lastSeenAt: undefined } },
  }
  const kept = importProgress(JSON.stringify(older))
  check(
    'an item predating seams gains an empty one',
    Array.isArray(kept.items['predict:oll-9']?.seenPlls),
    JSON.stringify(kept.items['predict:oll-9']?.seenPlls),
  )
}

console.log('\nSettings the reframe depends on')
{
  check('nothing is selected by default', DEFAULT_SETTINGS.trainCases.length === 0)
  check('the real-cube gate is off by default', DEFAULT_SETTINGS.setupFirst === false)
  check('the camera still never rotates', DEFAULT_SETTINGS.varyAngle === false)

  // An empty selection is not "everything": with no schedule to fall back on,
  // treating it as everything would start a 57-case session by accident.
  const p = emptyProgress()
  check('an empty profile has an empty selection', p.settings.trainCases.length === 0)
}

console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail}`}\n`)
process.exit(fail === 0 ? 0 : 1)
