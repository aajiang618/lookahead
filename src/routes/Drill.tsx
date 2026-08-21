/**
 * The drill.
 *
 * The cube is the screen. Everything else is a thin strip above it and a thin
 * strip below, and nothing at all sits beside it — you are meant to be looking
 * at the cube, not reading an interface. The two aids that used to be labelled
 * buttons in the bottom strip are now icons floated at the cube's edge, out of
 * the reading path.
 *
 * Every rep is a test with four options, and the verdict is exactly two words
 * plus, when it is wrong, the one sentence that says why. The first rep of a
 * case you have never trained teaches instead, step by step.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CubeView3D, type CubeHandle } from '../components/CubeView3D.tsx'
import { CaseDiagram } from '../components/CaseDiagram.tsx'
import { PllChoices } from '../components/PllChoices.tsx'
import { Action } from '../components/Hud.tsx'
import { ArrowsIcon, HintIcon } from '../components/icons.tsx'
import { PLL_CASES } from '../cube/cases.ts'
import { pieceMapOf } from '../cube/tracking.ts'
import { buildTeachingBrief, hintsFor, recognitionArrows } from '../cube/recognition.ts'
import { SPEED_TIERS } from '../train/latency.ts'
import { itemLabel } from '../train/curriculum.ts'
import type { useSession } from '../train/useSession.ts'
import './drill.css'

type Session = ReturnType<typeof useSession>

export function Drill({
  session,
  ollIds,
  onLeave,
}: {
  session: Session
  /** The cases this session is drawing on, for the standby screen's count. */
  ollIds: string[]
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
   * With "real cube" on, the scramble is shown alone and the cube only when the
   * solver taps. Recognition is what is being measured, and setting the case up
   * in your hands is not recognition — but it is also a tap per rep, so it is
   * off unless someone is actually holding a cube.
   */
  const setupFirst = settings.setupFirst
  const [looking, setLooking] = useState(!setupFirst)
  useEffect(() => {
    setLooking(!setupFirst)
  }, [trial, setupFirst])
  const startLooking = useCallback(() => {
    setLooking(true)
    session.beginLooking()
  }, [session])

  /*
   * Only the FIRST rep of a case you have never trained teaches. The lesson is
   * given once and everything after tests against it — reading the same
   * sentence four times in a row is copying, not learning.
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
    else session.completeTeaching()
  }, [teachStep, askSteps, session])

  /*
   * The ladder now carries both routes — where to look, how the pieces move,
   * what the colours say, then the comparison that settles it — because a hint
   * is asked for at the moment the method the lesson committed to is not
   * working, and repeating that method would be no help at all.
   */
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
   * The lesson's own reading sentence, kept for the teaching rep's conclusion.
   * An ordinary rep no longer prints it: a correct answer needs no argument,
   * and a wrong one gets the contrast instead, which is the more useful thing.
   */
  const lessonReading = useMemo(
    () =>
      revealed && trial && feedback?.taught
        ? (buildTeachingBrief(
            trial.oll,
            trial.drill.ollAlg,
            trial.drill.state,
            trial.resolved,
            trial.pll,
          ).find((s) => s.key === 'read')?.text ?? null)
        : null,
    [revealed, trial, feedback],
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
        if (phase === 'idle' || phase === 'finished') session.start({ kind: 'train', ollIds })
        else if (phase === 'presenting' && teaching) teachAdvance()
        else if (phase === 'feedback') session.next()
        return
      }
      if (event.key === 'Enter' && phase === 'feedback') session.next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, session, toggleArrows, teaching, teachAdvance, trial, leave, ollIds])

  if (phase === 'idle' || phase === 'finished')
    return <DrillStandby session={session} ollIds={ollIds} onLeave={onLeave} />
  if (!trial) return null

  return (
    <div className="stage" data-phase={phase} data-teaching={Boolean(teaching)}>
      {/*
        The scramble, alone and full screen, until the solver taps. Everything
        else in the drill is laid out behind it and does not move when it goes.
      */}
      {!looking && (
        <div className="stage__setup">
          {/* The whole panel is the tap target — you should not have to aim
              while holding a cube. */}
          <button type="button" className="stage__setup-tap" onClick={startLooking}>
            <span className="stage__setup-label label">Apply from solved</span>
            <span className="stage__setup-scramble mono">{trial.drill.scramble}</span>
            <span className="stage__setup-go label">Tap when you are looking at it</span>
          </button>
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
          {/*
            Whether this exact pairing has ever come up. The unit of recognition
            is the seam — one OLL leaving one PLL — so "I know OLL 21" can mean
            four of its twenty-one outcomes, and a first encounter deserves to
            be named rather than silently timed against reps that were not.
          */}
          {trial.newSeam ? (
            <span className="stage__seam label" data-new="true">
              New · {trial.seamsSeen} of {PLL_CASES.length}
            </span>
          ) : (
            <span className="stage__seam label">
              Seen · {trial.seamsSeen} of {PLL_CASES.length}
            </span>
          )}
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
        {/*
          The aids, at the cube's edge rather than in the strip below. They are
          things you reach for mid-rep, so they sit where the cube is and stay
          out of the line you are reading.
        */}
        {!revealed && !teaching && (
          <div className="stage__aids">
            <button
              type="button"
              className="stage__aid"
              data-on={settings.showArrows}
              onClick={toggleArrows}
              aria-pressed={settings.showArrows}
              title="Movement arrows (A)"
            >
              <ArrowsIcon />
            </button>
            <button
              type="button"
              className="stage__aid"
              data-on={hintLevel > 0}
              onClick={session.showHint}
              disabled={hintLevel >= hints.length}
              title={
                hintLevel >= hints.length
                  ? 'No more hints'
                  : `Hint ${hintLevel + 1} of ${hints.length} (H)`
              }
            >
              <HintIcon />
              {hintLevel > 0 && (
                <i className="stage__aid-count readout">
                  {hintLevel}/{hints.length}
                </i>
              )}
            </button>
          </div>
        )}
        {trial.encoding && <span className="stage__flag label">Learning — not timed</span>}
      </div>

      <footer className="stage__foot">
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
                : 'Pick the case'}
            </p>
            {/*
              The scramble is here so the same rep can be done on a real cube:
              apply it from solved and you are looking at what is on screen.
            */}
            <p className="stage__scramble mono" title="Apply from solved to set this up on a real cube">
              {trial.drill.scramble}
            </p>
            {/*
              Only the latest rung is shown, in a fixed-height box. Stacking all
              of them grew the strip and shrank the cube as you asked for help —
              the one moment the view should hold perfectly still.
            */}
            {teachAsk ? (
              <p className="stage__hint-line stage__hint-line--teach" data-shown="true">
                <b className="stage__teach-head label">{teachAsk.heading}</b>
                {teachAsk.text}
              </p>
            ) : (
              <p className="stage__hint-line" data-shown={taken.length > 0}>
                {taken.length > 0 ? taken[taken.length - 1].text : ''}
              </p>
            )}

            {teaching ? (
              <Action variant="primary" onClick={teachAdvance}>
                {teachStep < askSteps - 1 ? teaching[teachStep + 1].heading : 'Show me'}{' '}
                <kbd>Space</kbd>
              </Action>
            ) : (
              <PllChoices
                answer={trial.pll}
                resolved={trial.resolved}
                seed={trial.drill.seed}
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
                size={72}
                title={`${trial.pll.name} perm`}
                emphasiseTwoSided
              />
              <div className="stage__result-body">
                {/*
                  Two words and a time. The verdict used to be the case's name
                  with the time tucked beside it, which answered "what was it"
                  before "did I get it" — and the second question is the one you
                  are actually asking.
                */}
                <h2 className="stage__verdict-line">
                  {feedback?.taught ? (
                    <span className="stage__verdict" data-tone="taught">
                      {trial.pll.name} perm
                    </span>
                  ) : feedback?.correct ? (
                    <>
                      <span className="stage__verdict" data-tone="ok">
                        Correct
                      </span>
                      <i className="stage__time readout">{feedback.netRt.toFixed(2)}s</i>
                    </>
                  ) : (
                    <>
                      <span className="stage__verdict" data-tone="miss">
                        Incorrect
                      </span>
                      <i className="stage__time readout">{trial.pll.name} perm</i>
                    </>
                  )}
                </h2>
                {/*
                  Why, and only when it was wrong. A right answer explained is a
                  paragraph you skip, and skipping text on every rep teaches you
                  to skip the text that matters.
                */}
                {feedback?.why && <p className="stage__hint">{feedback.why}</p>}
                {lessonReading && <p className="stage__hint">{lessonReading}</p>}
              </div>
            </div>

            <div className="stage__controls">
              <button
                type="button"
                className="stage__aid stage__aid--inline"
                data-on={settings.showArrows}
                onClick={toggleArrows}
                aria-pressed={settings.showArrows}
                title="Movement arrows (A)"
              >
                <ArrowsIcon />
              </button>
              <Action variant="primary" onClick={() => session.next()}>
                Next <kbd>Space</kbd>
              </Action>
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

function DrillStandby({
  session,
  ollIds,
  onLeave,
}: {
  session: Session
  ollIds: string[]
  onLeave: () => void
}) {
  const { progress, phase, stats, stopReason, baseline } = session
  const items = Object.values(progress.items)
  const automatic = items.filter((i) => i.phase === 'maintenance').length

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
      ) : (
        <>
          <h1 className="standby__title">
            {baseline.medianSeconds ? `${baseline.medianSeconds.toFixed(2)}s` : 'Ready'}
          </h1>
          <dl className="standby__figures">
            <Figure label="Tier" value={baseline.tier.name} />
            <Figure label="Selected" value={String(ollIds.length)} />
            <Figure label="Automatic" value={String(automatic)} />
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
        <Action variant="primary" onClick={() => session.start({ kind: 'train', ollIds })}>
          {phase === 'finished' ? 'Again' : 'Begin'} <kbd>Space</kbd>
        </Action>
        <Action onClick={onLeave}>Change cases</Action>
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
