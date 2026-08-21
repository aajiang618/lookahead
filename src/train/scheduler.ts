/**
 * The scheduler: what to show, when to unlock, when to retire, when to stop.
 *
 * Two layers, deliberately kept separate because they run on different clocks:
 *
 *   ARTS  (arts.ts)  — seconds. Which case comes next inside this session.
 *   FSRS-6 (fsrs.ts) — days.    Which cases enter a session at all.
 *
 * The single most common way to break an FSRS implementation is to mix those
 * timescales, so FSRS receives exactly one grade per case per day — the worst
 * of that day's trials, which is the conservative choice — while ARTS updates
 * on every single trial.
 */

import {
  DEFAULT_ARTS,
  personalR,
  selectNext,
  type ArtsItem,
  type ArtsParams,
} from './arts.ts'
import {
  initialMemory,
  nextIntervalDays,
  review,
  shortTermReview,
  type Grade,
  type Memory,
} from './fsrs.ts'
import {
  computeBaseline,
  median,
  percentile,
  slope,
  stdev,
  type Baseline,
} from './latency.ts'
import {
  addDays,
  daysBetween,
  today,
  type ItemProgress,
  type Progress,
  type TrialRecord,
  RECENT_TRIAL_CAP,
  LOG_RT_WINDOW_CAP,
} from './store.ts'

// ---------------------------------------------------------------------------
// Unlock policy
// ---------------------------------------------------------------------------

/**
 * Cases allowed to be learned at the same time.
 *
 * This counts cases that have never been mastered. A case that was automatic
 * and slipped back is relearning, not new load, so it does not consume a slot —
 * otherwise a run of bad luck on retired cases would quietly freeze the
 * curriculum.
 */
export const ACTIVE_SET_MAX = 6
export const DAILY_NEW_CAP = 3
export const SESSION_NEW_CAP = 2
/** Rolling accuracy the solver must hold before new work is added. */
export const ACCURACY_GATE = 0.9
export const ACCURACY_WINDOW = 40
/** Trials of warm-up on known cases before the first unlock may fire. */
export const UNLOCK_AFTER_TRIALS = 15
/** Trials used to encode a brand-new case before it joins the interleaved pool. */
export const ENCODE_TRIALS = 4

export interface UnlockDecision {
  allowed: boolean
  /** Why not, phrased for the interface. */
  blockedBy?: string
}

export interface UnlockInputs {
  activeCount: number
  rollingAccuracy: number
  accuracySamples: number
  medianRt7d: number
  medianRt28d: number
  introducedThisSession: number
  introducedToday: number
  trialsDone: number
  hasCandidates: boolean
  /** Cases already available to drill. Zero on a brand-new profile. */
  poolSize: number
}

export function mayUnlock(input: UnlockInputs): UnlockDecision {
  if (!input.hasCandidates) return { allowed: false, blockedBy: 'Every case is in play' }
  // The warm-up requirement exists so response times are at steady state before
  // new work lands. With an empty deck there is nothing to warm up on, and
  // enforcing it would deadlock: no trials without cases, no cases without trials.
  if (input.poolSize > 0 && input.trialsDone < UNLOCK_AFTER_TRIALS) {
    return { allowed: false, blockedBy: `Warming up — ${UNLOCK_AFTER_TRIALS - input.trialsDone} to go` }
  }
  if (input.activeCount >= ACTIVE_SET_MAX) {
    return { allowed: false, blockedBy: `${ACTIVE_SET_MAX} cases already in progress` }
  }
  if (input.introducedThisSession >= SESSION_NEW_CAP) {
    return { allowed: false, blockedBy: 'Session limit for new cases reached' }
  }
  if (input.introducedToday >= DAILY_NEW_CAP) {
    return { allowed: false, blockedBy: 'Daily limit for new cases reached' }
  }
  if (input.accuracySamples >= ACCURACY_WINDOW && input.rollingAccuracy < ACCURACY_GATE) {
    return { allowed: false, blockedBy: 'Accuracy below 90% — consolidating first' }
  }
  // The condition most schedulers miss: if the solver is getting slower overall,
  // the active set is already saturated and adding to it makes things worse.
  if (input.medianRt28d > 0 && input.medianRt7d > 1.15 * input.medianRt28d) {
    return { allowed: false, blockedBy: 'Recognition is slowing — holding steady' }
  }
  return { allowed: true }
}

