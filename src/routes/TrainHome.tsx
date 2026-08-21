/**
 * The Train tab's front door.
 *
 * Two ways in, and they are not equals. The guided session is the one the
 * scheduler exists for: it decides what is due and how much new material the
 * day can carry, and following it is what makes the intervals mean anything.
 * Picking a case yourself is the other way, and it is deliberately kept to one
 * side — useful when you know what is bothering you, useless as a substitute
 * for the schedule.
 *
 * Learn and Review are the same session split by what it contains, so the two
 * halves of a day's work can be done separately: new material when you have the
 * attention for it, review when you do not.
 */

import { useMemo } from 'react'
import { PLL_CASES } from '../cube/cases.ts'
import { Action } from '../components/Hud.tsx'
import { composePool, DAILY_NEW_CAP, newLoadCount } from '../train/scheduler.ts'
import { today } from '../train/store.ts'
import type { SessionMode } from '../train/useSession.ts'
import type { useSession } from '../train/useSession.ts'
import './train-home.css'

type Session = ReturnType<typeof useSession>

export function TrainHome({
  session,
  onStart,
  onPickPll,
}: {
  session: Session
  onStart: (mode: SessionMode) => void
  onPickPll: (pllId: string) => void
}) {
  const { progress, baseline } = session

  const counts = useMemo(() => {
    const pool = composePool(progress, 100)
    const items = Object.values(progress.items)
    const introducedToday = (progress.newByDay[today()] ?? []).length
    return {
      due: pool.dueMaintenance.length,
      learning: pool.building.length,
      automatic: items.filter((i) => i.phase === 'maintenance').length,
      newLeft: Math.max(0, DAILY_NEW_CAP - introducedToday),
      active: newLoadCount(progress),
      started: items.length > 0,
    }
  }, [progress])

  const nothingToday = counts.due === 0 && counts.learning === 0 && counts.newLeft === 0

  return (
    <div className="train-home">
      <section className="train-home__today">
        <div className="train-home__headline">
          <h1 className="train-home__title">
            {counts.started
              ? baseline.medianSeconds
                ? `${baseline.medianSeconds.toFixed(2)}s`
                : 'Ready'
              : 'Train the seam'}
          </h1>
          <p className="train-home__lede">
            {counts.started
              ? nothingToday
                ? 'Nothing is due and the day’s new cases are used up. Anything more today is practice.'
                : `${counts.due} to review, ${counts.learning} still being learned, ${counts.newLeft} new left today.`
              : 'One OLL at a time. You get the case and your algorithm; you name the PLL it will leave.'}
          </p>
        </div>

        <div className="train-home__go">
          <Action variant="primary" onClick={() => onStart({ kind: 'guided' })}>
            {counts.started ? 'Start today' : 'Begin'}
          </Action>
        </div>

        <div className="train-home__split">
          <button
            type="button"
            className="train-home__mode"
            onClick={() => onStart({ kind: 'learn' })}
            disabled={counts.learning === 0 && counts.newLeft === 0}
          >
            <b>Learn</b>
            <i>
              {counts.learning > 0
                ? `${counts.learning} in progress`
                : counts.newLeft > 0
                  ? `${counts.newLeft} new available`
                  : 'nothing new today'}
            </i>
            <span className="label">Taught first, then tested.</span>
          </button>

          <button
            type="button"
            className="train-home__mode"
            onClick={() => onStart({ kind: 'review' })}
            disabled={counts.due === 0}
          >
            <b>Review</b>
            <i>{counts.due > 0 ? `${counts.due} due` : 'nothing due'}</i>
            <span className="label">Cases the schedule says are ready.</span>
          </button>
        </div>

        {/*
          The day cap exists because introducing more than a few cases at once
          makes every one of them worse. Raising it is a decision, so it is a
          separate control that says what it does rather than a bigger number
          in settings.
        */}
        <button
          type="button"
          className="train-home__more label"
          onClick={() => onStart({ kind: 'learn', more: true })}
        >
          Learn more than today’s {DAILY_NEW_CAP} — adds cases beyond the day’s allowance
        </button>
      </section>

      <section className="train-home__pick">
        <header className="train-home__pick-head">
          <h2 className="train-home__pick-title">Practise one case</h2>
          <p className="label">
            Pick the PLL you want to see coming. Every OLL that can leave it, in turn — not
            scored, so it cannot disturb the schedule.
          </p>
        </header>

        <ul className="train-home__grid">
          {PLL_CASES.map((pll) => (
            <li key={pll.id}>
              <button type="button" className="train-home__case" onClick={() => onPickPll(pll.id)}>
                <b>{pll.name}</b>
                <i className="label">{pll.group}</i>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
