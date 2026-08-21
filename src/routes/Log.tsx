/**
 * The log.
 *
 * Session history, the latency trend, and settings. Accuracy is shown small
 * and late on purpose: across 21 cases it saturates near 100% within a couple
 * of weeks and then carries almost no information. The number worth watching
 * is median recognition time, and the shape worth watching is whether it is
 * still falling.
 */

import { useCallback, useRef, useState } from 'react'
import { Action, Panel, Readout } from '../components/Hud.tsx'
import { SPEED_TIERS } from '../train/latency.ts'
import { exportProgress, importProgress, type Progress } from '../train/store.ts'
import type { useSession } from '../train/useSession.ts'
import './log.css'

type Session = ReturnType<typeof useSession>

export function Log({ session }: { session: Session }) {
  const { progress, settings, baseline } = session
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const sessions = [...progress.sessions].reverse()
  const trend = progress.sessions.slice(-40)

  const download = useCallback(() => {
    const blob = new Blob([exportProgress(progress)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `lookahead-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [progress])

  const upload = useCallback(
    async (file: File) => {
      try {
        const next: Progress = importProgress(await file.text())
        session.replaceProgress(next)
        setMessage('Progress restored.')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'That file could not be read.')
      }
    },
    [session],
  )

  const totalTrials = progress.sessions.reduce((sum, s) => sum + s.trials, 0)

  return (
    <div className="log">
      <section className="log__summary">
        <Readout
          label="Median"
          value={baseline.medianSeconds ? baseline.medianSeconds.toFixed(2) : '—'}
          unit="s"
        />
        <Readout label="Tier" value={baseline.tier.name} />
        <Readout label="Streak" value={String(progress.streakDays)} unit="d" tone="dim" />
        <Readout label="Sessions" value={String(progress.sessions.length)} tone="dim" />
        <Readout label="Reps" value={String(totalTrials)} tone="dim" />
      </section>

      <Panel label="Recognition trend">
        {trend.length < 2 ? (
          <p className="log__empty">
            Two sessions will draw a line here. One session is a data point, not a trend.
          </p>
        ) : (
          <TrendChart
            values={trend.map((s) => s.medianNetRt).filter((v) => v > 0)}
            threshold={session.threshold}
          />
        )}
      </Panel>

      <Panel label="Pace ladder">
        <ul className="log__tiers">
          {[...SPEED_TIERS].reverse().map((tier) => (
            <li key={tier.name} data-current={tier.name === baseline.tier.name}>
              <span className="log__tier-name label">{tier.name}</span>
              <span className="log__tier-range readout">
                {tier.medianCeiling === Infinity ? 'over 3.0s' : `under ${tier.medianCeiling.toFixed(1)}s`}
              </span>
            </li>
          ))}
        </ul>
        <p className="log__note">
          Tiers set the timeout and the bar for a fast answer. They move on your own
          median, so they follow you rather than a leaderboard.
        </p>
      </Panel>

      <Panel label="Settings">
        <div className="log__settings">
          <label className="log__setting">
            <span className="label">Session length</span>
            <select
              value={settings.sessionSeconds}
              onChange={(e) => session.updateSettings({ sessionSeconds: Number(e.target.value) })}
            >
              <option value={180}>3 minutes</option>
              <option value={300}>5 minutes</option>
              <option value={420}>7 minutes</option>
              <option value={600}>10 minutes</option>
            </select>
          </label>

          <label className="log__setting">
            <span className="label">Answering</span>
            <select
              value={settings.answerMode}
              onChange={(e) =>
                session.updateSettings({ answerMode: e.target.value as 'choices' | 'reveal' })
              }
            >
              <option value="choices">Pick from four</option>
              <option value="reveal">Reveal and self-grade</option>
            </select>
          </label>

          <label className="log__setting">
            <span className="label">Reps per exercise</span>
            <select
              value={settings.repsPerExercise}
              onChange={(e) => session.updateSettings({ repsPerExercise: Number(e.target.value) })}
            >
              <option value={1}>1 — interleave every rep</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={6}>6</option>
            </select>
            <span className="log__hint">
              How many reps of one OLL before moving on. Blocks are easier to follow;
              interleaving every rep is harder in the moment and retains better, so 1 is
              the option to graduate to.
            </span>
          </label>

          <label className="log__setting">
            <span className="label">Head start</span>
            <select
              value={settings.headStart}
              onChange={(e) => session.updateSettings({ headStart: Number(e.target.value) })}
            >
              <option value={0}>None — read it before you start</option>
              <option value={1}>1 move in</option>
              <option value={2}>2 moves in</option>
              <option value={3}>3 moves in</option>
            </select>
            <span className="log__hint">
              Starts the drill part-way through the algorithm. The OLL shape has already
              broken up, so there is nothing to do but follow the pieces — which is what
              predicting during execution actually feels like.
            </span>
          </label>

          <label className="log__setting">
            <span className="label">Cube size</span>
            <input
              type="range"
              min={0.7}
              max={1.6}
              step={0.05}
              value={settings.cubeZoom}
              onChange={(e) => session.updateSettings({ cubeZoom: Number(e.target.value) })}
            />
            <span className="log__hint">
              How much of the frame the cube fills. You can also scroll or pinch on the
              cube itself.
            </span>
          </label>

          <Toggle
            label="Vary the viewing angle"
            hint="Rotates the camera, never the cube — it cannot change an answer."
            checked={settings.varyAngle}
            onChange={(varyAngle) => session.updateSettings({ varyAngle })}
          />
          <Toggle
            label="Vary the AUF"
            hint="Same case, different position. Closer to a real solve."
            checked={settings.varyAuf}
            onChange={(varyAuf) => session.updateSettings({ varyAuf })}
          />
          <Toggle
            label="Reduce motion"
            hint="Turns off slews, sweeps and turn animation."
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => session.updateSettings({ reduceMotion })}
          />
        </div>
      </Panel>

      <Panel label="Your data">
        <p className="log__note">
          Everything lives in this browser. Nothing is uploaded, and there is no account.
          That also means clearing site data clears your progress, so export occasionally.
        </p>
        <div className="log__data-actions">
          <Action onClick={download}>Export</Action>
          <Action onClick={() => fileRef.current?.click()}>Import</Action>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ''
            }}
          />
        </div>
        {message && (
          <p className="log__note log__note--alert" role="status">
            {message}
          </p>
        )}
      </Panel>

      <Panel label="Sessions">
        {sessions.length === 0 ? (
          <p className="log__empty">No sessions yet.</p>
        ) : (
          <ul className="log__sessions">
            {sessions.slice(0, 30).map((s) => (
              <li key={s.id}>
                <span className="log__session-day readout">{s.day}</span>
                <span className="log__session-figure readout">{s.trials} reps</span>
                <span className="log__session-figure readout">
                  {s.medianNetRt ? `${s.medianNetRt.toFixed(2)}s` : '—'}
                </span>
                <span className="log__session-figure readout">
                  {s.trials ? `${Math.round((s.correct / s.trials) * 100)}%` : '—'}
                </span>
                <span className="log__session-reason label">{s.stopReason}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="log__toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="log__toggle-mark" aria-hidden="true" />
      <span className="log__toggle-body">
        <span className="label">{label}</span>
        <span className="log__toggle-hint">{hint}</span>
      </span>
    </label>
  )
}

/** A stroke-drawn trend line. Down is better, so the axis is labelled that way. */
function TrendChart({ values, threshold }: { values: number[]; threshold: number }) {
  if (values.length < 2) return null
  const width = 640
  const height = 140
  const pad = 4
  const max = Math.max(...values, threshold) * 1.1
  const min = 0
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2)
  const y = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2)

  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const first = values[0]
  const last = values[values.length - 1]
  const change = first > 0 ? ((last - first) / first) * 100 : 0

  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${width} ${height}`} className="trend__svg" role="img"
        aria-label={`Median recognition time across ${values.length} sessions, ${change <= 0 ? 'down' : 'up'} ${Math.abs(change).toFixed(0)} percent`}
      >
        <line
          x1={pad}
          x2={width - pad}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="var(--caution)"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="1.75" fill="var(--ink-dim)" />
        ))}
      </svg>
      <figcaption className="trend__caption">
        <span className="label">Mastery pace {threshold.toFixed(2)}s</span>
        <span className="label" data-tone={change <= 0 ? 'good' : 'bad'}>
          {change <= 0 ? 'Down' : 'Up'} {Math.abs(change).toFixed(0)}% over {values.length} sessions
        </span>
      </figcaption>
    </figure>
  )
}