// ---------------------------------------------------------------------------
// Mastery and retirement
// ---------------------------------------------------------------------------

export const MASTERY_STREAK = 5
/** Ceiling on log-RT spread. Automatic recognition is consistent, not just fast. */
export const MASTERY_CONSISTENCY = 0.4
export const MASTERY_MIN_SESSIONS = 3
export const MASTERY_MIN_ANGLES = 3

/** The solver's own "good day" pace — the bar a mastered case must clear. */
export function masteryThreshold(logRtWindow: number[]): number {
  if (logRtWindow.length < 20) return 3
  const p25 = percentile(logRtWindow.slice(-200), 25)
  return Math.min(3, Math.max(0.45, Math.exp(p25) * 1.15))
}

export interface MasteryResult {
  mastered: boolean
  /** 0–1, for the progress readout. */
  progress: number
  missing: string[]
}

export function checkMastery(item: ItemProgress, threshold: number): MasteryResult {
  const scored = item.recent.filter((t) => t.scored)
  const last = scored.slice(-MASTERY_STREAK)
  const missing: string[] = []

  const streakOk = item.streak >= MASTERY_STREAK
  if (!streakOk) {
    const short = MASTERY_STREAK - item.streak
    missing.push(`${short} more in a row under ${threshold.toFixed(2)}s`)
  }

  const logs = last.map((t) => Math.log(Math.max(t.netRt, 0.05)))
  const consistencyOk = last.length === MASTERY_STREAK && stdev(logs) <= MASTERY_CONSISTENCY
  if (!consistencyOk && streakOk) missing.push('steadier timing')

  // Counted across the case's whole history, not just the last five trials: a
  // dense session can easily contain all five, and the point of this rule is
  // that mastery cannot be reached in a single sitting.
  const sessionsOk = item.paceSessions.length >= MASTERY_MIN_SESSIONS
  if (!sessionsOk) {
    const short = MASTERY_MIN_SESSIONS - item.paceSessions.length
    missing.push(`${short} more session${short === 1 ? '' : 's'}`)
  }

  const angles = new Set(last.map((t) => t.viewTurns)).size
  const anglesOk = angles >= MASTERY_MIN_ANGLES
  if (!anglesOk && streakOk) missing.push('more viewing angles')

  const checks = [streakOk, consistencyOk, sessionsOk, anglesOk]
  return {
    mastered: checks.every(Boolean),
    progress: checks.filter(Boolean).length / checks.length,
    missing,
  }
}

// ---------------------------------------------------------------------------
// Leeches
// ---------------------------------------------------------------------------

/** Misses within the recent window that mark a case as unreliable. */
export const ACCURACY_LEECH_MISSES = 4
export const ACCURACY_LEECH_WINDOW = 20
export const FLUENCY_LEECH_MIN_TRIALS = 12
/** Multiple of the solver's typical pace that counts as chronically slow. */
export const FLUENCY_LEECH_RATIO = 1.8

/**
 * Two kinds, and the second is the one that matters here. A case can be
 * reliably correct and reliably slow: it will never lapse, so no ordinary
 * scheduler will ever flag it, and it quietly costs a second on every solve
 * where it appears.
 */
export function detectLeech(item: ItemProgress, baseline: Baseline): 'none' | 'accuracy' | 'fluency' {
  // Recent misses, not lifetime ones: any heavily drilled case eventually
  // accumulates a handful of lapses, and counting those would flag the whole
  // repertoire as broken the longer someone trains.
  const window = item.recent.filter((t) => t.scored).slice(-ACCURACY_LEECH_WINDOW)
  const misses = window.filter((t) => !t.correct).length
  if (window.length >= ACCURACY_LEECH_WINDOW && misses >= ACCURACY_LEECH_MISSES) return 'accuracy'

  const correct = item.recent.filter((t) => t.correct && t.scored)
  if (correct.length >= 10 && item.reps >= FLUENCY_LEECH_MIN_TRIALS) {
    const recentMedian = median(correct.slice(-10).map((t) => t.netRt))
    const typical = Math.exp(baseline.mu)
    if (typical > 0 && recentMedian > FLUENCY_LEECH_RATIO * typical) {
      // Only a leech if it is not actually improving.
      const trend = slope(correct.slice(-20).map((t) => Math.log(Math.max(t.netRt, 0.05))))
      if (trend > -0.005) return 'fluency'
    }
  }
  return 'none'
}

