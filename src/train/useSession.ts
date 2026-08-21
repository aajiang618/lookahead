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
import { caseIdOf, predictItemId } from './curriculum.ts'
import { explainMiss } from '../cube/recognition.ts'
import {
  baselineOf,
  isEncoding,
  masteryThreshold,
  pickNext,
  pushLogRt,
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
 * One mode, because there is one thing to do: train the OLLs you selected. The
 * five modes that used to live here — guided, learn, review, timed, practice —
 * were five different answers to "which cases am I working on", a question the
 * solver now answers directly by picking them.
 *
 * Every rep is scored. The old practice mode deliberately recorded nothing, on
 * the argument that self-selected reps corrupt a spaced schedule; there is no
 * spaced schedule choosing the pool any more, so there is nothing left to
 * corrupt and a rep you did is a rep that happened.
 */
export type SessionMode = { kind: 'train'; ollIds: string[] }

export function trainMode(ollIds: string[]): SessionMode {
  return { kind: 'train', ollIds }
}

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
  /**
   * This OLL has never left this PLL before.
   *
   * The seam is the unit of recognition, not the OLL: one case has 21 outcomes
   * and each is its own thing to see. Knowing which reps are genuinely first
   * encounters is worth saying out loud — a slow answer on a seam you have
   * never met is not the same event as a slow answer on one you have drilled a
   * dozen times, and without the flag they look identical.
   */
  newSeam: boolean
  /** How many of this OLL's 21 outcomes have been seen, this one included. */
  seamsSeen: number
  /**
   * How many introducing reps this case has already had. Only the first one
   * teaches: after that the lesson has been given, and four readings of it in a
   * row is not learning, it is copying. The rest of the introduction tests —
   * with the same sentence shown on the answer.
   */
  encodeIndex: number
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
  /**
   * Why it was wrong, when it was. Empty on a correct answer: a right answer
   * needs no argument, and printing one anyway turns every rep into reading.
   */
  why: string
  /** The rep taught rather than tested, so there is no verdict to give. */
  taught: boolean
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
 * Rungs on the hint ladder: where to look, how the pieces move, what the
 * colours say, and the comparison that settles it. See `hintsFor`.
 */
const HINT_RUNGS = 4

/**
 * The algorithm the solver actually uses for a case. Not a preference: 28 of
 * the 57 OLL cases have published variants that leave a DIFFERENT PLL, so a
 * prediction is only correct against the algorithm being executed.
 */
export function chosenAlgFor(oll: OLLCase, choice: Record<string, number>): string {
  const index = choice[oll.id]
  return oll.algs[index]?.alg ?? oll.alg
}

/**
 * Which PLL this rep should leave: unseen outcomes first.
 *
 * Uniform random over 21 leaves a solver meeting the same handful repeatedly
 * while others never appear — after twenty reps of one OLL, chance has shown
 * about thirteen of its twenty-one. Draining the unseen ones first makes
 * coverage systematic, and makes the "new" flag mean something: a rep marked
 * new really is the first time that pair has existed for this solver.
 *
 * Exported so the property can be tested without a React tree.
 */
export function chooseOutcome(seenPllIds: string[], rng: () => number): PLLCase {
  const seen = new Set(seenPllIds)
  const unseen = PLL_CASES.filter((c) => !seen.has(c.id))
  const from = unseen.length > 0 ? unseen : PLL_CASES
  return from[Math.floor(rng() * from.length)]
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
  const modeRef = useRef<SessionMode>(trainMode([]))
  const [mode, setModeState] = useState<SessionMode>(() => trainMode([]))
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
    const oll = OLL_BY_ID.get(caseIdOf(itemId))
    if (!oll) return null

    const seed = randomSeed()
    const rng = mulberry32(seed)
    /*
     * Which PLL results is the thing being learned, so it varies every rep. The
     * seed varies too, so the same case never arrives by the same scramble
     * twice — a repeated setup would train recognition of the SCRAMBLE.
     */
    const seen = new Set(item?.seenPlls ?? [])
    const pll = chooseOutcome(item?.seenPlls ?? [], rng)
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
      encoding: item ? isEncoding(item) : false,
      encodeIndex: item?.encodes ?? 0,
      newSeam: !seen.has(pll.id),
      seamsSeen: seen.size + (seen.has(pll.id) ? 0 : 1),
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

  /**
   * Bring the selected cases into existence, then choose and present the next.
   *
   * There is no unlock check any more. A case exists the moment you select it:
   * the gate that used to stand here — warm-up trials, an active-set ceiling, a
   * daily cap, an accuracy threshold, a "you are slowing down" brake — was five
   * ways of overruling the solver about what they were ready to see.
   */
  const advance = useCallback(() => {
    let current = progressRef.current

    // --- Make sure everything selected has an item to record against ---
    const wanted = modeRef.current.ollIds.map(predictItemId)
    const missing = wanted.filter((id) => !current.items[id])
    if (missing.length > 0) {
      const items = { ...current.items }
      const day = today()
      for (const id of missing) {
        const item = newItem(id)
        // Introducing rather than building: a case you have never trained gets
        // its one teaching rep before it is ever tested.
        item.phase = 'introducing'
        item.introducedAt = Date.now()
        items[id] = item
        introducedRef.current.push(id)
        newThisSessionRef.current++
      }
      current = {
        ...current,
        items,
        newByDay: { ...current.newByDay, [day]: [...(current.newByDay[day] ?? []), ...missing] },
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
    // The pool is the selection. Nothing is filtered out of it: a case you
    // picked is a case you meant to see.
    const ids = wanted
    if (ids.length === 0) {
      finish('No cases selected')
      return
    }

    /*
     * A session is a run of exercises, one case each. Stay on the current case
     * until its reps are done, then let ARTS choose the next — which is the one
     * piece of scheduling that still applies, because ordering WITHIN a chosen
     * set is a question the solver has not answered by choosing it.
     *
     * With a single case selected the whole session is that case, so the reps
     * cap would only serve to end the exercise and immediately restart it.
     */
    const reps =
      ids.length === 1 ? Number.POSITIVE_INFINITY : Math.max(1, current.settings.repsPerExercise)
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
      finish('Nothing left to drill')
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

  const start = useCallback((next: SessionMode) => {
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

      const chosen = chosenPllId ? (PLL_BY_ID.get(chosenPllId) ?? null) : null
      const confusion = confusedCase(updated)
      setFeedback({
        correct,
        chosen,
        netRt: netSeconds(raw, current.settings.motorSeconds),
        reason: active.encoding ? 'Learning this one' : graded.reason,
        grade: graded.grade,
        mastered: justMastered,
        confusedWith: confusion,
        /*
         * Only on a miss. A correct answer is its own explanation, and printing
         * a paragraph under every right answer is how a drill turns into
         * reading — the thing this app exists to make unnecessary.
         */
        why: correct ? '' : explainMiss(active.resolved, active.pll, chosen),
        taught: false,
      })
      setPhase('feedback')
    },
    [trial, persist],
  )

  /**
   * Finish a teaching rep.
   *
   * The lesson has been walked; there is nothing to grade, because nothing was
   * asked. It records as an unscored rep — the case has been met — and shows
   * the result so the cube and the name land together.
   *
   * This replaces reveal-and-self-grade, which is gone. Self-grading measured
   * whether the solver would admit to a miss rather than whether they had one,
   * and a four-option test answers the same question without asking anyone to
   * be honest under time pressure.
   */
  const completeTeaching = useCallback(() => {
    const active = trial
    const current = progressRef.current
    if (!active || phaseRef.current !== 'presenting') return

    const item = current.items[active.itemId]
    if (item) {
      const updated = applyTrial(
        item,
        {
          itemId: active.itemId,
          grade: 3,
          correct: true,
          netRt: 0,
          sessionId: sessionIdRef.current,
          viewTurns: active.drill.viewTurns,
          pllId: active.pll.id,
          unscored: true,
        },
        masteryThreshold(current.logRtWindow),
        baselineOf(current),
      )
      persist({ ...current, items: { ...current.items, [active.itemId]: updated } })
    }

    setFeedback({
      correct: true,
      chosen: active.pll,
      netRt: 0,
      reason: 'Taught — not timed',
      grade: 3,
      mastered: false,
      confusedWith: null,
      why: '',
      taught: true,
    })
    setPhase('feedback')
  }, [trial, persist, setPhase])

  /**
   * Restart the clock for the trial already on screen.
   *
   * With "set up on a real cube" on, the scramble is shown alone and the cube
   * only when the solver taps, so the moment the trial was built is not the
   * moment recognition began. Without this the reading time would include
   * however long they spent setting the case up in their hands.
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
    hintsRef.current = Math.min(hintsRef.current + 1, HINT_RUNGS)
    setHintLevel(hintsRef.current)
  }, [trial])

  const next = useCallback(() => {
    if (phaseRef.current !== 'feedback') return
    advance()
  }, [advance])

  // -------------------------------------------------------------------------
  // Settings and data
  // -------------------------------------------------------------------------

  /**
   * Patch the settings, either directly or as a function of the current ones.
   *
   * The functional form exists because the selection screen is a rapid-fire
   * multi-select: two taps inside one render both read `settings` from the same
   * stale closure, compute a new array from it, and the second silently
   * discards the first. Reading through the ref instead means every tap sees
   * the tap before it — the same reason `setState` has a functional form.
   */
  const updateSettings = useCallback(
    (patch: Partial<Settings> | ((current: Settings) => Partial<Settings>)) => {
      const current = progressRef.current
      const resolved = typeof patch === 'function' ? patch(current.settings) : patch
      persist({ ...current, settings: { ...current.settings, ...resolved } })
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
    completeTeaching,
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
