/**
 * ARTS — Adaptive Response-Time-based Sequencing.
 *
 * The within-session layer: given the pool of cases in play, which one comes
 * next. This is the algorithm from Kellman's Perceptual Learning Modules, whose
 * target task — speeded visual category recognition — is structurally the same
 * as recognising a last-layer case, so it consumes response time natively
 * rather than having it bolted on.
 *
 *     P = a (N - D) [ b (1 - alpha) log(RT / r) + alpha W ]
 *
 * with `alpha` = 0 when the last answer was right and 1 when it was wrong.
 * The elegance is in the logarithm: an answer faster than `r` makes
 * `log(RT/r)` negative, so a fluent case earns negative priority and is pushed
 * far into the future. A slow-but-correct answer earns a small positive
 * priority and returns soon. A wrong answer jumps straight to `W`. Because
 * priority scales with `N`, everything eventually resurfaces regardless.
 *
 * Reference: Mettler, Massey & Kellman (2016), J. Exp. Psychol. General 145(7).
 */

export interface ArtsParams {
  /** How fast priority accrues with elapsed trials. */
  a: number
  /** Weight on the response-time term. */
  b: number
  /**
   * The response time at which priority flips sign, in seconds. The published
   * value of 3.0 suits multi-second medical trials; recognition here lives
   * between 0.3s and 3s, so this is set to the solver's own typical pace and
   * the flip lands at "faster than you usually are".
   */
  r: number
  /** Priority awarded to a case answered incorrectly. */
  w: number
  /** Minimum trials that must pass before a case may repeat. */
  delay: number
}

export const DEFAULT_ARTS: ArtsParams = { a: 0.1, b: 1.1, r: 1.0, w: 20, delay: 3 }

/** Personalised sign-flip point: the solver's own geometric mean response time. */
export function personalR(baselineMu: number, coldStart: boolean): number {
  if (coldStart) return DEFAULT_ARTS.r
  return Math.min(3, Math.max(0.5, Math.exp(baselineMu)))
}

export interface ArtsItem {
  id: string
  /** Trial index at which this case was last shown; -Infinity if never. */
  lastTrialIndex: number
  lastCorrect: boolean
  /** Motor-adjusted response time of the last presentation, in seconds. */
  lastNetRt: number
  /** Priority floor for a freshly introduced case, so it surfaces early. */
  introductionBoost: number
}

export const INELIGIBLE = Number.NEGATIVE_INFINITY

export function priority(item: ArtsItem, trialIndex: number, params: ArtsParams): number {
  // A case never shown yet is maximally due.
  if (!Number.isFinite(item.lastTrialIndex)) return Number.POSITIVE_INFINITY

  const elapsed = trialIndex - item.lastTrialIndex
  if (elapsed <= params.delay) return INELIGIBLE

  const span = params.a * (elapsed - params.delay)
  if (!item.lastCorrect) return span * params.w

  const rt = Math.max(item.lastNetRt, 0.05)
  return span * params.b * Math.log(rt / params.r) + item.introductionBoost * span
}

/**
 * The case to show next. Returns null when every case is inside its enforced
 * delay, which the caller should treat as "the pool is too small right now".
 */
export function selectNext(
  items: ArtsItem[],
  trialIndex: number,
  params: ArtsParams,
): ArtsItem | null {
  let best: ArtsItem | null = null
  let bestScore = INELIGIBLE
  for (const item of items) {
    const score = priority(item, trialIndex, params)
    if (score === INELIGIBLE) continue
    if (best === null || score > bestScore) {
      best = item
      bestScore = score
    }
  }
  if (best) return best

  // Everything is inside its delay. Fall back to the least recently seen case
  // rather than stalling the session.
  return items.reduce<ArtsItem | null>(
    (oldest, item) =>
      oldest === null || item.lastTrialIndex < oldest.lastTrialIndex ? item : oldest,
    null,
  )
}
