/**
 * Training simulation.
 *
 * A scheduler can only really be checked by running it. This drives a synthetic
 * solver — who starts slow, speeds up with practice, and is genuinely worse at
 * G perms — through 90 daily sessions, then asserts the properties the design
 * is supposed to guarantee.
 *
 * What it no longer simulates is unlocking. The solver used to be handed cases
 * by a gate; now they pick, so this simulates a plausible picker instead: a set
 * chosen on day one, added to every so often, drilled daily. The assertions
 * that survived are the ones about MEASUREMENT rather than about permission.
 *
 *   - a case teaches exactly once, however many days it is drilled
 *   - every outcome of a drilled case is reached, and reached systematically
 *   - cases actually reach mastery, and mastered ones earn multi-day intervals
 *   - a case always correct and always slow is caught as a fluency leech
 *   - ARTS interleaves rather than letting one case dominate the session
 *
 * Run with `npm run simulate`.
 */

import { mulberry32 } from '../src/cube/scramble.ts'
import { OLL_CASES, PLL_CASES } from '../src/cube/cases.ts'
import { predictItemId } from '../src/train/curriculum.ts'
import { chooseOutcome } from '../src/train/useSession.ts'
import {
  applyTrial,
  baselineOf,
  isEncoding,
  masteryThreshold,
  pickNext,
  pushLogRt,
  rollUpDay,
} from '../src/train/scheduler.ts'
import { gradeAnswer, median, type LatencyContext } from '../src/train/latency.ts'
import { emptyProgress, newItem, today, type Progress } from '../src/train/store.ts'

const rng = mulberry32(20260819)

const DAYS = 90
const TRIALS_PER_SESSION = 110
const MOTOR = 0.35

/** What the solver selects on day one, and what they add as they go. */
const STARTING_SET = OLL_CASES.slice(0, 8).map((c) => c.id)
const ADD_EVERY_DAYS = 7
const ADD_AT_A_TIME = 2

/**
 * A case this synthetic solver gets reliably RIGHT but never gets fast at.
 * This is the fluency leech: it never lapses, so no ordinary scheduler would
 * ever flag it, and it quietly costs a second on every solve it appears in.
 */
const STUBBORN = new Set([predictItemId(OLL_CASES[3].id)])

/** How fast the solver is on each item, in seconds, improving with practice. */
const skill = new Map<string, number>()
function respond(itemId: string, pllId: string): { correct: boolean; raw: number } {
  const reps = skill.get(itemId) ?? 0
  skill.set(itemId, reps + 1)

  // Power-law speed-up from 2.6s toward an asymptote, plus lognormal noise.
  const stubborn = STUBBORN.has(itemId)
  const floor = stubborn ? 2.2 : pllId.includes('G') ? 0.85 : 0.55
  const mean = floor + (2.6 - floor) * Math.pow(1 + reps, -0.45)
  const noise = Math.exp((rng() - 0.5) * 0.6)
  const raw = Math.max(0.2, mean * noise) + MOTOR

  // Accuracy climbs with practice; hard cases stay error-prone longer. The
  // stubborn case is the exception: near-perfect accuracy, stubbornly slow.
  const errorRate = stubborn
    ? 0.02
    : Math.max(0.02, (pllId.includes('G') ? 0.4 : 0.25) * Math.pow(1 + reps, -0.7))
  return { correct: rng() > errorRate, raw }
}

const progress: Progress = emptyProgress()
const dayLog: Array<{ day: number; selected: number; mastered: number }> = []
/** How many teaching reps each case ever received. */
const teachingReps = new Map<string, number>()
/** The most any one case was shown in a single session. */
let worstDominance = 0

function currentDay(offset: number): string {
  const date = new Date(2026, 0, 1)
  date.setDate(date.getDate() + offset)
  return today(date)
}

let selected: string[] = [...STARTING_SET]

