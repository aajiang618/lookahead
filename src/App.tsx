import { useCallback, useEffect, useState } from 'react'
import { ModeStrip } from './components/Hud.tsx'
import { Drill } from './routes/Drill.tsx'
import { TrainHome } from './routes/TrainHome.tsx'
import { Cases } from './routes/Cases.tsx'
import { Log } from './routes/Log.tsx'
import { useSession, GUIDED, type SessionMode } from './train/useSession.ts'
import { auditCases } from './cube/cases.ts'
import './app.css'

const MODES = [
  { id: 'train', label: 'Train' },
  { id: 'cases', label: 'Cases' },
  { id: 'log', label: 'Log' },
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

  // The session a route asks for, started once on arrival.
  const startSession = useCallback(
    (mode: SessionMode) => {
      session.start(mode)
      go(
        mode.kind === 'practice'
          ? `train/pll/${mode.pllId}`
          : mode.kind === 'guided'
            ? 'train/today'
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
        : route[1] === 'pll' && route[2]
          ? { kind: 'practice', pllId: route[2] }
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
        <ModeStrip items={MODES} active={tab} onSelect={(id) => go(id)} />
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
              onPickPll={(pllId) => startSession({ kind: 'practice', pllId })}
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
