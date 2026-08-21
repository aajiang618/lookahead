import { useCallback, useEffect, useState } from 'react'
import { ModeStrip } from './components/Hud.tsx'
import { BoltIcon, ChartIcon, HomeIcon, SquaresIcon } from './components/icons.tsx'
import { Drill } from './routes/Drill.tsx'
import { TrainHome } from './routes/TrainHome.tsx'
import { Cases } from './routes/Cases.tsx'
import { Log } from './routes/Log.tsx'
import { useSession, GUIDED, type SessionMode } from './train/useSession.ts'
import { auditCases } from './cube/cases.ts'
import './app.css'

/*
 * Four tabs. Home is the day's plan; Train is the timed test, straight in —
 * it draws on whatever the schedule has already put in front of you, so it is
 * a tab rather than a card you must find.
 */
const MODES = [
  { id: 'train', label: 'Home', icon: <HomeIcon /> },
  { id: 'test', label: 'Train', icon: <BoltIcon /> },
  { id: 'cases', label: 'Cases', icon: <SquaresIcon /> },
  { id: 'log', label: 'Log', icon: <ChartIcon /> },
]

/**
 * Hash routing, one level deep.
 *
 * `#/train` is a page in its own right now rather than a synonym for the drill,
 * so the route has to carry which session is running: `#/train/learn`,
 * `#/train/pll/t`. Deep enough for the app and shallow enough to read.
 */
function readHash(): string[] {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const parts = raw.split('/').filter(Boolean)
  // `drill` was the old name for this tab; keep old links working.
  if (parts[0] === 'drill') parts[0] = 'train'
  // The test is a top-level tab that lives inside the train routes.
  if (parts[0] === 'test') return ['train', 'test']
  if (parts.length === 0 || !['train', 'cases', 'log'].includes(parts[0])) return ['train']
  return parts
}

export default function App() {
  const session = useSession()
  const [route, setRoute] = useState<string[]>(readHash)

  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((path: string) => {
    window.location.hash = `/${path}`
    setRoute(readHash())
  }, [])

  const tab = route[0]
  const navTab = tab === 'train' && route[1] === 'test' ? 'test' : tab

  // The session a route asks for, started once on arrival.
  const startSession = useCallback(
    (mode: SessionMode) => {
      session.start(mode)
      go(
        mode.kind === 'practice'
          ? `train/oll/${mode.ollId}`
          : mode.kind === 'guided'
            ? 'train/today'
            : mode.kind === 'timed'
              ? 'train/test'
              : `train/${mode.kind}${mode.kind === 'learn' && mode.more ? '/more' : ''}`,
      )
    },
    [session, go],
  )

  /*
   * Leaving a drill returns to the tab's home rather than to standby. Standby
   * was the only place a session could end up, which meant the way out of a
   * session was a screen that mostly asked you to start another one.
   */
  const leaveDrill = useCallback(() => go('train'), [go])

  // The case data is generated from algorithms at load. If that ever produced
  // something inconsistent, the trainer would teach the wrong answer with total
  // confidence, so say so loudly rather than drilling on bad data.
  const [dataProblems] = useState(() => auditCases())

  const inSession = tab === 'train' && route.length > 1
  /*
   * The route names the session, so reloading the page on `#/train/review` — or
   * opening it from a home-screen shortcut — starts a review rather than
   * landing on an empty screen that has forgotten what it was for.
   */
  const routeMode: SessionMode =
    route[1] === 'learn'
      ? { kind: 'learn', more: route[2] === 'more' }
      : route[1] === 'review'
        ? { kind: 'review' }
        : route[1] === 'test' || route[1] === 'timed'
          ? { kind: 'timed' }
          : route[1] === 'oll' && route[2]
            ? { kind: 'practice', ollId: route[2] }
            : GUIDED

  return (
    <>
      {/* The direction contract lives in index.html, where the build cannot strip it. */}

      <a className="skip-link" href="#main">
        Skip to the drill
      </a>

      <header className="shell__head">
        <div className="shell__brand">
          <Wordmark />
        </div>
        <ModeStrip
          items={MODES}
          active={navTab}
          onSelect={(id) => {
            if (id === 'test') {
              session.start({ kind: 'timed' })
              go('train/test')
            } else go(id)
          }}
        />
      </header>

      {dataProblems.length > 0 && (
        <p className="shell__alert label" role="alert">
          Case data failed its integrity check: {dataProblems[0]}
        </p>
      )}

      <main id="main" className="shell__main">
        {tab === 'train' &&
          (inSession ? (
            <Drill session={session} mode={routeMode} onLeave={leaveDrill} />
          ) : (
            <TrainHome
              session={session}
              onStart={startSession}
              onPickCase={(ollId) => startSession({ kind: 'practice', ollId })}
            />
          ))}
        {tab === 'cases' && (
          <Cases
            session={session}
            selectedId={route[1] ?? null}
            onSelect={(id) => go(id ? `cases/${id}` : 'cases')}
          />
        )}
        {tab === 'log' && <Log session={session} />}
      </main>
    </>
  )
}

export { GUIDED }

/** The mark: four corner brackets and a cross, the app's own grammar. */
function Wordmark() {
  return (
    <span className="wordmark">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
        </g>
        <path d="M12 9.5v5M9.5 12h5" stroke="var(--caution)" strokeWidth="1.4" />
      </svg>
      <b>Lookahead</b>
    </span>
  )
}
