/**
 * The Train tab's front door: four cards, then the case grid.
 *
 * The cards are deliberately the same shape — a name, one line of state, and
 * nothing else. Today is the scheduler's plan; Learn and Review are its two
 * halves; Test is timed recognition across everything unlocked, the drill you
 * can run with no cube in your hands. The grid underneath practises one OLL,
 * multiple choice, unscored.
 */

import { useMemo } from 'react'
import { OLL_CASES } from '../cube/cases.ts'
import { composePool, DAILY_NEW_CAP, newLoadCount } from '../train/scheduler.ts'
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

  const counts = useMemo(() => {
    const pool = composePool(progress, 100)
    const items = Object.values(progress.items)
    const introducedToday = (progress.newByDay[today()] ?? []).length
    return {
      due: pool.dueMaintenance.length,
      learning: pool.building.length,
      unlocked: items.filter((i) => i.phase !== 'locked').length,
      newLeft: Math.max(0, DAILY_NEW_CAP - introducedToday),
      active: newLoadCount(progress),
      started: items.length > 0,
    }
  }, [progress])

  return (
    <div className="train-home">
      <h1 className="train-home__title">
        {counts.started && baseline.medianSeconds
          ? `${baseline.medianSeconds.toFixed(2)}s`
          : 'Lookahead'}
      </h1>

      <div className="train-home__cards">
        <Card
          primary
          title="Today"
          line={
            counts.started
              ? `${counts.due} due · ${counts.learning} learning · ${counts.newLeft} new`
              : 'Start here'
          }
          onClick={() => onStart({ kind: 'guided' })}
        />
        <Card
          title="Learn"
          line={
            counts.learning > 0
              ? `${counts.learning} in progress`
              : counts.newLeft > 0
                ? `${counts.newLeft} new available`
                : 'Nothing new today'
          }
          disabled={counts.learning === 0 && counts.newLeft === 0}
          onClick={() => onStart({ kind: 'learn' })}
        />
        <Card
          title="Review"
          line={counts.due > 0 ? `${counts.due} due` : 'Nothing due'}
          disabled={counts.due === 0}
          onClick={() => onStart({ kind: 'review' })}
        />
        <Card
          title="Test"
          line={counts.unlocked > 0 ? `${counts.unlocked} cases, timed` : 'Learn a case first'}
          disabled={counts.unlocked === 0}
          onClick={() => onStart({ kind: 'timed' })}
        />
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
                  onClick={() => onPickCase(oll.id)}
                >
                  <b>{oll.number}</b>
                  <i className="label">{oll.group}</i>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function Card({
  title,
  line,
  onClick,
  primary,
  disabled,
}: {
  title: string
  line: string
  onClick: () => void
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="train-home__card"
      data-primary={primary}
      disabled={disabled}
      onClick={onClick}
    >
      <b>{title}</b>
      <i>{line}</i>
    </button>
  )
}
