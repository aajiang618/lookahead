/**
 * The answer grid.
 *
 * All 21 cases, always in the same 21 positions. That fixity is a measurement
 * decision, not a layout one: a grid that reorders itself has to be searched,
 * and searching is not recognising. Held constant, the grid turns into spatial
 * memory within a few sessions and stops adding to the timed interval.
 *
 * Typing selects. `g` narrows to the four G perms, `ga` commits — which is
 * faster than any pointer and keeps the drill playable one-handed with a cube
 * in the other.
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { PLL_BY_NAME, type PLLCase } from '../cube/cases.ts'
import { CaseDiagram } from './CaseDiagram.tsx'
import './pll-grid.css'

/**
 * Fixed reading order, grouped the way cubers group them: adjacent-corner
 * swaps, diagonal swaps, the G perms, then the pure edge cycles.
 */
export const GRID_ORDER = [
  'Aa', 'Ab', 'F', 'Ja', 'Jb', 'Ra', 'Rb',
  'T', 'E', 'Na', 'Nb', 'V', 'Y', 'H',
  'Ga', 'Gb', 'Gc', 'Gd', 'Ua', 'Ub', 'Z',
]

export interface PllGridProps {
  onPick: (pllId: string) => void
  disabled?: boolean
  /** Highlight the right answer and, if wrong, what was chosen. */
  revealed?: { correctId: string; chosenId: string | null } | null
  /** Restrict the playable set. Everything else is drawn back but still shown. */
  enabledIds?: Set<string>
}

export function PllGrid({ onPick, disabled = false, revealed = null, enabledIds }: PllGridProps) {
  const [typed, setTyped] = useState('')
  const clearTimer = useRef<number | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  const cases = GRID_ORDER.map((name) => PLL_BY_NAME.get(name)).filter(Boolean) as PLLCase[]

  useEffect(() => {
    if (disabled) {
      setTyped('')
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if (event.key === 'Escape') {
        setTyped('')
        return
      }
      if (event.key === 'Backspace') {
        setTyped((t) => t.slice(0, -1))
        event.preventDefault()
        return
      }
      if (!/^[a-zA-Z]$/.test(event.key)) return

      const nextTyped = (typed + event.key).toLowerCase()
      const matches = cases.filter((c) => c.name.toLowerCase().startsWith(nextTyped))

      if (matches.length === 0) {
        // A letter that matches nothing restarts the guess rather than sticking.
        const restart = event.key.toLowerCase()
        setTyped(cases.some((c) => c.name.toLowerCase().startsWith(restart)) ? restart : '')
        return
      }

      setTyped(nextTyped)
      // Commit as soon as the prefix can only mean one case.
      if (matches.length === 1) {
        setTyped('')
        onPick(matches[0].id)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [typed, disabled, cases, onPick])

  // Typed prefixes lapse, so an abandoned guess never poisons the next answer.
  useEffect(() => {
    window.clearTimeout(clearTimer.current)
    if (typed) clearTimer.current = window.setTimeout(() => setTyped(''), 1400)
    return () => window.clearTimeout(clearTimer.current)
  }, [typed])

  return (
    <div className="pll-grid" ref={containerRef} role="group" aria-label="Choose the resulting PLL">
      {cases.map((pll) => {
        const isCorrect = revealed?.correctId === pll.id
        const isChosen = revealed?.chosenId === pll.id
        const matchesTyped = typed.length > 0 && pll.name.toLowerCase().startsWith(typed)
        const playable = !enabledIds || enabledIds.has(pll.id)

        let state: string = 'idle'
        if (revealed) state = isCorrect ? 'correct' : isChosen ? 'wrong' : 'muted'
        else if (matchesTyped) state = 'matched'

        return (
          <button
            key={pll.id}
            type="button"
            className="pll-grid__cell"
            data-state={state}
            data-playable={playable}
            disabled={disabled}
            onClick={() => onPick(pll.id)}
            aria-label={`${pll.name} perm`}
          >
            {state === 'correct' && (
              <motion.span
                layoutId="pll-answer-box"
                className="pll-grid__box"
                transition={{ type: 'spring', stiffness: 700, damping: 40 }}
              />
            )}
            <CaseDiagram
              facelets={pll.state}
              arrows={pll.arrows}
              size={44}
              emphasiseTwoSided
            />
            <span className="pll-grid__name label">{pll.name}</span>
          </button>
        )
      })}

      {typed && (
        <p className="pll-grid__typed label" role="status">
          {typed.toUpperCase()}
        </p>
      )}
    </div>
  )
}
