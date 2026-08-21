/**
 * The session engine.
 *
 * Owns the trial loop: pick a case, build a drill, time the answer, grade it,
 * fold it into both schedulers, decide whether to unlock something new, and
 * decide when to stop.
 *
 * One measurement decision worth stating. The answer grid always shows all 21
 * cases in the SAME positions, every trial, forever. A grid that reshuffles
 * gets scanned serially, and then what is being timed is visual search rather
 * than recognition. A fixed grid becomes spatial memory within a few sessions
 * and stops contributing to the measurement.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyAlg, parseAlg } from '../cube/engine.ts'
import { OLL_BY_ID, PLL_BY_ID, PLL_CASES, type OLLCase, type PLLCase } from '../cube/cases.ts'
import { buildDrill, mulberry32, randomSeed, type Drill } from '../cube/scramble.ts'
import { gradeAnswer, median, netSeconds, type Baseline, type LatencyContext } from './latency.ts'
import { caseIdOf, nextGroupIds, nextUnlockCandidates, predictItemId } from './curriculum.ts'
import {
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
  shouldStop,
  applyTrial,
} from './scheduler.ts'
import {
  loadProgress,
  newItem,
  saveProgress,
  today,
  type ItemProgress,
  type Progress,
  type Settings,
} from './store.ts'

export type SessionPhase = 'idle' | 'presenting' | 'feedback' | 'finished'

/**
 * What a session is for.
 *
 *  - `guided` — the day's mix: whatever is due, plus new cases as the gate
 *    allows. The default, and the one the scheduler is designed around.
 *  - `learn` — new material only, taught then tested, until the day's
 *    allowance is used up.
 *  - `review` — what is due today and nothing new.
 *  - `practice` — one OLL you picked, every PLL it can leave, answered by
 *    multiple choice. Deliberately UNSCORED: self-selected reps are exactly
 *    the input that breaks a spaced-repetition schedule, and the point of
 *    picking is to work on something now, not to tell the scheduler what you
 *    know.
 *  - `timed` — a recognition test across everything unlocked, answered by
 *    multiple choice against the clock. Scored: the schedule chose nothing,
 *    but the cases are its own pool, so the reps are honest evidence.
 */
export type SessionMode =
  | { kind: 'guided' }
  | { kind: 'learn'; more?: boolean }
  | { kind: 'review' }
  | { kind: 'timed' }
  | { kind: 'practice'; ollId: string }

export const GUIDED: SessionMode = { kind: 'guided' }

export interface Trial {
  itemId: string
  oll: OLLCase
  pll: PLLCase
  drill: Drill
  /** The state to show the solver. */
  shown: string
  /** The state after the OLL runs — what they had to predict. */
  resolved: string
  /** True while the case is being taught rather than tested. */
  encoding: boolean
  /** Moves of the OLL already executed when the drill is shown. */
  headStart: number
  /** The moves still to come — what the solver must read through. */
  remaining: string
}

export interface Feedback {
  correct: boolean
  chosen: PLLCase | null
  netRt: number
  reason: string
  grade: 1 | 2 | 3 | 4
  mastered: boolean
  /** Cases the solver has confused this one with, if any. */
  confusedWith: PLLCase | null
}

export interface Exercise {
  /** 1-based index within the session. */
  number: number
  itemId: string
  /** 1-based rep within this exercise. */
  rep: number
  reps: number
}

export interface SessionStats {
  trials: number
  correct: number
  medianRt: number
  introduced: string[]
  mastered: string[]
  elapsedSeconds: number
}

/**
 * A brand-new profile is seeded with the whole first recognition group rather
 * than trickled in. With only two cases in the pool, ARTS has nothing to
 * interleave and the first session degenerates into alternating between them.
 * Four easy, visually distinct cases is the smallest pool that behaves.
 */
const FIRST_RUN_SEED = 4

/**
 * The algorithm the solver actually uses for a case. Not a preference: 28 of
 * the 57 OLL cases have published variants that leave a DIFFERENT PLL, so a
 * prediction is only correct against the algorithm being executed.
 */
export function chosenAlgFor(oll: OLLCase, choice: Record<string, number>): string {
  const index = choice[oll.id]
  return oll.algs[index]?.alg ?? oll.alg
}