/** Tolerance on the frozen mastery pace before a retired case is called stale. */
export const UNRETIRE_SLOWDOWN = 1.4
export const UNRETIRE_SLOW_RUN = 3

/**
 * Whether a mastered case has decayed enough to rejoin active training. A
 * single miss is decisive. Slowness has to be sustained across a short run,
 * because one distracted answer is noise, not decay — demoting on a single
 * slow trial makes the whole repertoire oscillate.
 */
export function shouldUnretire(item: ItemProgress, grade: Grade): boolean {
  if (grade === 1) return true
  const bar = (item.masteredThreshold ?? 1) * UNRETIRE_SLOWDOWN
  const run = item.recent.filter((t) => t.scored).slice(-UNRETIRE_SLOW_RUN)
  return run.length === UNRETIRE_SLOW_RUN && run.every((t) => t.netRt > bar)
}

// ---------------------------------------------------------------------------
// Applying a trial
// ---------------------------------------------------------------------------

export interface TrialOutcome {
  itemId: string
  grade: Grade
  correct: boolean
  netRt: number
  sessionId: string
  viewTurns: number
  pllId: string
  answered?: string
  /** Encode-phase trials build the representation and must not be scored. */
  unscored?: boolean
  /**
   * A hint was taken. The answer still counts for accuracy and still reaches
   * the day-scale scheduler, but it cannot advance the mastery streak: a rep
   * you needed help on is not evidence that the case is automatic.
   */
  hinted?: boolean
}

/**
 * Fold one trial into an item. ARTS state and the mastery streak update every
 * trial; FSRS only sees the same-day short-term path here, with the full
 * day-scale review deferred to `rollUpDay`.
 */
export function applyTrial(
  item: ItemProgress,
  outcome: TrialOutcome,
  threshold: number,
  baseline: Baseline,
  now = Date.now(),
): ItemProgress {
  const record: TrialRecord = {
    at: now,
    sessionId: outcome.sessionId,
    correct: outcome.correct,
    netRt: outcome.netRt,
    grade: outcome.grade,
    answered: outcome.answered,
    viewTurns: outcome.viewTurns,
    pllId: outcome.pllId,
    scored: !outcome.unscored,
    hints: outcome.hinted ? 1 : 0,
  }

  if (outcome.unscored) {
    // Encoding trial: it happened, but it teaches rather than tests. Once the
    // encode quota is met the case joins the interleaved pool for good.
    const encodes = item.encodes + 1
    return {
      ...item,
      encodes,
      phase: encodes >= ENCODE_TRIALS ? 'building' : item.phase,
      recent: [...item.recent, record].slice(-RECENT_TRIAL_CAP),
    }
  }

  const recent = [...item.recent, record].slice(-RECENT_TRIAL_CAP)
  const sessionsSeen = item.sessionsSeen.includes(outcome.sessionId)
    ? item.sessionsSeen
    : [...item.sessionsSeen, outcome.sessionId].slice(-12)

  // The streak counts answers that are correct AND at mastery pace: a slow
  // correct answer is not progress toward automaticity.
  const meetsPace = outcome.correct && outcome.netRt <= threshold && !outcome.hinted
  const streak = meetsPace ? item.streak + 1 : 0
  const paceSessions =
    meetsPace && !item.paceSessions.includes(outcome.sessionId)
      ? [...item.paceSessions, outcome.sessionId].slice(-12)
      : item.paceSessions

  const memory: Memory =
    item.stability === null || item.difficulty === null
      ? initialMemory(outcome.grade)
      : shortTermReview({ stability: item.stability, difficulty: item.difficulty }, outcome.grade)

  const next: ItemProgress = {
    ...item,
    recent,
    sessionsSeen,
    streak,
    paceSessions,
    reps: item.reps + 1,
    lapses: item.lapses + (outcome.grade === 1 ? 1 : 0),
    stability: memory.stability,
    difficulty: memory.difficulty,
    phase: item.phase === 'introducing' ? 'building' : item.phase,
  }

  next.leech = detectLeech(next, baseline)

  if (next.phase === 'building') {
    const mastery = checkMastery(next, threshold)
    if (mastery.mastered) {
      next.phase = 'maintenance'
      next.masteredAt = now
      next.everMastered = true
      next.masteredThreshold = threshold
    }
  } else if (next.phase === 'maintenance' && shouldUnretire(next, outcome.grade)) {
    // Fluency decay a day-scale scheduler cannot see.
    next.phase = 'building'
    next.streak = 0
    // paceSessions is deliberately kept. The case has already proved itself
    // across separate sittings; coming back needs a fresh streak, not a fresh
    // three-day residency, or one unlucky miss costs half a week.
    next.masteredAt = null
    next.masteredThreshold = null
  }

  return next
}

