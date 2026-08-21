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
import { PllGrid } from '../components/PllGrid.tsx'
import { Action } from '../components/Hud.tsx'
import { pieceMapOf } from '../cube/tracking.ts'
import {
  buildRecognitionBrief,
  buildTeachingBrief,
  hintsFor,
  readDrill,
  recognitionArrows,
} from '../cube/recognition.ts'
import { SPEED_TIERS } from '../train/latency.ts'
import { newLoadCount } from '../train/scheduler.ts'
import { itemLabel } from '../train/curriculum.ts'
import type { useSession } from '../train/useSession.ts'
import './drill.css'

type Session = ReturnType<typeof useSession>

export function Drill({ session }: { session: Session }) {
  const cubeRef = useRef<CubeHandle>(null)
  const { phase, trial, exercise, feedback, settings, hintLevel } = session

  const revealed = phase === 'feedback'

  /*
   * The first run through a case teaches instead of testing: corners, then
   * edges, then what the two readings leave. It is a lesson, so it is simply
   * on screen — nothing to ask for, and the hint ladder is withheld until the
   * case has been introduced, since a hint on a rep that was never a test is
   * a worse copy of the lesson already showing.
   */
  const teaching = useMemo(
    () =>
      trial?.encoding
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
  const teachResult = teaching ? teaching[teaching.length - 1] : null
  const teachAdvance = useCallback(() => {
    if (teachStep < askSteps - 1) setTeachStep((n) => n + 1)
    else session.reveal()
  }, [teachStep, askSteps, session])

  // Only the movements that land on the front and right faces — the pieces a
  // two-sided read actually depends on.
  // The hint ladder: where to look, then what the algorithm does, then what
  // pattern you will be left with. Each rung gives away strictly more.
  const hints = useMemo(
    () => (trial ? hintsFor(trial.oll, trial.drill.ollAlg, trial.resolved, trial.pll) : []),
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

  const brief = useMemo(
    () =>
      revealed && trial ? buildRecognitionBrief(trial.oll, trial.drill.ollAlg) : null,
    [revealed, trial],
  )
  const reading = useMemo(
    () => (revealed && trial ? readDrill(trial.resolved) : null),
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
      if (event.key === 'h') {
        if (!trial?.encoding) session.showHint()
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        if (phase === 'idle' || phase === 'finished') session.start()
        else if (phase === 'presenting' && teaching) teachAdvance()
        else if (phase === 'presenting' && settings.answerMode === 'reveal') session.reveal()
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
  }, [phase, feedback, session, settings.answerMode, toggleArrows, teaching, teachAdvance, trial])

  if (phase === 'idle' || phase === 'finished') return <DrillStandby session={session} />
  if (!trial) return null

  const selfGrading = revealed && feedback?.reason === 'Grade yourself'

  return (
    <div className="stage" data-phase={phase} data-teaching={Boolean(teaching)}>
      <header className="stage__head">
        <div className="stage__where">
          {exercise && (
            <span className="label">
              Exercise {exercise.number}
              <i className="stage__reps">
                · rep {exercise.rep} of {exercise.reps}
              </i>
            </span>
          )}
          <h1 className="stage__case">{trial.oll.name}</h1>
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
                ? `New case · ${teachStep + 1} of ${askSteps}`
                : settings.answerMode === 'reveal'
                  ? 'Which PLL does this leave?'
                  : 'Pick the case, or type its name'}
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
            ) : settings.answerMode === 'reveal' ? (
              <Action variant="primary" onClick={() => session.reveal()}>
                Reveal <kbd>Space</kbd>
              </Action>
            ) : (
              <PllGrid onPick={(id) => session.commit(id)} />
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
                  {teachResult && (
                    <p className="stage__hint stage__hint--teach">{teachResult.text}</p>
                  )}
                  <p className="stage__hint">
                    {trial.pll.recognition.summary}
                    {reading && reading.candidates.length > 1 && (
                      <> Pattern alone leaves {reading.candidates.map((c) => c.name).join(' or ')}.</>
                    )}
                  </p>
                  {brief?.tips[0] && (
                    <p className="stage__hint stage__hint--quiet">{brief.tips[0]}</p>
                  )}
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

function DrillStandby({ session }: { session: Session }) {
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
          <p className="standby__lede">
            One OLL at a time, a few reps each. You get the case and your algorithm; you
            name the PLL it will leave. Nothing is revealed until you commit.
          </p>
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

      <div className="standby__go">
        <Action variant="primary" onClick={session.start}>
          {phase === 'finished' ? 'Again' : 'Begin'} <kbd>Space</kbd>
        </Action>
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