export function useSession() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress())
  const [phase, setPhaseState] = useState<SessionPhase>('idle')

  /**
   * Phase mirrored into a ref.
   *
   * `selfGrade` flips the phase and then immediately calls `commit`, but the
   * `phase` captured in `commit`'s closure is still the value from the render
   * that created it. Guarding on that stale value made `commit` bail out and
   * silently discard the grade. Guards read the ref; rendering reads the state.
   */
  const phaseRef = useRef<SessionPhase>('idle')
  const setPhase = useCallback((next: SessionPhase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])
  const [trial, setTrial] = useState<Trial | null>(null)
  const modeRef = useRef<SessionMode>(GUIDED)
  const [mode, setModeState] = useState<SessionMode>(GUIDED)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [stopReason, setStopReason] = useState('')

  const progressRef = useRef(progress)
  progressRef.current = progress

  const sessionIdRef = useRef('')
  const startedAtRef = useRef(0)
  const trialIndexRef = useRef(0)
  const trialIndexByIdRef = useRef(new Map<string, number>())
  const shownAtRef = useRef(0)
  const sessionRtsRef = useRef<number[]>([])
  const sessionCorrectRef = useRef<boolean[]>([])
  const introducedRef = useRef<string[]>([])
  const masteredRef = useRef<string[]>([])
  const newThisSessionRef = useRef(0)
  const exerciseRef = useRef<Exercise | null>(null)
  const hintsRef = useRef(0)
  const [hintLevel, setHintLevel] = useState(0)
  const [exercise, setExercise] = useState<Exercise | null>(null)

  const settings = progress.settings
  const baseline: Baseline = useMemo(() => baselineOf(progress), [progress])
  const threshold = useMemo(
    () => masteryThreshold(progress.logRtWindow),
    [baseline, progress.logRtWindow],
  )

  const persist = useCallback((next: Progress) => {
    progressRef.current = next
    setProgress(next)
    saveProgress(next)
  }, [])

  // -------------------------------------------------------------------------
  // Building a trial
  // -------------------------------------------------------------------------

  const buildTrialFor = useCallback((itemId: string, current: Progress): Trial | null => {
    const item = current.items[itemId]
    // Practice may pick a case the schedule has not unlocked; that is allowed —
    // it tests, it never teaches, and it records nothing.
    if (!item && modeRef.current.kind !== 'practice') return null
    const oll = OLL_BY_ID.get(caseIdOf(itemId))
    if (!oll) return null

    const seed = randomSeed()
    const rng = mulberry32(seed)
    // Which PLL results is the thing being learned, so it varies every rep.
    // The seed varies too, so the same case never arrives by the same scramble
    // twice — a repeated setup would train recognition of the SCRAMBLE.
    const pll = PLL_CASES[Math.floor(rng() * PLL_CASES.length)]
    const drill = buildDrill(oll, pll, seed, {
      varyAngle: current.settings.varyAngle,
      varyAuf: current.settings.varyAuf,
      ollAlg: chosenAlgFor(oll, current.settings.algChoice),
    })

    // A head start presents the cube part-way through the algorithm, which is
    // where real lookahead happens — you are mid-execution, not staring at a
    // still. The answer is unchanged; only how much of the work is already done.
    const moves = parseAlg(drill.ollAlg)
    const headStart = Math.min(Math.max(0, current.settings.headStart), Math.max(0, moves.length - 2))
    const shown = headStart > 0 ? applyAlg(drill.state, moves.slice(0, headStart)) : drill.state
    const remaining = moves
      .slice(headStart)
      .map((m) => m.label)
      .join(' ')

    return {
      itemId,
      oll,
      pll,
      drill,
      shown,
      resolved: drill.stateAfterOLL,
      headStart,
      remaining,
      encoding:
        modeRef.current.kind === 'practice' || modeRef.current.kind === 'timed'
          ? false
          : item
            ? isEncoding(item)
            : false,
    }
  }, [])

  const finish = useCallback(
    (reason: string) => {
      const current = progressRef.current
      const day = today()
      const items = { ...current.items }
      for (const id of Object.keys(items)) items[id] = rollUpDay(items[id], day)

      const previousDay = current.lastTrainedDay
      const consecutive =
        previousDay === day
          ? current.streakDays
          : previousDay && daysApart(previousDay, day) === 1
            ? current.streakDays + 1
            : 1

      const summary = {
        id: sessionIdRef.current,
        day,
        startedAt: startedAtRef.current,
        endedAt: Date.now(),
        trials: trialIndexRef.current,
        correct: sessionCorrectRef.current.filter(Boolean).length,
        medianNetRt: median(sessionRtsRef.current),
        introduced: [...introducedRef.current],
        mastered: [...masteredRef.current],
        stopReason: reason,
      }

      persist({
        ...current,
        items,
        sessions: [...current.sessions, summary].slice(-180),
        streakDays: consecutive,
        lastTrainedDay: day,
      })
      setStopReason(reason)
      setPhase('finished')
      setTrial(null)
    },
    [persist],
  )

  /** Unlock if the gate allows, then choose and present the next case. */
  const advance = useCallback(() => {
    let current = progressRef.current

    // --- Unlock check ---
    const candidates = nextUnlockCandidates(current)
    const pool = composePool(current, 100)
    const poolSize = pool.building.length + pool.dueMaintenance.length + pool.sampledMaintenance.length
    const { accuracy, samples } = rollingAccuracy(current)
    const decision = mayUnlock({
      activeCount: newLoadCount(current),
      rollingAccuracy: accuracy,
      accuracySamples: samples,
      medianRt7d: medianRtOverDays(current, 7),
      medianRt28d: medianRtOverDays(current, 28),
      introducedThisSession: newThisSessionRef.current,
      /*
       * "Learn more" spends past the day's allowance on purpose. The cap on how
       * many cases can be in progress at once still applies — that one is not a
       * pace preference, it is the thing that stops six half-learned cases
       * turning into six badly-learned ones.
       */
      introducedToday:
        modeRef.current.kind === 'learn' && modeRef.current.more
          ? 0
          : (current.newByDay[today()] ?? []).length,
      trialsDone: trialIndexRef.current,
      hasCandidates: candidates.ids.length > 0,
      poolSize,
    })

    const wantsNew = modeRef.current.kind === 'guided' || modeRef.current.kind === 'learn'
    if (decision.allowed && wantsNew) {
      // Seeding a fresh profile bypasses the per-session and per-day caps: it
      // is bootstrapping the deck, not adding to an existing workload.
      const bootstrapping = Object.keys(current.items).length === 0
      const take = bootstrapping ? nextGroupIds(current, FIRST_RUN_SEED) : candidates.ids
      const items = { ...current.items }
      for (const id of take) {
        const item = newItem(id)
        item.phase = 'introducing'
        item.introducedAt = Date.now()
        items[id] = item
        introducedRef.current.push(id)
        newThisSessionRef.current++
      }
      const day = today()
      current = {
        ...current,
        items,
        newByDay: { ...current.newByDay, [day]: [...(current.newByDay[day] ?? []), ...take] },
      }
      persist(current)
    }

    // --- Stop check ---
    const elapsed = (Date.now() - startedAtRef.current) / 1000
    const stop = shouldStop(
      sessionRtsRef.current,
      elapsed,
      current.settings.sessionSeconds,
      sessionCorrectRef.current,
    )
    if (stop.stop) {
      finish(stop.reason)
      return
    }

    // --- Choose ---
    const nextPool = composePool(current, 100)
    const kind = modeRef.current.kind
    const ids =
      kind === 'learn'
        ? nextPool.building.filter((id) => current.items[id]?.phase !== 'maintenance')
        : kind === 'review'
          ? [...nextPool.dueMaintenance, ...nextPool.sampledMaintenance]
          : kind === 'timed'
            ? Object.values(current.items)
                .filter((i) => !i.parked && i.phase !== 'locked')
                .map((i) => i.id)
                // An explicit selection wins, but never invents cases the
                // schedule has not unlocked: you cannot test what you have not met.
                .filter((id) =>
                  current.settings.testCases.length === 0
                    ? true
                    : current.settings.testCases.includes(caseIdOf(id)),
                )
            : kind === 'practice'
              ? [predictItemId(modeRef.current.kind === 'practice' ? modeRef.current.ollId : '')]
              : [...nextPool.building, ...nextPool.dueMaintenance, ...nextPool.sampledMaintenance]
    if (ids.length === 0) {
      finish(
        kind === 'learn'
          ? 'Nothing new to learn right now'
          : kind === 'review'
            ? 'Nothing due for review'
            : kind === 'timed'
              ? 'Nothing unlocked to test yet'
              : 'Nothing left to drill today',
      )
      return
    }

    // A session is a run of exercises, one case each. Stay on the current case
    // until its reps are done, then let the scheduler choose the next.
    const reps =
      modeRef.current.kind === 'practice'
        ? Number.POSITIVE_INFINITY
        : Math.max(1, current.settings.repsPerExercise)
    const active = exerciseRef.current
    const canContinue = active && active.rep < reps && current.items[active.itemId] && ids.includes(active.itemId)

    let itemId: string | null
    if (canContinue) {
      itemId = active.itemId
      exerciseRef.current = { ...active, rep: active.rep + 1 }
    } else {
      itemId = pickNext(current, ids, trialIndexRef.current, trialIndexByIdRef.current, baselineOf(current))
      if (itemId) {
        exerciseRef.current = {
          number: (active?.number ?? 0) + 1,
          itemId,
          rep: 1,
          reps,
        }
        // ARTS spacing is measured between exercises, not between reps.
        trialIndexByIdRef.current.set(itemId, trialIndexRef.current)
      }
    }
    if (!itemId) {
      finish('Nothing left to drill today')
      return
    }
    setExercise(exerciseRef.current)

    const built = buildTrialFor(itemId, current)
    if (!built) {
      finish('Could not build a drill')
      return
    }

    trialIndexRef.current += 1
    setTrial(built)
    hintsRef.current = 0
    setHintLevel(0)
    setFeedback(null)
    setPhase('presenting')
    shownAtRef.current = performance.now()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildTrialFor, persist])

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  const start = useCallback((next: SessionMode = GUIDED) => {
    modeRef.current = next
    setModeState(next)
    sessionIdRef.current = `s-${Date.now().toString(36)}`
    startedAtRef.current = Date.now()
    trialIndexRef.current = 0
    trialIndexByIdRef.current = new Map()
    sessionRtsRef.current = []
    sessionCorrectRef.current = []
    introducedRef.current = []
    masteredRef.current = []
    newThisSessionRef.current = 0
    exerciseRef.current = null
    setExercise(null)
    setStopReason('')
    setFeedback(null)
    advance()
  }, [advance])

  const end = useCallback(() => finish('Stopped'), [finish])

  // -------------------------------------------------------------------------
  // Answering
  // -------------------------------------------------------------------------

  const commit = useCallback(
    (chosenPllId: string | null, rawSecondsOverride?: number) => {
      const current = progressRef.current
      const active = trial
      if (!active || phaseRef.current !== 'presenting') return

      const raw = rawSecondsOverride ?? (performance.now() - shownAtRef.current) / 1000
      const correct = chosenPllId === active.pll.id
      const item = current.items[active.itemId]

      const ctx: LatencyContext = {
        baseline: baselineOf(current),
        caseLogRts: (item?.recent ?? [])
          .filter((t) => t.correct && t.scored)
          .map((t) => Math.log(Math.max(t.netRt, 0.05))),
        caseKey: active.pll.name,
      }
      const graded = gradeAnswer(correct, raw, current.settings.motorSeconds, ctx)

      /*
       * Practice is not evidence. The case was chosen by the solver rather than
       * by the schedule, so folding it into FSRS or the latency baseline would
       * teach the scheduler what the solver decided to practise instead of what
       * they actually know.
       */
      if (modeRef.current.kind === 'practice') {
        setFeedback({
          correct,
          chosen: chosenPllId ? (PLL_BY_ID.get(chosenPllId) ?? null) : null,
          netRt: netSeconds(raw, current.settings.motorSeconds),
          reason: 'Practice — not scored',
          grade: graded.grade,
          mastered: false,
          confusedWith: null,
        })
        setPhase('feedback')
        return
      }

      const updated = applyTrial(
        item,
        {
          itemId: active.itemId,
          grade: graded.grade,
          correct,
          netRt: graded.netRt,
          sessionId: sessionIdRef.current,
          viewTurns: active.drill.viewTurns,
          pllId: active.pll.id,
          answered: correct ? undefined : (chosenPllId ?? undefined),
          unscored: active.encoding,
          hinted: hintsRef.current > 0,
        },
        masteryThreshold(current.logRtWindow),
        baselineOf(current),
      )

      const justMastered = item.phase !== 'maintenance' && updated.phase === 'maintenance'
      if (justMastered) masteredRef.current.push(active.itemId)

      if (!active.encoding) {
        sessionCorrectRef.current.push(correct)
        if (correct) sessionRtsRef.current.push(graded.netRt)
      }

      persist({
        ...current,
        items: { ...current.items, [active.itemId]: updated },
        logRtWindow: correct && !active.encoding ? pushLogRt(current, graded.netRt) : current.logRtWindow,
      })

      const confusion = confusedCase(updated)
      setFeedback({
        correct,
        chosen: chosenPllId ? (PLL_BY_ID.get(chosenPllId) ?? null) : null,
        netRt: netSeconds(raw, current.settings.motorSeconds),
        reason: active.encoding ? 'Learning this one' : graded.reason,
        grade: graded.grade,
        mastered: justMastered,
        confusedWith: confusion,
      })
      setPhase('feedback')
    },
    [trial, persist],
  )

  /**
   * Reveal-and-self-grade. The clock stops when the solver commits to knowing,
   * which is the honest measurement — deciding you know it is the recognition;
   * checking is not.
   */
  const revealedAtRef = useRef(0)
  const reveal = useCallback(() => {
    if (phaseRef.current !== 'presenting') return
    revealedAtRef.current = (performance.now() - shownAtRef.current) / 1000
    setPhase('feedback')
    setFeedback({
      correct: false,
      chosen: null,
      netRt: netSeconds(revealedAtRef.current, progressRef.current.settings.motorSeconds),
      reason: 'Grade yourself',
      grade: 3,
      mastered: false,
      confusedWith: null,
    })
  }, [setPhase])

  const selfGrade = useCallback(
    (gotIt: boolean) => {
      const active = trial
      if (!active) return
      // Re-enter the presenting phase just long enough for `commit` to run with
      // the time captured at the reveal, not the moment of self-grading.
      setPhase('presenting')
      commit(gotIt ? active.pll.id : null, revealedAtRef.current)
      // Grading IS the answer here — the case was already on screen while you
      // decided. Making you press again to continue adds a keystroke per rep
      // and nothing else, so go straight to the next one.
      advance()
    },
    [trial, commit, setPhase, advance],
  )

  /**
   * Restart the clock for the trial already on screen.
   *
   * The timed test shows the scramble first and the cube only when the solver
   * taps, so the moment the trial was built is not the moment recognition
   * began. Without this the reading time would include however long they spent
   * setting the case up on a real cube.
   */
  const beginLooking = useCallback(() => {
    if (phaseRef.current !== 'presenting') return
    shownAtRef.current = performance.now()
  }, [])

  /**
   * Take the next rung of the hint ladder.
   *
   * Refused while a case is still being introduced. Those reps already carry
   * the full method on screen, so a hint would be a worse copy of what is
   * already there — and "I needed a hint" has no meaning on a rep that was
   * never a test.
   */
  const showHint = useCallback(() => {
    if (phaseRef.current !== 'presenting') return
    if (trial?.encoding) return
    hintsRef.current = Math.min(hintsRef.current + 1, 3)
    setHintLevel(hintsRef.current)
  }, [trial])

  const next = useCallback(() => {
    if (phaseRef.current !== 'feedback') return
    advance()
  }, [advance])

  // -------------------------------------------------------------------------
  // Settings and data
  // -------------------------------------------------------------------------

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const current = progressRef.current
      persist({ ...current, settings: { ...current.settings, ...patch } })
    },
    [persist],
  )

  const replaceProgress = useCallback((next: Progress) => persist(next), [persist])

  const resetProgress = useCallback(() => {
    const fresh = loadProgress()
    persist({ ...fresh, items: {}, logRtWindow: [], sessions: [], newByDay: {}, streakDays: 0, lastTrainedDay: null })
  }, [persist])

  // Apply the motion preference to the document so CSS tokens can respond.
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion)
  }, [settings.reduceMotion])

  const stats: SessionStats = {
    trials: trialIndexRef.current,
    correct: sessionCorrectRef.current.filter(Boolean).length,
    medianRt: median(sessionRtsRef.current),
    introduced: introducedRef.current,
    mastered: masteredRef.current,
    elapsedSeconds: startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0,
  }

  return {
    progress,
    settings,
    baseline,
    mode,
    threshold,
    phase,
    trial,
    exercise,
    hintLevel,
    showHint,
    beginLooking,
    feedback,
    stopReason,
    stats,
    start,
    end,
    commit,
    reveal,
    selfGrade,
    next,
    updateSettings,
    replaceProgress,
    resetProgress,
  }
}

function daysApart(from: string, to: string): number {
  const [ay, am, ad] = from.split('-').map(Number)
  const [by, bm, bd] = to.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** The case this one is most often mistaken for, if the pattern is clear. */
function confusedCase(item: ItemProgress): PLLCase | null {
  const counts = new Map<string, number>()
  for (const t of item.recent) {
    if (!t.correct && t.answered) counts.set(t.answered, (counts.get(t.answered) ?? 0) + 1)
  }
  let bestId: string | null = null
  let bestCount = 0
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestId = id
      bestCount = count
    }
  }
  return bestCount >= 2 && bestId ? (PLL_BY_ID.get(bestId) ?? null) : null
}

export { predictItemId }