/**
 * End-of-day roll-up. FSRS gets one review per case per day, graded on the
 * worst trial of the day — conservative, and stable across a session that may
 * have shown the same case a dozen times.
 */
export function rollUpDay(item: ItemProgress, day: string): ItemProgress {
  // Everything scored since the last roll-up, however the calendar behaved.
  const pending = item.recent.filter((t) => t.scored && t.at > item.lastRollUpAt)
  if (pending.length === 0) return item

  const worst = pending.reduce<Grade>(
    (acc, t) => (t.grade < acc ? (t.grade as Grade) : acc),
    4 as Grade,
  )

  const elapsed = item.lastReviewDay ? daysBetween(item.lastReviewDay, day) : 0
  const memory: Memory =
    item.stability === null || item.difficulty === null
      ? initialMemory(worst)
      : review({ stability: item.stability, difficulty: item.difficulty }, worst, elapsed)

  const interval = nextIntervalDays(memory, item.phase !== 'maintenance')

  return {
    ...item,
    stability: memory.stability,
    difficulty: memory.difficulty,
    lastReviewDay: day,
    lastRollUpAt: pending[pending.length - 1].at,
    due: addDays(day, interval),
  }
}

/** True while a case is still in its short blocked encoding run. */
export function isEncoding(item: ItemProgress): boolean {
  return item.phase === 'introducing' && item.encodes < ENCODE_TRIALS
}

// ---------------------------------------------------------------------------
// Session pool
// ---------------------------------------------------------------------------

export interface PoolComposition {
  building: string[]
  dueMaintenance: string[]
  /** Not due, sampled anyway: FSRS cannot see speed rot, so we spot-check. */
  sampledMaintenance: string[]
}

export const MAINTENANCE_SAMPLE_SHARE = 0.05

export function composePool(progress: Progress, estimatedTrials: number): PoolComposition {
  const day = today()
  const items = Object.values(progress.items).filter((i) => !i.parked)

  const building = items.filter((i) => i.phase === 'building' || i.phase === 'introducing')
  const maintenance = items.filter((i) => i.phase === 'maintenance')

  const due = maintenance.filter((i) => !i.due || daysBetween(day, i.due) <= 0)
  const notDue = maintenance.filter((i) => i.due && daysBetween(day, i.due) > 0)

  // Prefer the longest-interval cases for spot checks: they are the most likely
  // to have gone stale and the cheapest to confirm.
  const sampleSize = Math.max(0, Math.round(estimatedTrials * MAINTENANCE_SAMPLE_SHARE))
  const sampled = [...notDue]
    .sort((a, b) => (b.stability ?? 0) - (a.stability ?? 0))
    .slice(0, Math.min(sampleSize, notDue.length))

  return {
    building: building.map((i) => i.id),
    dueMaintenance: due.map((i) => i.id),
    sampledMaintenance: sampled.map((i) => i.id),
  }
}

/** Turn stored progress into the shape ARTS wants. */
export function toArtsItems(
  progress: Progress,
  ids: string[],
  trialIndexById: Map<string, number>,
): ArtsItem[] {
  return ids.map((id) => {
    const item = progress.items[id]
    const last = item?.recent[item.recent.length - 1]
    const seenAt = trialIndexById.get(id)
    return {
      id,
      lastTrialIndex: seenAt ?? Number.NEGATIVE_INFINITY,
      lastCorrect: last?.correct ?? true,
      lastNetRt: last?.netRt ?? 1,
      // A freshly introduced case carries a boost so it surfaces early and
      // decays out of the way as it is learned.
      introductionBoost: item && item.reps < 12 ? (12 - item.reps) * 0.25 : 0,
    }
  })
}

