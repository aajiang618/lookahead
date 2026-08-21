/**
 * Cases — per-OLL progress, and everything about one case in one place.
 *
 * The list is the progress tracker: every one of the 57 cases, what state it is
 * in, how fast you read it, and how often you get it right. Picking one opens
 * the detail: the cube in that state, the scramble to set it up on a real cube,
 * which algorithm you use for it, and what to look for.
 *
 * The algorithm picker is not a preference. 28 of the 57 cases have published
 * algorithms that leave a DIFFERENT PLL, so the trainer can only be right about
 * a case if it knows which one you actually execute.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OLL_CASES, PLL_CASES, type OLLCase } from '../cube/cases.ts'
import { buildDrill, randomSeed } from '../cube/scramble.ts'
import { pieceMapOf, describePieceMap } from '../cube/tracking.ts'
import { buildRecognitionBrief, movementArrows, necessaryPieces, recognitionArrows } from '../cube/recognition.ts'
import { CubeView3D, type CubeHandle } from '../components/CubeView3D.tsx'
import { CaseDiagram } from '../components/CaseDiagram.tsx'
import { Action, Ladder } from '../components/Hud.tsx'
import { checkMastery, confusionPairs } from '../train/scheduler.ts'
import { median } from '../train/latency.ts'
import { predictItemId } from '../train/curriculum.ts'
import { daysBetween, today, type ItemProgress } from '../train/store.ts'
import type { useSession } from '../train/useSession.ts'
import { chosenAlgFor } from '../train/useSession.ts'
import './cases.css'

type Session = ReturnType<typeof useSession>

/**
 * Whether a media query currently matches.
 *
 * The list/detail split is the one layout decision here that CSS cannot make on
 * its own: at narrow widths the detail is a separate PAGE, which changes what
 * gets rendered and what the back control means, not merely how it is laid out.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    // Belt and braces: a resize listener as well, because the whole layout
    // hangs off this one boolean and a missed event would leave a phone
    // rendering the desktop split.
    window.addEventListener('resize', onChange)
    setMatches(mql.matches)
    return () => {
      mql.removeEventListener('change', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [query])
  return matches
}

interface Row {
  oll: OLLCase
  item: ItemProgress | undefined
  reps: number
  hitRate: number | null
  pace: number | null
  status: 'locked' | 'learning' | 'automatic'
}

export function Cases({
  session,
  selectedId,
  onSelect,
}: {
  session: Session
  /** The case in the URL, or null for the list on its own. */
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const { progress, threshold, settings } = session
  const [filter, setFilter] = useState<'all' | 'learning' | 'automatic' | 'locked'>('all')

  /*
   * Below this width the list and the detail are separate pages rather than two
   * panes. Sharing a phone screen gave 57 rows a 268px window with a cube
   * parked under it — you could see four cases at a time out of fifty-seven.
   */
  const narrow = useMediaQuery('(max-width: 62rem)')

  const rows: Row[] = useMemo(
    () =>
      OLL_CASES.map((oll) => {
        const item = progress.items[predictItemId(oll.id)]
        const scored = item?.recent.filter((t) => t.scored) ?? []
        const correct = scored.filter((t) => t.correct)
        return {
          oll,
          item,
          reps: item?.reps ?? 0,
          hitRate: scored.length ? correct.length / scored.length : null,
          pace: correct.length ? median(correct.slice(-8).map((t) => t.netRt)) : null,
          status:
            item?.phase === 'maintenance'
              ? 'automatic'
              : item && item.phase !== 'locked'
                ? 'learning'
                : 'locked',
        }
      }),
    [progress.items],
  )

  const shown = rows.filter((r) => filter === 'all' || r.status === filter)
  const selected = selectedId ? (rows.find((r) => r.oll.id === selectedId) ?? null) : null
  // Wide enough for both, so something is always in the detail pane.
  const detail = selected ?? (narrow ? null : rows[0])

  const counts = {
    automatic: rows.filter((r) => r.status === 'automatic').length,
    learning: rows.filter((r) => r.status === 'learning').length,
    locked: rows.filter((r) => r.status === 'locked').length,
  }

  // On a phone one of the two is on screen at a time, never both.
  const showList = !narrow || !selected
  const showDetail = Boolean(detail) && (!narrow || Boolean(selected))

  return (
    <div className="cases" data-narrow={narrow}>
      <div className="cases__list-pane" hidden={!showList}>
        <header className="cases__head">
          <div className="cases__counts">
            <Count label="Automatic" value={counts.automatic} tone="good" />
            <Count label="Learning" value={counts.learning} />
            <Count label="Not started" value={counts.locked} />
          </div>
          <div className="cases__filter" role="tablist" aria-label="Filter cases">
            {(['all', 'learning', 'automatic', 'locked'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className="cases__filter-item label"
                data-active={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === 'locked' ? 'Not started' : f}
              </button>
            ))}
          </div>
        </header>

        <ul className="cases__list">
          {shown.map((row) => (
            <li key={row.oll.id}>
              <button
                type="button"
                className="case-row"
                data-status={row.status}
                data-selected={row.oll.id === selectedId}
                onClick={() => onSelect(row.oll.id)}
              >
                <CaseDiagram facelets={row.oll.state} mode="orientation" size={38} />
                <span className="case-row__name">
                  {row.oll.name}
                  <i className="case-row__group">{row.oll.group}</i>
                </span>
                <span className="case-row__pace readout">
                  {row.pace ? `${row.pace.toFixed(2)}s` : '—'}
                </span>
                <span className="case-row__reps readout">
                  {row.reps > 0 ? `${row.reps} rep${row.reps === 1 ? '' : 's'}` : ''}
                </span>
                <span className="case-row__hit readout">
                  {row.hitRate === null ? '' : `${Math.round(row.hitRate * 100)}%`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {showDetail && detail && (
        <CaseDetail
          row={detail}
          session={session}
          threshold={threshold}
          settings={settings}
          onBack={narrow ? () => onSelect(null) : null}
        />
      )}
    </div>
  )
}

function Count({ label, value, tone }: { label: string; value: number; tone?: 'good' }) {
  return (
    <div className="cases__count" data-tone={tone}>
      <span className="label">{label}</span>
      <b className="readout">{value}</b>
    </div>
  )
}

// ---------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------

function CaseDetail({
  row,
  session,
  threshold,
  settings,
  onBack,
}: {
  row: Row
  session: Session
  threshold: number
  settings: Session['settings']
  /** Set when the detail is its own page and needs a way back to the list. */
  onBack: (() => void) | null
}) {
  const cubeRef = useRef<CubeHandle>(null)
  const { oll, item } = row
  const [seed, setSeed] = useState(() => randomSeed())
  const [showAllArrows, setShowAllArrows] = useState(false)
  const [copied, setCopied] = useState(false)

  const algIndex = settings.algChoice[oll.id] ?? 0
  const alg = chosenAlgFor(oll, settings.algChoice)

  // A concrete instance of the case, so the scramble is real and settable.
  const pll = useMemo(() => PLL_CASES[seed % PLL_CASES.length], [seed])
  const drill = useMemo(() => buildDrill(oll, pll, seed, { ollAlg: alg }), [oll, pll, seed, alg])

  const map = useMemo(() => pieceMapOf(alg), [alg])
  const arrows = useMemo(
    () => (showAllArrows ? movementArrows(map, necessaryPieces(oll, alg), true) : recognitionArrows(map)),
    [map, oll, alg, showAllArrows],
  )
  const brief = useMemo(() => buildRecognitionBrief(oll, alg), [oll, alg])

  const variantsDiffer = useMemo(() => {
    const first = pieceMapOf(oll.algs[0].alg)
    return oll.algs.some((v) => {
      const m = pieceMapOf(v.alg)
      return m.corners.join() !== first.corners.join() || m.edges.join() !== first.edges.join()
    })
  }, [oll])

  useEffect(() => {
    cubeRef.current?.set(drill.state)
  }, [drill])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(drill.scramble)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [drill.scramble])

  const mastery = item ? checkMastery(item, threshold) : null
  const confusions = item ? confusionPairs(item).slice(0, 2) : []
  const dueIn = item?.due && item.phase === 'maintenance' ? daysBetween(today(), item.due) : null

  return (
    <div className="case-detail">
      {onBack && (
        <button type="button" className="case-detail__back label" onClick={onBack}>
          <span aria-hidden="true">←</span> All cases
        </button>
      )}
      <div className="case-detail__cube">
        <CubeView3D
          ref={cubeRef}
          facelets={drill.state}
          arrows={arrows}
          viewTurns={drill.viewTurns}
          zoom={settings.cubeZoom}
          className="case-detail__canvas"
        />
      </div>

      <div className="case-detail__body">
        <header className="case-detail__head">
          <h2 className="case-detail__name">{oll.name}</h2>
          <span className="case-detail__group label">{oll.group}</span>
          <span className="case-detail__status label" data-status={row.status}>
            {row.status === 'automatic'
              ? `Automatic${dueIn !== null ? ` · due in ${Math.max(dueIn, 0)}d` : ''}`
              : row.status === 'learning'
                ? 'Learning'
                : 'Not started'}
          </span>
        </header>

        <dl className="case-detail__stats">
          <Stat label="Recognition" value={row.pace ? `${row.pace.toFixed(2)}s` : '—'} />
          <Stat label="Reps" value={String(row.reps)} />
          <Stat label="Hit rate" value={row.hitRate === null ? '—' : `${Math.round(row.hitRate * 100)}%`} />
          <Stat label="Streak" value={String(item?.streak ?? 0)} />
        </dl>

        {mastery && row.status === 'learning' && (
          <div className="case-detail__mastery">
            <Ladder value={mastery.progress} label="Progress to automatic" />
            {mastery.missing.length > 0 && (
              <p className="case-detail__note">Needs {mastery.missing[0]}.</p>
            )}
          </div>
        )}

        {confusions.length > 0 && (
          <p className="case-detail__note">
            Most often misread as{' '}
            {confusions
              .map((c) => `${PLL_CASES.find((p) => p.id === c.id)?.name ?? c.id} (${c.count}x)`)
              .join(', ')}
            .
          </p>
        )}

        <section className="case-detail__block">
          <span className="label">Your algorithm</span>
          <select
            value={algIndex}
            onChange={(e) =>
              session.updateSettings({
                algChoice: { ...settings.algChoice, [oll.id]: Number(e.target.value) },
              })
            }
          >
            {/*
              Index 0 is the algorithm the dataset lists first — the common one
              — and it is what the trainer uses until you say otherwise. A
              choice made here is kept for that case from then on.
            */}
            {oll.algs.map((variant, i) => (
              <option key={variant.alg} value={i}>
                {variant.alg}
                {i === 0 ? '  · most common' : ''}
              </option>
            ))}
          </select>
          <p className="case-detail__note">
            {algIndex === 0
              ? 'The common algorithm, used unless you pick another.'
              : 'Your choice — kept for this case, and drilled against.'}
          </p>
          {variantsDiffer && (
            <p className="case-detail__warning">
              These algorithms do not all leave the same PLL. Pick the one you actually
              execute — the trainer is only right about this case for that one.
            </p>
          )}
          {oll.algs[algIndex]?.note && (
            <p className="case-detail__note">{oll.algs[algIndex].note}</p>
          )}
        </section>

        <section className="case-detail__block">
          <span className="label">Scramble from solved</span>
          <p className="case-detail__scramble mono">{drill.scramble}</p>
          <div className="case-detail__actions">
            <Action onClick={() => setSeed(randomSeed())}>New</Action>
            <Action onClick={copy}>{copied ? 'Copied' : 'Copy'}</Action>
            <button
              type="button"
              className="case-detail__toggle label"
              data-on={showAllArrows}
              onClick={() => setShowAllArrows((v) => !v)}
            >
              {showAllArrows ? 'All arrows' : 'Key arrows'}
            </button>
          </div>
        </section>

        <section className="case-detail__block">
          <span className="label">What to look for</span>
          <p className="case-detail__note">{describePieceMap(map)}</p>
          <ol className="case-detail__tips">
            {brief.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="case-detail__stat">
      <dt className="label">{label}</dt>
      <dd className="readout">{value}</dd>
    </div>
  )
}
