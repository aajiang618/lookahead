/**
 * Head-up display chrome.
 *
 * The instrument vocabulary the whole interface is built from. Everything here
 * is drawn in stroke — no filled panels, no shadows, no rounded chrome. What
 * bounds a region is a hairline and a pair of corner marks.
 *
 * Motion has three verbs, borrowed from real symbology:
 *   slew    — a value moves to its new position with a damped settle
 *   capture — a mode engages with a discrete snap, never a fade
 *   roll    — numerals travel vertically to their new reading
 */

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import './hud.css'

// ---------------------------------------------------------------------------
// Mode annunciator — the top strip
// ---------------------------------------------------------------------------

export interface ModeStripItem {
  id: string
  label: string
  hint?: string
}

export function ModeStrip({
  items,
  active,
  onSelect,
}: {
  items: ModeStripItem[]
  active: string
  onSelect: (id: string) => void
}) {
  return (
    <nav className="fma" aria-label="Trainer modes">
      {items.map((item) => {
        const isActive = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            className="fma__item"
            data-active={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            {/* The active mode is boxed, the way an engaged flight mode is. */}
            {isActive && (
              <motion.span
                layoutId="fma-box"
                className="fma__box"
                transition={{ type: 'spring', stiffness: 620, damping: 44 }}
              />
            )}
            <span className="fma__label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Tapes — the flanking readouts
// ---------------------------------------------------------------------------

export interface TapeProps {
  label: string
  /** Current reading. */
  value: number
  /** Formatted for display; defaults to a rounded number. */
  display?: string
  unit?: string
  min: number
  max: number
  /** Optional target marker — the bug, in instrument terms. */
  target?: number
  targetLabel?: string
  /** Which side of the viewport this tape sits on. */
  side: 'left' | 'right'
  /** Lower readings are better (latency) or worse (repertoire). */
  polarity?: 'lower-better' | 'higher-better'
}

/**
 * A vertical tape: ticks, a moving pointer, and the current reading boxed at
 * the pointer. This is the natural home for the two numbers that actually
 * matter here — how fast recognition is, and how much of the repertoire is
 * automatic.
 */
export function Tape({
  label,
  value,
  display,
  unit,
  min,
  max,
  target,
  targetLabel,
  side,
  polarity = 'higher-better',
}: TapeProps) {
  const reduced = useReducedMotion()
  const clamp = (v: number) => Math.min(1, Math.max(0, (v - min) / (max - min || 1)))
  const position = clamp(value)
  // Tapes read bottom-up, so a fraction of 0 sits at the bottom.
  const bottomPercent = position * 100
  const targetPercent = target === undefined ? null : clamp(target) * 100

  const ticks = Array.from({ length: 11 }, (_, i) => i / 10)

  return (
    <div className="tape" data-side={side}>
      <div className="tape__label label">{label}</div>
      <div className="tape__body">
        <div className="tape__rail" aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t}
              className="tape__tick"
              data-major={Math.round(t * 10) % 5 === 0}
              style={{ bottom: `${t * 100}%` }}
            />
          ))}
        </div>

        {targetPercent !== null && (
          <div className="tape__bug" style={{ bottom: `${targetPercent}%` }} title={targetLabel}>
            <span className="tape__bug-mark" aria-hidden="true" />
          </div>
        )}

        <motion.div
          className="tape__pointer"
          data-polarity={polarity}
          initial={false}
          animate={{ bottom: `${bottomPercent}%` }}
          transition={
            reduced ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 30, mass: 0.7 }
          }
        >
          <span className="tape__caret" aria-hidden="true" />
          <span className="tape__reading readout">
            {display ?? Math.round(value)}
            {unit && <i className="tape__unit">{unit}</i>}
          </span>
        </motion.div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reticle — the bracket around the target
// ---------------------------------------------------------------------------

export type ReticleState = 'searching' | 'locked' | 'missed'

/**
 * Four corner brackets around the cube. They sit wide while the answer is
 * still open, snap inward on a correct answer, and break outward on a miss.
 * This is the interface's single strongest signal, and it is carried by
 * position rather than colour, so it survives a colour-blind reading.
 */
export function Reticle({ state, children }: { state: ReticleState; children: ReactNode }) {
  const reduced = useReducedMotion()
  const inset = state === 'locked' ? 8 : state === 'missed' ? -10 : 0
  const spring = reduced
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 700, damping: state === 'missed' ? 14 : 38 }

  return (
    <div className="reticle" data-state={state}>
      {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
        <motion.span
          key={corner}
          className="reticle__corner"
          data-corner={corner}
          initial={false}
          animate={{
            x: corner.includes('l') ? inset : -inset,
            y: corner.startsWith('t') ? inset : -inset,
          }}
          transition={spring}
          aria-hidden="true"
        />
      ))}
      <div className="reticle__inner">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

/** A hairline-ruled block with corner registration marks. */
export function Panel({
  label,
  children,
  className = '',
  as: Tag = 'section',
}: {
  label?: string
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'aside'
}) {
  return (
    <Tag className={`panel registered ${className}`}>
      {label && <h2 className="panel__label label">{label}</h2>}
      {children}
    </Tag>
  )
}

/** A labelled figure, the way a HUD stacks a caption over a number. */
export function Readout({
  label,
  value,
  unit,
  tone = 'normal',
}: {
  label: string
  value: string
  unit?: string
  tone?: 'normal' | 'caution' | 'warning' | 'dim'
}) {
  return (
    <div className="readout-block" data-tone={tone}>
      <span className="readout-block__label label">{label}</span>
      <span className="readout-block__value readout">
        {value}
        {unit && value !== '—' && <i className="readout-block__unit">{unit}</i>}
      </span>
    </div>
  )
}

/** The single-line status message under the reticle. */
export function Annunciation({
  tone = 'normal',
  children,
}: {
  tone?: 'normal' | 'caution' | 'warning'
  children: ReactNode
}) {
  return (
    <p className="annunciation label" data-tone={tone} role="status">
      {children}
    </p>
  )
}

/** A stroke-drawn action. There is exactly one filled control in the app. */
export function Action({
  children,
  onClick,
  variant = 'outline',
  disabled,
  type = 'button',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'outline' | 'primary' | 'quiet'
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
}) {
  return (
    <button
      type={type}
      className="action label"
      data-variant={variant}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  )
}

/** A horizontal progress bar drawn as a ladder rung. */
export function Ladder({ value, label }: { value: number; label?: string }) {
  const reduced = useReducedMotion()
  return (
    <div className="ladder" title={label}>
      <motion.span
        className="ladder__fill"
        initial={false}
        animate={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 30 }}
      />
    </div>
  )
}
