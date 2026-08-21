/**
 * The interface vocabulary — what little of it there is.
 *
 * Five parts: the mode tabs, a rounded surface, a figure, an action, and a
 * progress rung. Everything is soft-cornered and unbordered; grouping is done
 * with a barely-there surface rather than a line, and most regions are grouped
 * by nothing at all.
 *
 * The vertical tapes and the reticle that used to live here are gone. They were
 * the most instrument-like things in the app and the drill had already stopped
 * using them.
 */

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import './hud.css'

// ---------------------------------------------------------------------------
// Mode annunciator — the top strip
// ---------------------------------------------------------------------------

export interface ModeStripItem {
  id: string
  /** Spoken, not shown: the bar is icons only. */
  label: string
  icon: ReactNode
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
            aria-label={item.label}
            title={item.label}
            onClick={() => onSelect(item.id)}
          >
            {isActive && (
              <motion.span
                layoutId="fma-box"
                className="fma__box"
                transition={{ type: 'spring', stiffness: 620, damping: 44 }}
              />
            )}
            <span className="fma__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="visually-hidden">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

/** A rounded surface. Used only where content genuinely needs grouping. */
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
    <Tag className={`panel ${className}`}>
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

/** A single-line status message. */
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

/** There is exactly one filled control in the app, and it is amber. */
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

/** A horizontal progress bar. */
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
