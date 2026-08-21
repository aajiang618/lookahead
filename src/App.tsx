import { useEffect, useState } from 'react'
import { ModeStrip } from './components/Hud.tsx'
import { Drill } from './routes/Drill.tsx'
import { Cases } from './routes/Cases.tsx'
import { Log } from './routes/Log.tsx'
import { useSession } from './train/useSession.ts'
import { auditCases } from './cube/cases.ts'
import './app.css'

const MODES = [
  { id: 'drill', label: 'Train' },
  { id: 'cases', label: 'Cases' },
  { id: 'log', label: 'Log' },
]

const VALID = new Set(MODES.map((m) => m.id))

function readHash(): string {
  const raw = window.location.hash.replace('#/', '').replace('#', '')
  return VALID.has(raw) ? raw : 'drill'
}

export default function App() {
  const session = useSession()
  const [mode, setMode] = useState(readHash)

  // Hash routing, so a mode survives a reload and the back button works.
  useEffect(() => {
    const onHash = () => setMode(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (next: string) => {
    window.location.hash = `/${next}`
    setMode(next)
  }

  // The case data is generated from algorithms at load. If that ever produced
  // something inconsistent, the trainer would teach the wrong answer with total
  // confidence, so say so loudly rather than drilling on bad data.
  const [dataProblems] = useState(() => auditCases())

  return (
    <>
      {/* The direction contract lives in index.html, where the build cannot strip it. */}

      <a className="skip-link" href="#main">
        Skip to the drill
      </a>

      <header className="shell__head">
        <div className="shell__brand">
          <Wordmark />
          <span className="shell__tagline label">OLL → PLL recognition</span>
        </div>
        <ModeStrip items={MODES} active={mode} onSelect={go} />
      </header>

      {dataProblems.length > 0 && (
        <p className="shell__alert label" role="alert">
          Case data failed its integrity check: {dataProblems[0]}
        </p>
      )}

      <main id="main" className="shell__main">
        {mode === 'drill' && <Drill session={session} />}
        {mode === 'cases' && <Cases session={session} />}
        {mode === 'log' && <Log session={session} />}
      </main>
    </>
  )
}

/** The mark: four corner brackets and a boresight, the app's own grammar. */
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
