/**
 * The drill.
 *
 * The cube is the screen. Everything else is a thin strip above it and a thin
 * strip below, and nothing at all sits beside it — you are meant to be looking
 * at the cube, not reading an interface.
 *
 * A session runs as a sequence of exercises, one OLL each, a few reps apiece.
 * Nothing is revealed until you commit: you look, you decide, you press, and
 * only then does the answer appear. Arrows showing where the pieces travel are
 * one optional key away, and they show only the movements that land on the
 * front and right faces — the five a two-sided read depends on, never all eight.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CubeView3D, type CubeHandle } from '../components/CubeView3D.tsx'
import { CaseDiagram } from '../components/CaseDiagram.tsx'
import { OLL_CASES } from '../cube/cases.ts'
import { predictItemId } from '../train/curriculum.ts'
import { PllChoices } from '../components/PllChoices.tsx'
import { Action } from '../components/Hud.tsx'
import { pieceMapOf } from '../cube/tracking.ts'
import {
  buildTeachingBrief,
  hintsFor,
  recognitionArrows,
} from '../cube/recognition.ts'
import { SPEED_TIERS } from '../train/latency.ts'
import { newLoadCount } from '../train/scheduler.ts'
import { itemLabel } from '../train/curriculum.ts'
import type { SessionMode, useSession } from '../train/useSession.ts'
import './drill.css'

type Session = ReturnType<typeof useSession>

export function Drill({
  session,
  mode,
  onLeave,
}: {
  session: Session
  mode: SessionMode
  onLeave: () => void
}) {
  const cubeRef = useRef<CubeHandle>(null)
  const leave = useCallback(() => {
    session.end()
    onLeave()
  }, [session, onLeave])
  const { phase, trial, exercise, feedback, settings, hintLevel } = session

  const revealed = phase === 'feedback'
  /*
   * Practice and the timed test answer by multiple choice regardless of the
   * reveal/grid preference: both exist to measure picking the right PLL, and
   * self-grading measures something else.
   */
  /*
   * Four options everywhere a rep is a test — review included. Reveal-and-
   * self-grade stays available in settings for anyone who would rather say the
   * answer out loud, but a session that teaches a case and then asks you to
   * grade yourself on it never actually checks whether you knew it.
   */
  const answerMode: 'choices' | 'reveal' =
    settings.answerMode === 'reveal' && mode.kind !== 'timed' ? 'reveal' : 'choices'
  /*
   * The timed test hides the cube behind the scramble until the solver says
   * they are looking. Recognition is being measured, and setting the case up on
   * a real cube is not recognition.
   */
  const timed = mode.kind === 'timed'
  const [looking, setLooking] = useState(!timed)
  useEffect(() => {
    setLooking(!timed)
  }, [trial, timed])
  const startLooking = useCallback(() => {
    setLooking(true)
    session.beginLooking()
  }, [session])

  /*
   * The first run through a case teaches instead of testing: corners, then
   * edges, then what the two readings leave. It is a lesson, so it is simply
   * on screen — nothing to ask for, and the hint ladder is withheld until the
   * case has been introduced, since a hint on a rep that was never a test is
   * a worse copy of the lesson already showing.
   */
  /*
   * Only the FIRST introducing rep teaches. The lesson is given once and the
   * rest of the introduction tests against it — reading the same sentence four
   * times in a row is copying, not learning.
   */
  const teaching = useMemo(
    () =>
      trial?.encoding && trial.encodeIndex === 0
        ? buildTeachingBrief(
            trial.oll,
            trial.drill.ollAlg,
            // The state before the algorithm, not the head-start state: the
            // lesson is about what you can read at the moment you are handed
            // the case.
            trial.drill.state,
            trial.resolved,
            trial.pll,
          )
        : null,
    [trial],
  )
  const [teachStep, setTeachStep] = useState(0)
  useEffect(() => setTeachStep(0), [trial])
  // The last step is the conclusion; it belongs with the revealed cube.
  const askSteps = teaching ? teaching.length - 1 : 0
  const teachAsk = teaching ? teaching[Math.min(teachStep, askSteps - 1)] : null
  const teachAdvance = useCallback(() => {
    if (teachStep < askSteps - 1) setTeachStep((n) => n + 1)
    else session.reveal()
  }, [teachStep, askSteps, session])

  // Only the movements that land on the front and right faces — the pieces a
  // two-sided read actually depends on.
  // The hint ladder: where to look, then what the algorithm does, then what
  // pattern you will be left with. Each rung gives away strictly more.
  const hints = useMemo(
    () => (trial ? hintsFor(trial.oll, trial.drill.ollAlg, trial.drill.state, trial.pll) : []),
    [trial],
  )
  const taken = hints.slice(0, hintLevel)
  const hintWantsArrows = taken.some((h) => h.arrows)
  const hintHighlight = taken.length > 0 ? taken[taken.length - 1].highlight : undefined
  const litFacelets = teachAsk?.highlight ?? hintHighlight

  const arrows = useMemo(() => {
    if (!trial) return undefined
    const taught = Boolean(teachAsk?.arrows) && !revealed
    if (!settings.showArrows && !taught && !(hintWantsArrows && !revealed)) return undefined
    return recognitionArrows(pieceMapOf(trial.drill.ollAlg))
  }, [trial, settings.showArrows, hintWantsArrows, revealed, teachAsk])

  /*
   * The same sentence the lesson gave, shown again on every answer. Review used
   * to explain itself differently from the lesson that taught it, which meant
   * meeting a case twice and being told about it in two vocabularies.
   */
  const explanation = useMemo(
    () =>
      revealed && trial
        ? buildTeachingBrief(
            trial.oll,
            trial.drill.ollAlg,
            trial.drill.state,
            trial.resolved,
            trial.pll,
          )[0].text
        : null,
    [revealed, trial],
  )

  const toggleArrows = useCallback(
    () => session.updateSettings({ showArrows: !settings.showArrows }),
    [session, settings.showArrows],
  )

  // Show the finished layer once revealed; the question state until then.
  useEffect(() => {
    if (!trial) return
    cubeRef.current?.set(revealed ? trial.resolved : trial.shown)
  }, [trial, revealed])

  // --- Keyboard -------------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (event.metaKey || event.ctrlKey) return

      if (event.key === 'a') {
        toggleArrows()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        leave()
        return
      }
      if (event.key === 'h') {
        if (!trial?.encoding) session.showHint()
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        if (phase === 'idle' || phase === 'finished') session.start(mode)
        else if (phase === 'presenting' && teaching) teachAdvance()
        else if (phase === 'presenting' && answerMode === 'reveal') session.reveal()
        else if (phase === 'feedback' && feedback?.reason !== 'Grade yourself') session.next()
        return
      }
      if (phase === 'feedback' && feedback?.reason === 'Grade yourself') {
        if (event.key === 'j') session.selfGrade(true)
        if (event.key === 'f') session.selfGrade(false)
        return
      }
      if (event.key === 'Enter' && phase === 'feedback') session.next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, feedback, session, answerMode, toggleArrows, teaching, teachAdvance, trial, leave, mode])

  if (phase === 'idle' || phase === 'finished')
    return <DrillStandby session={session} mode={mode} onLeave={onLeave} />
  if (!trial) return null

  const selfGrading = revealed && feedback?.reason === 'Grade yourself'

  return (
    <div className="stage" data-phase={phase} data-teaching={Boolean(teaching)}>
      {/*
        The scramble, alone and full screen, until the solver taps. Everything
        else in the drill is laid out behind it and does not move when it goes.
      */}
      {!looking && (
        <div className="stage__setup">
          {/*
            The whole panel is the tap target — you should not have to aim
            while holding a cube — with the case picker layered above it, since
            "which cases am I being tested on" is a question you ask here and
            nowhere else.
          */}
          <button type="button" className="stage__setup-tap" onClick={startLooking}>
            <span className="stage__setup-label label">Apply from solved</span>
            <span className="stage__setup-scramble mono">{trial.drill.scramble}</span>
            <span className="stage__setup-go label">Tap when you are looking at it</span>
          </button>
          <div className="stage__setup-picker">
            <TestPicker session={session} />
          </div>
        </div>
      )}
      <header className="stage__head">
        <button
          type="button"
          className="stage__back label"
          onClick={leave}
          title="Leave this session (Esc)"
        >
          <span aria-hidden="true">←</span> Back
        </button>
        <div className="stage__where">
          <h1 className="stage__case">{trial.oll.name}</h1>
          {/* Say what this session is when it is not the ordinary one. */}
          {session.mode.kind !== 'guided' && (
            <span className="stage__mode label">
              {session.mode.kind === 'practice'
                ? 'Practice · not scored'
                : session.mode.kind === 'timed'
                  ? 'Test'
                  : session.mode.kind === 'learn'
                    ? 'Learning'
                    : 'Review'}
            </span>
          )}
          {/*
            The exercise number used to sit here too. It is not something a
            solver can act on, and at plain sentence case the two counters
            together no longer fit a phone without forcing the whole layout
            wider than the screen.
          */}
          {exercise && Number.isFinite(exercise.reps) && (
            <span className="stage__reps label">
              rep {exercise.rep} of {exercise.reps}
            </span>
          )}
        </div>
        <p className="stage__alg mono">
            {trial.remaining || trial.drill.ollAlg}
          {trial.headStart > 0 && <i className="stage__headstart"> · {trial.headStart} in</i>}
        </p>
      </header>

      <div className="stage__cube">
        <CubeView3D
          ref={cubeRef}
          facelets={revealed ? trial.resolved : trial.shown}
          arrows={arrows}
          highlight={!revealed ? litFacelets : undefined}
          viewTurns={trial.drill.viewTurns}
          zoom={settings.cubeZoom}
          className="stage__canvas"
        />
        {trial.encoding && <span className="stage__flag label">Learning — not timed</span>}
      </div>

      <footer className="stage__foot">
        {/*
          One branch at a time, keyed so it re-enters on each reveal. Deliberately
          not AnimatePresence: `mode="wait"` holds the incoming child until the
          outgoing one finishes exiting, and when that exit does not complete the
          answer never mounts at all — which is exactly what happened here. The
          reveal is a discrete capture in this design language anyway, not a
          crossfade, so there is nothing to wait for.
        */}
        {!revealed ? (
          <motion.div
            key="ask"
            className="stage__ask"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: settings.reduceMotion ? 0 : 0.16 }}
          >
            <p className="stage__prompt label">
              {teaching
                ? askSteps > 1
                  ? `New case · ${teachStep + 1} of ${askSteps}`
                  : 'New case'
                : answerMode === 'reveal'
                  ? 'Which PLL does this leave?'
                  : 'Pick the case'}
            </p>
            {/*
              The scramble is here so the same rep can be done on a real cube:
              apply it from solved and you are looking at what is on screen.
              Selectable, and quiet enough to ignore when practising without one.
            */}
            <p className="stage__scramble mono" title="Apply from solved to set this up on a real cube">
              {trial.drill.scramble}
            </p>
            {/*
              Only the latest rung is shown, and its box is a fixed height.
              Stacking all three grew the strip and shrank the cube as you asked
              for help — the one moment the view should hold perfectly still.
              Each rung supersedes the last anyway.
            */}
            {teachAsk ? (
              /*
               * Same fixed box as the hint line, for the same reason: the cube
               * above must not resize as the lesson steps forward.
               */
              <p className="stage__hint-line stage__hint-line--teach" data-shown="true">
                <b className="stage__teach-head label">{teachAsk.heading}</b>
                {teachAsk.text}
              </p>
            ) : (
              <p className="stage__hint-line" data-shown={taken.length > 0}>
                {taken.length > 0 ? taken[taken.length - 1].text : ''}
              </p>
            )}

            <div className="stage__aids" hidden={Boolean(teaching)}>
              <button
                type="button"
                className="stage__toggle stage__toggle--quiet label"
                data-on={settings.showArrows}
                onClick={toggleArrows}
              >
                Arrows <kbd>A</kbd>
              </button>
              <button
                type="button"
                className="stage__toggle stage__toggle--quiet label"
                onClick={session.showHint}
                disabled={hintLevel >= hints.length}
              >
                {hintLevel === 0
                  ? 'Hint'
                  : hintLevel >= hints.length
                    ? 'No more hints'
                    : `More · ${hintLevel} of ${hints.length}`}{' '}
                {hintLevel < hints.length && <kbd>H</kbd>}
              </button>
            </div>
            {teaching ? (
              <Action variant="primary" onClick={teachAdvance}>
                {teachStep < askSteps - 1 ? teaching[teachStep + 1].heading : 'Reveal'}{' '}
                <kbd>Space</kbd>
              </Action>
            ) : answerMode === 'reveal' ? (
              <Action variant="primary" onClick={() => session.reveal()}>
                Reveal <kbd>Space</kbd>
              </Action>
            ) : (
              <PllChoices
                answer={trial.pll}
                resolved={trial.resolved}
                seed={trial.drill.seed}
                chosenId={null}
                revealed={false}
                onPick={(id) => session.commit(id)}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="answer"
            className="stage__answer"
            initial={{ opacity: 0, y: settings.reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: settings.reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
              <div className="stage__result">
                <CaseDiagram
                  facelets={trial.resolved}
                  arrows={trial.pll.arrows}
                  size={54}
                  title={`${trial.pll.name} perm`}
                  emphasiseTwoSided
                />
                <div className="stage__result-body">
                  <h2 className="stage__result-name">
                    {trial.pll.name} perm
                    {feedback && !selfGrading && (
                      <i className="stage__verdict" data-ok={feedback.correct}>
                        {feedback.correct
                          ? `${feedback.netRt.toFixed(2)}s`
                          : `you said ${feedback.chosen?.name ?? '—'}`}
                      </i>
                    )}
                  </h2>
                  {explanation && <p className="stage__hint">{explanation}</p>}
                </div>
              </div>

              <div className="stage__controls">
                <button
                  type="button"
                  className="stage__toggle label"
                  data-on={settings.showArrows}
                  onClick={toggleArrows}
                >
                  Arrows <kbd>A</kbd>
                </button>
                {selfGrading ? (
                  <>
                    <Action onClick={() => session.selfGrade(false)}>
                      Missed <kbd>F</kbd>
                    </Action>
                    <Action variant="primary" onClick={() => session.selfGrade(true)}>
                      Had it <kbd>J</kbd>
                    </Action>
                  </>
                ) : (
                  <Action variant="primary" onClick={() => session.next()}>
                    Next <kbd>Space</kbd>
                  </Action>
                )}
              </div>
          </motion.div>
        )}
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standby
// ---------------------------------------------------------------------------

/**
 * Which cases the timed test draws from.
 *
 * Only cases the schedule has already unlocked: testing something you have
 * never been shown measures nothing. Empty selection means all of them, which
 * is both the default and the thing most people want.
 */
function TestPicker({ session }: { session: Session }) {
  const { progress, settings } = session
  const unlocked = OLL_CASES.filter((oll) => {
    const item = progress.items[predictItemId(oll.id)]
    return item && item.phase !== 'locked'
  })
  const chosen = settings.testCases
  const isOn = (id: string) => chosen.length === 0 || chosen.includes(id)

  const toggle = (id: string) => {
    const explicit = chosen.length === 0 ? unlocked.map((o) => o.id) : chosen
    const next = explicit.includes(id)
      ? explicit.filter((x) => x !== id)
      : [...explicit, id]
    // Everything selected is the same as no selection, and says so more simply.
    session.updateSettings({ testCases: next.length === unlocked.length ? [] : next })
  }

  if (unlocked.length === 0) return null

  return (
    <details className="picker">
      <summary className="picker__summary label">
        Cases · {chosen.length === 0 ? `all ${unlocked.length}` : `${chosen.length} of ${unlocked.length}`}
      </summary>
      <div className="picker__body">
        <div className="picker__all">
          <button type="button" className="label" onClick={() => session.updateSettings({ testCases: [] })}>
            Select all
          </button>
        </div>
        <ul className="picker__grid">
          {unlocked.map((oll) => (
            <li key={oll.id}>
              <button
                type="button"
                className="picker__case"
                data-on={isOn(oll.id)}
                onClick={() => toggle(oll.id)}
                title={oll.name}
              >
                <CaseDiagram facelets={oll.state} mode="orientation" size={34} />
                <b>{oll.number}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

function DrillStandby({
  session,
  mode,
  onLeave,
}: {
  session: Session
  mode: SessionMode
  onLeave: () => void
}) {
  const { progress, phase, stats, stopReason, baseline } = session
  const items = Object.values(progress.items)
  const automatic = items.filter((i) => i.phase === 'maintenance').length
  const learning = newLoadCount(progress)
  const firstEver = items.length === 0

  const tierIndex = SPEED_TIERS.indexOf(baseline.tier)
  const nextTier = SPEED_TIERS[Math.min(tierIndex + 1, SPEED_TIERS.length - 1)]

  return (
    <div className="standby">
      {phase === 'finished' ? (
        <>
          <h1 className="standby__title">
            {stats.trials} {stats.trials === 1 ? 'rep' : 'reps'}
          </h1>
          <p className="standby__note">{stopReason}</p>
          <dl className="standby__figures">
            <Figure label="Median" value={stats.medianRt ? `${stats.medianRt.toFixed(2)}s` : '—'} />
            <Figure
              label="Hit rate"
              value={stats.trials ? `${Math.round((stats.correct / stats.trials) * 100)}%` : '—'}
            />
            <Figure label="Automatic" value={String(automatic)} />
          </dl>
          {stats.mastered.length > 0 && (
            <p className="standby__note">
              {stats.mastered.map(itemLabel).join(', ')} is now automatic.
            </p>
          )}
        </>
      ) : firstEver ? (
        <>
          <h1 className="standby__title">Train the seam</h1>
          <p className="standby__lede">Name the PLL each OLL will leave.</p>
        </>
      ) : (
        <>
          <h1 className="standby__title">
            {baseline.medianSeconds ? `${baseline.medianSeconds.toFixed(2)}s` : 'Ready'}
          </h1>
          <dl className="standby__figures">
            <Figure label="Tier" value={baseline.tier.name} />
            <Figure label="Automatic" value={String(automatic)} />
            <Figure label="Learning" value={String(learning)} />
            <Figure label="Streak" value={`${progress.streakDays}d`} />
          </dl>
          {baseline.tier !== nextTier && (
            <p className="standby__note">
              {nextTier.name} at a median under {nextTier.medianCeiling.toFixed(1)}s.
            </p>
          )}
        </>
      )}

      {mode.kind === 'timed' && <TestPicker session={session} />}

      <div className="standby__go">
        <Action variant="primary" onClick={() => session.start(mode)}>
          {phase === 'finished' ? 'Again' : 'Begin'} <kbd>Space</kbd>
        </Action>
        <Action onClick={onLeave}>Done</Action>
      </div>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="standby__figure">
      <dt className="label">{label}</dt>
      <dd className="readout">{value}</dd>
    </div>
  )
}
