import { useCallback, useEffect, useState } from 'react'
import { ModeStrip } from './components/Hud.tsx'
import { BoltIcon, ChartIcon, SquaresIcon } from './components/icons.tsx'
import { Drill } from './routes/Drill.tsx'
import { Select } from './routes/Select.tsx'
import { Cases } from './routes/Cases.tsx'
import { Log } from './routes/Log.tsx'
import { useSession, trainMode } from './train/useSession.ts'
import { auditCases } from './cube/cases.ts'
import './app.css'

/*
 * Three tabs. There was a fourth — Home, the day's plan — and it is gone with
 * the schedule that filled it: Train opens on the case selection, which is the
 * only question the app now needs answered before it can start.
 */
const MODES = [
  { id: 'train', label: 'Train', icon: <BoltIcon /> },
  { id: 'cases', label: 'Cases', icon: <SquaresIcon /> },
  { id: 'log', label: 'Log', icon: <ChartIcon /> },
]

/**
 * Hash routing, one level deep.
 *
 * `#/train` is the selection; `#/train/go` is a session running on it. The
 * route no longer names a session KIND — there is only one — so what used to be
 * `#/train/review` and `#/train/oll/oll-4` collapse into the one path, with the
 * selection itself living in settings where it survives a reload.
 */
function readHash(): string[] {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const parts = raw.split('/').filter(Boolean)
  // `drill` was the old name for this tab; keep old links working.
  if (parts[0] === 'drill') parts[0] = 'train'
  if (parts.length === 0 || !['train', 'cases', 'log'].includes(parts[0])) return ['train']
  // Every old session route — test, learn, review, oll/<id> — lands on the
  // selection rather than 404ing into an empty drill.
  if (parts[0] === 'train' && parts[1] && parts[1] !== 'go') return ['train']
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

  /** Start a session on the cases just selected. */
  const startTraining = useCallback(
    (ollIds: string[]) => {
      if (ollIds.length === 0) return
      session.start(trainMode(ollIds))
      go('train/go')
    },
    [session, go],
  )

  /*
   * Leaving a drill returns to the selection rather than to standby. Standby
   * was the only place a session could end up, which meant the way out of a
   * session was a screen that mostly asked you to start another one.
   */
  const leaveDrill = useCallback(() => go('train'), [go])

  // The case data is generated from algorithms at load. If that ever produced
  // something inconsistent, the trainer would teach the wrong answer with total
  // confidence, so say so loudly rather than drilling on bad data.
  const [dataProblems] = useState(() => auditCases())

  /*
   * The selection lives in settings rather than in the URL, so reloading on
   * `#/train/go` resumes the same set instead of landing on an empty drill. A
   * 57-case selection does not belong in a hash.
   */
  const selected = session.settings.trainCases
  const inSession = tab === 'train' && route[1] === 'go' && selected.length > 0

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
        <ModeStrip items={MODES} active={tab} onSelect={go} />
      </header>

      {dataProblems.length > 0 && (
        <p className="shell__alert label" role="alert">
          Case data failed its integrity check: {dataProblems[0]}
        </p>
      )}

      <main id="main" className="shell__main">
        {tab === 'train' &&
          (inSession ? (
            <Drill session={session} ollIds={selected} onLeave={leaveDrill} />
          ) : (
            <Select session={session} onTrain={startTraining} />
          ))}
        {tab === 'cases' && (
          <Cases
            session={session}
            selectedId={route[1] ?? null}
            onSelect={(id) => go(id ? `cases/${id}` : 'cases')}
            onTrain={(ollId) => {
              // Training one case from its own page replaces the selection —
              // "train this" means this, not this as well as the other fifty.
              session.updateSettings({ trainCases: [ollId] })
              startTraining([ollId])
            }}
          />
        )}
        {tab === 'log' && <Log session={session} />}
      </main>
    </>
  )
}

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
