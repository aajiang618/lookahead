/**
 * Four options, one right.
 *
 * The 21-case grid is the wrong instrument for a timed test: finding a name in
 * a grid of twenty-one is a search, and search time contaminates a
 * recognition measurement. Four choices are read at a glance, so what the
 * clock records is the recognition and nothing else.
 *
 * The three wrong ones are drawn from the cases that genuinely look like the
 * right one — same corner and edge classes first, then the same family, then
 * anything. A distractor you could rule out without looking at the cube makes
 * the test easier than the skill.
 */

import { useMemo } from 'react'
import { PLL_CASES, type PLLCase } from '../cube/cases.ts'
import { readDrill } from '../cube/recognition.ts'
import type { Facelets } from '../cube/engine.ts'
import './pll-choices.css'

/** Deterministic shuffle, so the answer does not drift under a re-render. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items]
  let state = seed || 1
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) % 4294967296
    const j = state % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function pickChoices(answer: PLLCase, resolved: Facelets, seed: number): PLLCase[] {
  const lookalikes = readDrill(resolved).candidates.filter((c) => c.id !== answer.id)
  const family = PLL_CASES.filter((c) => c.group === answer.group && c.id !== answer.id)
  const rest = PLL_CASES.filter((c) => c.id !== answer.id)

  const pool: PLLCase[] = []
  for (const source of [lookalikes, shuffle(family, seed), shuffle(rest, seed + 7)]) {
    for (const c of source) {
      if (pool.length >= 3) break
      if (!pool.some((p) => p.id === c.id)) pool.push(c)
    }
  }
  return shuffle([answer, ...pool.slice(0, 3)], seed + 13)
}

export function PllChoices({
  answer,
  resolved,
  seed,
  chosenId,
  revealed,
  onPick,
}: {
  answer: PLLCase
  resolved: Facelets
  seed: number
  chosenId: string | null
  revealed: boolean
  onPick: (id: string) => void
}) {
  const choices = useMemo(() => pickChoices(answer, resolved, seed), [answer, resolved, seed])

  return (
    <div className="pll-choices">
      {choices.map((c) => {
        const state = !revealed
          ? 'idle'
          : c.id === answer.id
            ? 'correct'
            : c.id === chosenId
              ? 'wrong'
              : 'idle'
        return (
          <button
            key={c.id}
            type="button"
            className="pll-choices__option"
            data-state={state}
            disabled={revealed}
            onClick={() => onPick(c.id)}
          >
            {c.name}
          </button>
        )
      })}
    </div>
  )
}