export function artsParamsFor(baseline: Baseline): ArtsParams {
  return { ...DEFAULT_ARTS, r: personalR(baseline.mu, baseline.coldStart) }
}

export function pickNext(
  progress: Progress,
  poolIds: string[],
  trialIndex: number,
  trialIndexById: Map<string, number>,
  baseline: Baseline,
): string | null {
  const items = toArtsItems(progress, poolIds, trialIndexById)
  return selectNext(items, trialIndex, artsParamsFor(baseline))?.id ?? null
}

// ---------------------------------------------------------------------------
// Stop rules
// ---------------------------------------------------------------------------

export const FATIGUE_RATIO = 1.25
export const FATIGUE_WINDOW = 20
export const FATIGUE_BASELINE_WINDOW = 30

export interface StopCheck {
  stop: boolean
  reason: string
}

/**
 * Practising while degraded trains the slow, deliberate route — the exact
 * habit this app exists to remove. Better to stop and say so.
 */
export function shouldStop(
  sessionNetRts: number[],
  elapsedSeconds: number,
  budgetSeconds: number,
  recentCorrect: boolean[],
): StopCheck {
  if (elapsedSeconds >= budgetSeconds) return { stop: true, reason: 'Session complete' }

  if (sessionNetRts.length >= FATIGUE_BASELINE_WINDOW + FATIGUE_WINDOW) {
    const early = median(sessionNetRts.slice(0, FATIGUE_BASELINE_WINDOW))
    const late = median(sessionNetRts.slice(-FATIGUE_WINDOW))
    if (early > 0 && late > FATIGUE_RATIO * early) {
      return { stop: true, reason: 'Recognition is slowing — stopping while it still counts' }
    }
  }

  const window = recentCorrect.slice(-10)
  if (window.length === 10 && window.filter((c) => !c).length >= 3) {
    return { stop: true, reason: 'Three misses in ten — worth a break' }
  }

  return { stop: false, reason: '' }
}

// ---------------------------------------------------------------------------
// Baseline maintenance
// ---------------------------------------------------------------------------

export function pushLogRt(progress: Progress, netRt: number): number[] {
  return [...progress.logRtWindow, Math.log(Math.max(netRt, 0.05))].slice(-LOG_RT_WINDOW_CAP)
}

/** Cases occupying a learning slot: in progress and never yet mastered. */
export function newLoadCount(progress: Progress): number {
  return Object.values(progress.items).filter(
    (i) => (i.phase === 'building' || i.phase === 'introducing') && !i.everMastered && !i.parked,
  ).length
}

/** Cases being relearned after having been mastered once. */
export function relearningCount(progress: Progress): number {
  return Object.values(progress.items).filter(
    (i) => i.phase === 'building' && i.everMastered && !i.parked,
  ).length
}

export function baselineOf(progress: Progress): Baseline {
  return computeBaseline(progress.logRtWindow)
}

/** Median net response time over sessions in the last `days` days. */
export function medianRtOverDays(progress: Progress, days: number): number {
  const cutoff = Date.now() - days * 86400000
  const values: number[] = []
  for (const item of Object.values(progress.items)) {
    for (const t of item.recent) {
      if (t.at >= cutoff && t.correct) values.push(t.netRt)
    }
  }
  return values.length ? median(values) : 0
}

export function rollingAccuracy(progress: Progress, window = ACCURACY_WINDOW): {
  accuracy: number
  samples: number
} {
  const all: TrialRecord[] = []
  for (const item of Object.values(progress.items)) all.push(...item.recent)
  all.sort((a, b) => a.at - b.at)
  const recent = all.slice(-window)
  if (recent.length === 0) return { accuracy: 1, samples: 0 }
  return {
    accuracy: recent.filter((t) => t.correct).length / recent.length,
    samples: recent.length,
  }
}

/**
 * Which cases the solver confuses this one with — mined from what they actually
 * answered when wrong. Drives the targeted discrimination drill that a leech
 * escalates into.
 */
export function confusionPairs(item: ItemProgress): Array<{ id: string; count: number }> {
  const counts = new Map<string, number>()
  for (const t of item.recent) {
    if (!t.correct && t.answered) counts.set(t.answered, (counts.get(t.answered) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
}
