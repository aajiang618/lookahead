/**
 * Home: today, how far the repertoire has come, and the case grid.
 *
 * One card. Today is the whole plan — review of what is due, then new cases as
 * the gate allows — so splitting it into more cards was giving names to parts
 * of one thing. The card shows the OLLs currently being learned as diagrams,
 * because a shape is recognised faster than a number, which is rather the
 * point of this app.
 *
 * The grid practises one OLL — its diagram is the icon — multiple choice,
 * unscored.
 */

import { useMemo } from 'react'
import { OLL_CASES } from '../cube/cases.ts'
import { CaseDiagram } from '../components/CaseDiagram.tsx'
import { Ladder } from '../components/Hud.tsx'
import { composePool, DAILY_NEW_CAP } from '../train/scheduler.ts'
import { predictItemId } from '../train/useSession.ts'
import { today } from '../train/store.ts'
import type { SessionMode } from '../train/useSession.ts'
import type { useSession } from '../train/useSession.ts'
import './train-home.css'

type Session = ReturnType<typeof useSession>

export function TrainHome({
  session,
  onStart,
  onPickCase,
}: {
  session: Session
  onStart: (mode: SessionMode) => void
  onPickCase: (ollId: string) => void
}) {
  const { progress, baseline } = session

  const state = useMemo(() => {
    const pool = composePool(progress, 100)
    const items = Object.values(progress.items)
    const introducedToday = (progress.newByDay[today()] ?? []).length
    const learningIds = new Set(pool.building)
    return {
      due: pool.dueMaintenance.length,
      learning: OLL_CASES.filter((oll) => learningIds.has(predictItemId(oll.id))),
      automatic: items.filter((i) => i.phase === 'maintenance').length,
      newLeft: Math.max(0, DAILY_NEW_CAP - introducedToday),
      started: items.length > 0,
    }
  }, [progress])

  return (
    <div className="train-home">
      <h1 className="train-home__title">
        {state.started && baseline.medianSeconds
          ? `${baseline.medianSeconds.toFixed(2)}s`
          : 'Lookahead'}
      </h1>

      <button type="button" className="train-home__today" onClick={() => onStart({ kind: 'guided' })}>
        <span className="train-home__today-text">
          <b>Today</b>
          <i>
            {state.started
              ? `${state.due} to review · ${state.newLeft} new`
              : 'Start here'}
          </i>
        </span>
        {state.learning.length > 0 && (
          <span className="train-home__today-cases" aria-hidden="true">
            {state.learning.slice(0, 4).map((oll) => (
              <CaseDiagram key={oll.id} facelets={oll.state} mode="orientation" size={40} />
            ))}
          </span>
        )}
      </button>

      <div className="train-home__progress">
        <Ladder value={state.automatic / OLL_CASES.length} />
        <span className="label">
          {state.automatic} of {OLL_CASES.length} automatic
        </span>
      </div>

      <button
        type="button"
        className="train-home__more label"
        onClick={() => onStart({ kind: 'learn', more: true })}
      >
        Learn beyond today’s {DAILY_NEW_CAP}
      </button>

      <section className="train-home__pick">
        <h2 className="train-home__pick-title">Practise one case</h2>
        <ul className="train-home__grid">
          {OLL_CASES.map((oll) => {
            const item = progress.items[predictItemId(oll.id)]
            return (
              <li key={oll.id}>
                <button
                  type="button"
                  className="train-home__case"
                  data-state={item?.phase ?? 'locked'}
                  title={oll.name}
                  onClick={() => onPickCase(oll.id)}
                >
                  <CaseDiagram facelets={oll.state} mode="orientation" size={40} />
                  <b>{oll.number}</b>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
