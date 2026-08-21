/**
 * Turning a response time into a grade.
 *
 * This is the part a vocabulary scheduler does not have. Recognition here is
 * speed-critical: once accuracy saturates near 100% — which it will, quickly,
 * across 21 PLL cases — latency is the only signal left carrying information.
 *
 * Three ideas do the work:
 *
 *  1. Motor time is subtracted. Raw response time is perception + decision +
 *     the physical act of answering. Only the first two are the skill, and the
 *     third differs by hundreds of milliseconds between a keyboard and a phone.
 *  2. Everything is scored against the solver's OWN rolling distribution, so a
 *     naturally slower solver is never punished for being slow — only for being
 *     slow relative to themselves.
 *  3. Correct-but-slow is Hard, never Again. Slowness is a fluency problem, not
 *     a retention problem, and grading it as a lapse would wreck the stability
 *     estimates and flag half the deck as leeches.
 */

import type { Grade } from './fsrs.ts'

export const BASELINE_WINDOW = 100
export const CASE_WINDOW = 10
/** Trials needed before the solver's own distribution is trusted. */
export const COLD_START_TRIALS = 20
/** Shrinkage constant for the per-case offset. */
const CASE_SHRINKAGE = 8

export interface SpeedTier {
  index: number
  name: string
  /** Upper bound of this tier's median response time, in seconds. */
  medianCeiling: number
  /** Above this, no answer earns Easy however good the z-score. */
  easyCeiling: number
  /** Beyond this, the answer counts as a miss. */
  timeout: number
}

export const SPEED_TIERS: SpeedTier[] = [
  { index: 0, name: 'Novice', medianCeiling: Infinity, easyCeiling: 2.5, timeout: 8 },
  { index: 1, name: 'Learner', medianCeiling: 3.0, easyCeiling: 1.6, timeout: 6 },
  { index: 2, name: 'Competent', medianCeiling: 2.0, easyCeiling: 1.1, timeout: 5 },
  { index: 3, name: 'Fluent', medianCeiling: 1.2, easyCeiling: 0.75, timeout: 4 },
  { index: 4, name: 'Automatic', medianCeiling: 0.7, easyCeiling: 0.55, timeout: 3 },
]

export function tierForMedian(medianSeconds: number): SpeedTier {
  // Tiers are ordered slowest first; the fastest matching tier wins.
  let best = SPEED_TIERS[0]
  for (const tier of SPEED_TIERS) {
    if (medianSeconds < tier.medianCeiling) best = tier
  }
  return best
}

// ---------------------------------------------------------------------------
// Robust statistics
// ---------------------------------------------------------------------------

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo)
}

/** Median absolute deviation, rescaled to be comparable with a standard deviation. */
export function madSigma(values: number[]): number {
  if (values.length < 2) return 0
  const m = median(values)
  return 1.4826 * median(values.map((v) => Math.abs(v - m)))
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** Least-squares slope of `values` against their index. */
export function slope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const meanX = (n - 1) / 2
  const meanY = values.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY)
    den += (i - meanX) ** 2
  }
  return den === 0 ? 0 : num / den
}

// ---------------------------------------------------------------------------
// Population priors
// ---------------------------------------------------------------------------

/**
 * How much slower than their own average a solver tends to be on each PLL,
 * in natural-log units. Seeded from community consensus on recognition
 * difficulty; the G perms are the universally reported hard four, because
 * corners and edges cycle in opposite directions with no clean anchor.
 * Replaced by the solver's own measurements as evidence accumulates.
 */
export const POPULATION_OFFSET: Record<string, number> = {
  H: -0.15, Ua: -0.15, Ub: -0.15, Z: -0.15,
  Aa: -0.15, Ab: -0.15, T: -0.15, Y: -0.15,
  Ja: -0.15, Jb: -0.15,
  F: 0, Ra: 0, Rb: 0, V: 0, Na: 0, Nb: 0, E: 0,
  Ga: 0.35, Gb: 0.35, Gc: 0.35, Gd: 0.35,
}

export function populationOffset(caseKey: string): number {
  return POPULATION_OFFSET[caseKey] ?? 0
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

export interface Baseline {
  /** Median of log response time across recent correct trials. */
  mu: number
  /** Robust spread of log response time. */
  sigma: number
  /** Median response time in seconds — the human-readable version of `mu`. */
  medianSeconds: number
  tier: SpeedTier
  /** How many trials the baseline rests on. */
  samples: number
  /** True while there is too little data to z-score against. */
  coldStart: boolean
}

export function computeBaseline(logRts: number[]): Baseline {
  const window = logRts.slice(-BASELINE_WINDOW)
  const mu = median(window)
  const sigma = Math.min(0.6, Math.max(0.18, madSigma(window)))
  const medianSeconds = window.length ? Math.exp(mu) : 0
  return {
    mu,
    sigma,
    medianSeconds,
    tier: tierForMedian(medianSeconds || Infinity),
    samples: window.length,
    coldStart: window.length < COLD_START_TRIALS,
  }
}

/**
 * Motor time: the floor cost of physically committing an answer, measured by a
 * calibration round where the target is already highlighted so no recognition
 * is involved. Subtracted from every raw response time.
 */
export const DEFAULT_MOTOR_SECONDS = 0.35
export const MIN_NET_SECONDS = 0.05

export function netSeconds(rawSeconds: number, motorSeconds: number): number {
  return Math.max(rawSeconds - motorSeconds, MIN_NET_SECONDS)
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface LatencyContext {
  baseline: Baseline
  /** Log response times for this specific case, most recent last. */
  caseLogRts: number[]
  /** Key used to look up the population prior — the PLL name. */
  caseKey: string
}

/**
 * How far this answer sits from where the solver's own answers usually land,
 * after allowing for the fact that some cases are harder for everyone.
 */
export function latencyZ(netRt: number, ctx: LatencyContext): number {
  const { baseline, caseLogRts, caseKey } = ctx
  const x = Math.log(netRt)
  const n = caseLogRts.length
  const lambda = n / (n + CASE_SHRINKAGE)
  const observedOffset = n > 0 ? median(caseLogRts.slice(-CASE_WINDOW)) - baseline.mu : 0
  const offset = lambda * observedOffset + (1 - lambda) * populationOffset(caseKey)
  return (x - baseline.mu - offset) / baseline.sigma
}

export interface GradeResult {
  grade: Grade
  z: number
  netRt: number
  /** Why this grade, in words the interface can show. */
  reason: string
}

export function gradeAnswer(
  correct: boolean,
  rawSeconds: number,
  motorSeconds: number,
  ctx: LatencyContext,
): GradeResult {
  const netRt = netSeconds(rawSeconds, motorSeconds)
  const { tier } = ctx.baseline

  if (!correct) return { grade: 1, z: 0, netRt, reason: 'Missed' }
  if (rawSeconds > tier.timeout) return { grade: 1, z: 0, netRt, reason: 'Timed out' }

  if (ctx.baseline.coldStart) {
    // Not enough history to z-score. Fall back to the tier's absolute pace.
    if (netRt <= tier.easyCeiling * 0.75) {
      return { grade: 4, z: 0, netRt, reason: 'Fast' }
    }
    return { grade: 3, z: 0, netRt, reason: 'Correct' }
  }

  const z = latencyZ(netRt, ctx)
  if (z <= -0.4 && netRt <= tier.easyCeiling) {
    return { grade: 4, z, netRt, reason: 'Fast for you' }
  }
  if (z <= 0.85) return { grade: 3, z, netRt, reason: 'On pace' }
  return { grade: 2, z, netRt, reason: 'Correct but slow' }
}
