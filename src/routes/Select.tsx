/**
 * Choose what to train.
 *
 * This screen replaced Home and Today. Home showed one card that decided your
 * day for you — what was due, what you were allowed to learn next — and the
 * whole of it rested on the app knowing better than the solver which cases
 * they should be looking at. It does not.
 *
 * So: all 57, grouped the way cubers already talk about them, and you pick. One
 * case or twenty, and it remembers the selection between sessions because
 * "the dot cases, again" is a thing you want to say once rather than daily.
 *
 * Every tile carries its own diagram rather than only a number, because a shape
 * is recognised faster than a numeral — which is rather the point of this app —
 * and its seam count, which is the honest measure of how much of a case you
 * have actually met.
 */

import { useMemo } from 'react'
import { OLL_CASES, PLL_CASES, type OLLCase } from '../cube/cases.ts'
import { CaseDiagram } from '../components/CaseDiagram.tsx'
import { Action } from '../components/Hud.tsx'
import { OLL_GROUPS, predictItemId } from '../train/curriculum.ts'
import type { useSession } from '../train/useSession.ts'
import './select.css'

type Session = ReturnType<typeof useSession>

interface Tile {
  oll: OLLCase
  /** Distinct PLLs this OLL has actually left the solver, of 21. */
  seams: number
  status: 'new' | 'learning' | 'automatic'
}

export function Select({ session, onTrain }: { session: Session; onTrain: (ollIds: string[]) => void }) {
  const { progress, settings, baseline } = session
  const chosen = settings.trainCases

  const tiles: Tile[] = useMemo(
    () =>
      OLL_CASES.map((oll) => {
        const item = progress.items[predictItemId(oll.id)]
        return {
          oll,
          seams: item?.seenPlls.length ?? 0,
          status: !item
            ? 'new'
            : item.phase === 'maintenance'
              ? 'automatic'
              : 'learning',
        }
      }),
    [progress.items],
  )

  const byGroup = useMemo(() => {
    const map = new Map<string, Tile[]>()
    for (const tile of tiles) {
      const list = map.get(tile.oll.group) ?? []
      list.push(tile)
      map.set(tile.oll.group, list)
    }
    return map
  }, [tiles])

  const set = (ids: string[]) => session.updateSettings({ trainCases: ids })

  /*
   * Every toggle reads the LIVE selection rather than this render's copy.
   * Tapping three tiles quickly runs three handlers before React re-renders,
   * and a snapshot read would make each of them compute its new array from the
   * same starting point — so two of the three taps would vanish.
   */
  const toggle = (id: string) =>
    session.updateSettings((s) => ({
      trainCases: s.trainCases.includes(id)
        ? s.trainCases.filter((x) => x !== id)
        : [...s.trainCases, id],
    }))

  const toggleGroup = (group: string) => {
    const ids = (byGroup.get(group) ?? []).map((t) => t.oll.id)
    session.updateSettings((s) => ({
      trainCases: ids.every((id) => s.trainCases.includes(id))
        ? s.trainCases.filter((id) => !ids.includes(id))
        : [...new Set([...s.trainCases, ...ids])],
    }))
  }

  const seamsSeen = tiles.reduce((n, t) => n + t.seams, 0)
  const totalSeams = OLL_CASES.length * PLL_CASES.length

  return (
    <div className="select">
      <header className="select__head">
        <h1 className="select__title">
          {baseline.medianSeconds ? `${baseline.medianSeconds.toFixed(2)}s` : 'Lookahead'}
        </h1>
        {/*
          Seams, not cases. "38 of 57 started" flatters — you can have met one
          of a case's twenty-one outcomes and it counts. This is the number that
          says how much of the actual skill has been touched.
        */}
        <p className="select__sub label">
          {seamsSeen} of {totalSeams} seams seen
        </p>
      </header>

      <div className="select__bulk">
        <button type="button" className="select__bulk-item label" onClick={() => set(OLL_CASES.map((o) => o.id))}>
          All 57
        </button>
        <button type="button" className="select__bulk-item label" onClick={() => set([])}>
          Clear
        </button>
        <button
          type="button"
          className="select__bulk-item label"
          data-on={settings.setupFirst}
          onClick={() => session.updateSettings({ setupFirst: !settings.setupFirst })}
          title="Show the scramble alone first and start the clock when you tap"
        >
          Real cube
        </button>
      </div>

      {OLL_GROUPS.map((group) => {
        const list = byGroup.get(group) ?? []
        if (list.length === 0) return null
        const on = list.filter((t) => chosen.includes(t.oll.id)).length
        return (
          <section key={group} className="select__group">
            <button
              type="button"
              className="select__group-head label"
              onClick={() => toggleGroup(group)}
              data-on={on === list.length}
            >
              {group}
              <i>{on > 0 ? `${on} of ${list.length}` : ''}</i>
            </button>
            <ul className="select__grid">
              {list.map((tile) => (
                <li key={tile.oll.id}>
                  <button
                    type="button"
                    className="select__case"
                    data-on={chosen.includes(tile.oll.id)}
                    data-status={tile.status}
                    title={`${tile.oll.name} — ${tile.seams} of ${PLL_CASES.length} seams seen`}
                    aria-pressed={chosen.includes(tile.oll.id)}
                    onClick={() => toggle(tile.oll.id)}
                  >
                    <CaseDiagram facelets={tile.oll.state} mode="orientation" size={56} />
                    <b>{tile.oll.number}</b>
                    <i className="select__seams readout">
                      {tile.seams > 0 ? `${tile.seams}/${PLL_CASES.length}` : 'new'}
                    </i>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {/*
        Fixed to the bottom because the grid is 57 tiles long: a start control at
        the end of it is a control you have to go and find after every change of
        mind about the selection.
      */}
      <div className="select__go">
        <Action variant="primary" onClick={() => onTrain(chosen)} disabled={chosen.length === 0}>
          {chosen.length === 0
            ? 'Pick a case'
            : `Train ${chosen.length} ${chosen.length === 1 ? 'case' : 'cases'}`}
        </Action>
      </div>
    </div>
  )
}