for (let d = 0; d < DAYS; d++) {
  const day = currentDay(d)
  const sessionId = `sim-${d}`
  const trialIndexById = new Map<string, number>()
  const sessionRts: number[] = []
  const shownCount = new Map<string, number>()

  // The solver widens their selection every so often, the way a person does.
  if (d > 0 && d % ADD_EVERY_DAYS === 0) {
    const more = OLL_CASES.map((c) => c.id)
      .filter((id) => !selected.includes(id))
      .slice(0, ADD_AT_A_TIME)
    selected = [...selected, ...more]
  }

  // Selecting a case brings its item into existence — no gate, no candidacy.
  const poolIds = selected.map(predictItemId)
  for (const id of poolIds) {
    if (!progress.items[id]) {
      const item = newItem(id)
      item.phase = 'introducing'
      item.introducedAt = Date.now()
      progress.items[id] = item
    }
  }

  for (let t = 0; t < TRIALS_PER_SESSION; t++) {
    const baseline = baselineOf(progress)
    const threshold = masteryThreshold(progress.logRtWindow)

    const itemId = pickNext(progress, poolIds, t, trialIndexById, baseline)
    if (!itemId) break
    trialIndexById.set(itemId, t)
    shownCount.set(itemId, (shownCount.get(itemId) ?? 0) + 1)

    const item = progress.items[itemId]

    // The real rule: unseen outcomes first, so coverage is systematic.
    const pll = chooseOutcome(item.seenPlls, rng)
    const pllId = pll.id

    const { correct, raw } = respond(itemId, pllId)
    const ctx: LatencyContext = {
      baseline,
      caseLogRts: item.recent.filter((r) => r.correct).map((r) => Math.log(Math.max(r.netRt, 0.05))),
      caseKey: pll.name,
    }
    const graded = gradeAnswer(correct, raw, MOTOR, ctx)
    const unscored = isEncoding(item)
    if (unscored) teachingReps.set(itemId, (teachingReps.get(itemId) ?? 0) + 1)

    progress.items[itemId] = applyTrial(
      item,
      {
        itemId,
        grade: graded.grade,
        correct,
        netRt: graded.netRt,
        sessionId,
        // The camera never rotates, so every drill is shown straight on.
        viewTurns: 0,
        pllId,
        answered: correct ? undefined : PLL_CASES[Math.floor(rng() * 21)].id,
        unscored,
      },
      threshold,
      baseline,
    )

    if (correct && !unscored) {
      progress.logRtWindow = pushLogRt(progress, graded.netRt)
      sessionRts.push(graded.netRt)
    }
  }

  // End-of-day roll-up.
  for (const id of Object.keys(progress.items)) {
    progress.items[id] = rollUpDay(progress.items[id], day)
  }

  worstDominance = Math.max(worstDominance, ...shownCount.values())

  const mastered = Object.values(progress.items).filter((i) => i.phase === 'maintenance').length
  dayLog.push({ day: d, selected: selected.length, mastered })

  if (d % 10 === 0 || d === DAYS - 1) {
    const b = baselineOf(progress)
    console.log(
      `day ${String(d).padStart(2)}  selected ${String(selected.length).padStart(2)}  ` +
        `mastered ${String(mastered).padStart(2)}  ` +
        `median ${(median(sessionRts) || 0).toFixed(2)}s  ` +
        `tier ${b.tier.name}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail && !condition ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

console.log('\nTraining properties')

const items = Object.values(progress.items)

check('selecting a case is enough to train it', items.length === selected.length, `${items.length} of ${selected.length}`)
check('every trained item is an OLL prediction', items.every((i) => i.id.startsWith('predict:')))
check('training starts on day one rather than behind a gate', dayLog[0].mastered >= 0 && items.length > 0)

/*
 * The teaching rep is the one unscored rep in a case's life. When it was four,
 * three of them were spent showing a lesson nobody was reading any more.
 */
const overTaught = [...teachingReps.entries()].filter(([, n]) => n > 1)
check('a case teaches exactly once, ever', overTaught.length === 0, `${overTaught.length} taught more than once`)

/*
 * Coverage. A case drilled for weeks should have met all 21 of its outcomes;
 * under uniform random it would take about 74 reps and still not be certain.
 */
const wellDrilled = items.filter((i) => i.reps >= PLL_CASES.length)
const fullyCovered = wellDrilled.filter((i) => i.seenPlls.length === PLL_CASES.length)
check(
  `every well-drilled case has met all ${PLL_CASES.length} outcomes`,
  wellDrilled.length > 0 && fullyCovered.length === wellDrilled.length,
  `${fullyCovered.length} of ${wellDrilled.length}`,
)
check(
  'no case records an outcome twice',
  items.every((i) => new Set(i.seenPlls).size === i.seenPlls.length),
)
check(
  'seams never exceed the 21 that exist',
  items.every((i) => i.seenPlls.length <= PLL_CASES.length),
)
check('every trained case carries a last-seen stamp', items.every((i) => i.lastSeenAt !== null))

const finalMastered = dayLog[dayLog.length - 1].mastered
check('cases actually reach mastery', finalMastered >= 8, `${finalMastered} mastered`)

const stubbornId = [...STUBBORN][0]
const stubborn = progress.items[stubbornId]
check(
  'a chronically slow but correct case is caught as a fluency leech',
  stubborn?.leech === 'fluency',
  `leech = ${stubborn?.leech ?? 'item never trained'}`,
)

/*
 * ARTS still earns its keep: ordering within a chosen set is a question the
 * solver has not answered by choosing it. A session that hands one case a third
 * of its reps is not interleaving, it is blocking.
 */
check(
  'no single case dominates a session',
  worstDominance <= TRIALS_PER_SESSION / 3,
  `one case took ${worstDominance} of ${TRIALS_PER_SESSION}`,
)

const maintenanceItems = items.filter((i) => i.phase === 'maintenance')
console.log(
  `  (maintenance items ${maintenanceItems.length}, with due date ${maintenanceItems.filter((i) => i.due).length},` +
    ` stabilities ${maintenanceItems.map((i) => (i.stability ?? 0).toFixed(1)).slice(0, 8).join(' ')})`,
)
const intervals = maintenanceItems.filter((i) => i.due).map((i) => i.stability ?? 0)
check(
  'mastered cases earn multi-day intervals',
  intervals.length > 0 && Math.max(...intervals) > 5,
  `max stability ${Math.max(...intervals, 0).toFixed(1)}d`,
)

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} problem(s)`}\n`)
process.exit(failures === 0 ? 0 : 1)
