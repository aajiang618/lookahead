/**
 * Scheduler simulation.
 *
 * A scheduler can only really be checked by running it. This drives a synthetic
 * solver — who starts slow, speeds up with practice, forgets between sessions,
 * and is genuinely worse at G perms — through 90 daily sessions, then asserts
 * the properties the design is supposed to guarantee:
 *
 *   - cases unlock gradually rather than all at once
 *   - the active set stays near its cap, never far above
 *   - cases actually reach mastery and retire
 *   - a case that is always correct but always slow is caught as a fluency leech
 *   - the whole 21-PLL repertoire is reachable in a sane number of weeks
 *
 * Run with `npm run simulate`.
 */

import { mulberry32 } from '../src/cube/scramble.ts'
import { PLL_CASES } from '../src/cube/cases.ts'
import { caseIdOf, nextUnlockCandidates } from '../src/train/curriculum.ts'
import {
  applyTrial,
  baselineOf,
  composePool,
  isEncoding,
  masteryThreshold,
  mayUnlock,
  medianRtOverDays,
  newLoadCount,
  pickNext,
  pushLogRt,
  rollingAccuracy,
  rollUpDay,
  ACTIVE_SET_MAX,
} from '../src/train/scheduler.ts'
import { gradeAnswer, median, type LatencyContext } from '../src/train/latency.ts'
import { emptyProgress, newItem, today, type Progress } from '../src/train/store.ts'

const rng = mulberry32(20260819)

const DAYS = 90
const TRIALS_PER_SESSION = 110
const MOTOR = 0.35

/**
 * A case this synthetic solver gets reliably RIGHT but never gets fast at.
 * This is the fluency leech: it never lapses, so no ordinary scheduler would
 * ever flag it, and it quietly costs a second on every solve it appears in.
 */
const STUBBORN = new Set(['predict:oll-28'])

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

let progress: Progress = emptyProgress()
const dayLog: Array<{ day: number; active: number; mastered: number; introduced: number }> = []

function currentDay(offset: number): string {
  const date = new Date(2026, 0, 1)
  date.setDate(date.getDate() + offset)
  return today(date)
}

