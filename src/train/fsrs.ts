/**
 * FSRS-6 — the day-scale scheduler.
 *
 * This is the retention layer: it decides which cases come back on which day.
 * It knows nothing about latency directly; speed reaches it through the grade
 * (see `latency.ts`), where a correct-but-slow answer arrives as Hard.
 *
 * Two deliberate departures from a stock vocabulary deck:
 *
 *  - Desired retention is 0.93 rather than the usual 0.90. FSRS models the
 *    probability of a *correct* answer, not how fast it comes, and recognition
 *    speed rots faster than accuracy does. Tighter scheduling buys speed back.
 *  - Cases still building fluency get their interval multiplied by 0.75, which
 *    retires to 1.0 once the case is mastered.
 *
 * Reference: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
 */

/** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy. */
export type Grade = 1 | 2 | 3 | 4

export const DEFAULT_WEIGHTS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
] as const

export type Weights = readonly number[]

export interface Memory {
  /** Stability, in days: the interval at which recall probability is 90%. */
  stability: number
  /** Difficulty, 1–10. */
  difficulty: number
}

export const DESIRED_RETENTION = 0.93
/** Interval multiplier while a case is still building fluency. */
export const FLUENCY_INTERVAL_FACTOR = 0.75
export const MIN_INTERVAL_DAYS = 1
export const MAX_INTERVAL_DAYS = 180

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

function decay(w: Weights): number {
  return w[20]
}

/** Chosen so that R(S, S) is exactly 0.9, whatever the decay exponent is. */
function factor(w: Weights): number {
  return Math.pow(0.9, -1 / decay(w)) - 1
}

/** Probability the case is still recallable `days` after the last review. */
export function retrievability(days: number, stability: number, w: Weights = DEFAULT_WEIGHTS): number {
  if (stability <= 0) return 0
  return Math.pow(1 + factor(w) * (days / stability), -decay(w))
}

/** The interval at which retrievability will have fallen to `retention`. */
export function intervalFor(
  stability: number,
  retention = DESIRED_RETENTION,
  w: Weights = DEFAULT_WEIGHTS,
): number {
  return (stability / factor(w)) * (Math.pow(retention, -1 / decay(w)) - 1)
}

function initialDifficulty(grade: Grade, w: Weights): number {
  return clamp(w[4] - Math.exp(w[5] * (grade - 1)) + 1, 1, 10)
}

/** First ever review of a case. */
export function initialMemory(grade: Grade, w: Weights = DEFAULT_WEIGHTS): Memory {
  return {
    stability: Math.max(w[grade - 1], 0.01),
    difficulty: initialDifficulty(grade, w),
  }
}

function nextDifficulty(difficulty: number, grade: Grade, w: Weights): number {
  const delta = -w[6] * (grade - 3)
  // Linear damping: cases already rated hard move less than easy ones.
  const damped = difficulty + delta * ((10 - difficulty) / 9)
  // Mean reversion toward the difficulty an "easy" first answer would imply.
  return clamp(w[7] * initialDifficulty(4, w) + (1 - w[7]) * damped, 1, 10)
}

function stabilityAfterRecall(
  memory: Memory,
  r: number,
  grade: Grade,
  w: Weights,
): number {
  const hardPenalty = grade === 2 ? w[15] : 1
  const easyBonus = grade === 4 ? w[16] : 1
  const { stability: s, difficulty: d } = memory
  const growth =
    Math.exp(w[8]) *
    (11 - d) *
    Math.pow(s, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus
  return s * (1 + growth)
}

function stabilityAfterLapse(memory: Memory, r: number, w: Weights): number {
  const { stability: s, difficulty: d } = memory
  const forgotten =
    w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r))
  return Math.min(forgotten, s)
}

/**
 * A review separated from the last one by `elapsedDays`.
 * Call this once per case per day — see `shortTermReview` for repeats inside
 * the same session.
 */
export function review(
  memory: Memory,
  grade: Grade,
  elapsedDays: number,
  w: Weights = DEFAULT_WEIGHTS,
): Memory {
  const r = retrievability(Math.max(elapsedDays, 0), memory.stability, w)
  const difficulty = nextDifficulty(memory.difficulty, grade, w)
  const stability =
    grade === 1 ? stabilityAfterLapse(memory, r, w) : stabilityAfterRecall(memory, r, grade, w)
  return { stability: Math.max(stability, 0.01), difficulty }
}

/**
 * A repeat of the same case within the same day. Sessions here contain many
 * repetitions of one case, so this path runs far more often than in a typical
 * deck — FSRS-6's short-term term is the reason to be on 6 rather than 4.5.
 */
export function shortTermReview(
  memory: Memory,
  grade: Grade,
  w: Weights = DEFAULT_WEIGHTS,
): Memory {
  const stability =
    memory.stability * Math.exp(w[17] * (grade - 3 + w[18])) * Math.pow(memory.stability, -w[19])
  return {
    stability: clamp(stability, 0.01, MAX_INTERVAL_DAYS),
    difficulty: nextDifficulty(memory.difficulty, grade, w),
  }
}

/** Whole days until this case should be seen again. */
export function nextIntervalDays(
  memory: Memory,
  buildingFluency: boolean,
  retention = DESIRED_RETENTION,
  w: Weights = DEFAULT_WEIGHTS,
): number {
  const raw = intervalFor(memory.stability, retention, w)
  const scaled = raw * (buildingFluency ? FLUENCY_INTERVAL_FACTOR : 1)
  return clamp(Math.round(scaled), MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS)
}