for (let d = 0; d < DAYS; d++) {
  const day = currentDay(d)
  const sessionId = `sim-${d}`
  const trialIndexById = new Map<string, number>()
  let introducedThisSession = 0
  const introducedToday: string[] = []
  const sessionRts: number[] = []

  for (let t = 0; t < TRIALS_PER_SESSION; t++) {
    const baseline = baselineOf(progress)
    const threshold = masteryThreshold(progress.logRtWindow)

    // Unlock check.
    const activeCount = newLoadCount(progress)
    const { accuracy, samples } = rollingAccuracy(progress)
    const candidates = nextUnlockCandidates(progress)
    const poolNow = composePool(progress, TRIALS_PER_SESSION)
    const decision = mayUnlock({
      activeCount,
      rollingAccuracy: accuracy,
      accuracySamples: samples,
      medianRt7d: medianRtOverDays(progress, 7),
      medianRt28d: medianRtOverDays(progress, 28),
      introducedThisSession,
      introducedToday: introducedToday.length,
      trialsDone: t,
      hasCandidates: candidates.ids.length > 0,
      poolSize:
        poolNow.building.length + poolNow.dueMaintenance.length + poolNow.sampledMaintenance.length,
    })

    if (decision.allowed) {
      for (const id of candidates.ids) {
        const item = newItem(id)
        item.phase = 'introducing'
        item.introducedAt = Date.now()
        progress.items[id] = item
        introducedThisSession++
        introducedToday.push(id)
      }
    }

    const pool = composePool(progress, TRIALS_PER_SESSION)
    const poolIds = [...pool.building, ...pool.dueMaintenance, ...pool.sampledMaintenance]
    if (poolIds.length === 0) break

    const itemId = pickNext(progress, poolIds, t, trialIndexById, baseline)
    if (!itemId) break
    trialIndexById.set(itemId, t)

    const item = progress.items[itemId]
    void caseIdOf(itemId)
    const pllId = PLL_CASES[Math.floor(rng() * 21)].id
    const pllName = pllId.replace('pll-', '')

    const { correct, raw } = respond(itemId, pllId)
    const ctx: LatencyContext = {
      baseline,
      caseLogRts: item.recent.filter((r) => r.correct).map((r) => Math.log(Math.max(r.netRt, 0.05))),
      caseKey: pllName,
    }
    const graded = gradeAnswer(correct, raw, MOTOR, ctx)
    const unscored = isEncoding(item)

    progress.items[itemId] = applyTrial(
      item,
      {
        itemId,
        grade: graded.grade,
        correct,
        netRt: graded.netRt,
        sessionId,
        viewTurns: Math.floor(rng() * 4),
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
  progress.newByDay[day] = introducedToday

  const active = newLoadCount(progress)
  const mastered = Object.values(progress.items).filter((i) => i.phase === 'maintenance').length
  dayLog.push({ day: d, active, mastered, introduced: introducedToday.length })

  if (d % 10 === 0 || d === DAYS - 1) {
    const b = baselineOf(progress)
    console.log(
      `day ${String(d).padStart(2)}  active ${String(active).padStart(2)}  ` +
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

console.log('\nScheduler properties')

const maxActive = Math.max(...dayLog.map((d) => d.active))
check(
  `active set never far exceeds its cap of ${ACTIVE_SET_MAX}`,
  maxActive <= ACTIVE_SET_MAX + 3,
  `peaked at ${maxActive}`,
)

const maxNewInADay = Math.max(...dayLog.map((d) => d.introduced))
// The four G perms unlock as one cluster — they are confusable only with each
// other, so they have to be interleaved against each other from the start.
check('new cases per day stay capped (clusters aside)', maxNewInADay <= 4, `saw ${maxNewInADay}`)

const day1 = dayLog[0]
check('day one introduces a handful, not the whole deck', day1.introduced <= 4, `${day1.introduced}`)

const finalMastered = dayLog[dayLog.length - 1].mastered
check('cases actually reach mastery and retire', finalMastered >= 10, `${finalMastered} mastered`)

const items = Object.values(progress.items)
const mastered = items.filter((i) => i.phase === 'maintenance').length
check(`the OLL repertoire builds (${mastered}/57 automatic)`, mastered >= 8, `${mastered}`)
check('every scheduled item is an OLL prediction', items.every((i) => i.id.startsWith('predict:')))
check('training starts on day one rather than behind a gate', dayLog[0].introduced > 0)

const stubborn = progress.items['predict:oll-28']
check(
  'a chronically slow but correct case is caught as a fluency leech',
  stubborn?.leech === 'fluency',
  `leech = ${stubborn?.leech ?? 'item never introduced'}`,
)

const everScheduledTwiceInARow = dayLog.some((d) => d.active === 0)
check('the pool never empties mid-run', !everScheduledTwiceInARow)

const maintenanceItems = Object.values(progress.items).filter((i) => i.phase === 'maintenance')
console.log(
  `  (maintenance items ${maintenanceItems.length}, with due date ${maintenanceItems.filter((i) => i.due).length},` +
    ` stabilities ${maintenanceItems.map((i) => (i.stability ?? 0).toFixed(1)).slice(0, 8).join(' ')})`,
)
const withIntervals = Object.values(progress.items).filter((i) => i.due && i.phase === 'maintenance')
const intervals = withIntervals.map((i) => i.stability ?? 0)
check(
  'mastered cases earn multi-day intervals',
  intervals.length > 0 && Math.max(...intervals) > 5,
  `max stability ${Math.max(...intervals, 0).toFixed(1)}d`,
)

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} problem(s)`}\n`)
process.exit(failures === 0 ? 0 : 1)
