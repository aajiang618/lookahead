/**
 * The order the 57 OLL cases are introduced in.
 *
 * One skill only: the OLL is still pending, and you name the PLL that will be
 * there once you execute it. Ordered by how hard the algorithm is to track
 * pieces through — fewest moving pieces and shortest algorithms first, the dot
 * cases last.
 */

import { OLL_CASES, PLL_CASES, type OLLCase } from '../cube/cases.ts'
import { parseAlg } from '../cube/engine.ts'
import type { Progress } from './store.ts'

export const PREDICT_PREFIX = 'predict:'

export function predictItemId(ollId: string): string {
  return `${PREDICT_PREFIX}${ollId}`
}

/** The OLL case an item id refers to. */
export function caseIdOf(itemId: string): string {
  return itemId.startsWith(PREDICT_PREFIX) ? itemId.slice(PREDICT_PREFIX.length) : itemId
}

/**
 * How hard it is to track pieces through the algorithm, roughly ascending.
 * Cases whose corners are already oriented move the fewest pieces and have the
 * shortest algorithms; dot cases move everything and have the longest.
 */
const OLL_GROUP_RANK: Record<string, number> = {
  'Corners oriented': 0,
  'Edges oriented': 1,
  'T shape': 2,
  Square: 3,
  'C shape': 4,
  'W shape': 5,
  'P shape': 6,
  Fish: 7,
  'L shape': 8,
  Line: 9,
  Lightning: 10,
  Knight: 11,
  Awkward: 12,
  Dot: 13,
}

function algLength(oll: OLLCase): number {
  try {
    return parseAlg(oll.alg).length
  } catch {
    return 99
  }
}

/** Within a group, shorter algorithms come first — less to track. */
export const OLL_UNLOCK_ORDER: string[] = [...OLL_CASES]
  .sort((a, b) => {
    const rank = (OLL_GROUP_RANK[a.group] ?? 99) - (OLL_GROUP_RANK[b.group] ?? 99)
    if (rank !== 0) return rank
    const len = algLength(a) - algLength(b)
    if (len !== 0) return len
    return a.number - b.number
  })
  .map((c) => c.id)

// ---------------------------------------------------------------------------
// Seeding and candidate selection
// ---------------------------------------------------------------------------

/** Every item the app could ever schedule, in unlock order. */
export function allItemIds(): string[] {
  return OLL_UNLOCK_ORDER.map(predictItemId)
}

export interface CandidateResult {
  ids: string[]
  /** Empty when a candidate exists; otherwise why nothing can unlock. */
  blockedBy: string
}

/**
 * The next OLL case to introduce.
 *
 * There is one track. This trainer does one thing: read the PLL out of an
 * unfinished OLL. Plain PLL recognition from a solved top used to be a second,
 * optional track; it was removed because it is a different skill with its own
 * tools, and carrying it made every screen answer two questions at once.
 */
export function nextUnlockCandidates(progress: Progress): CandidateResult {
  const next = OLL_UNLOCK_ORDER.map(predictItemId).find((id) => {
    const item = progress.items[id]
    return item === undefined || item.phase === 'locked'
  })
  return next ? { ids: [next], blockedBy: '' } : { ids: [], blockedBy: 'Every case is in play' }
}

/**
 * Up to `count` not-yet-started items from the front of the unlock order,
 * used only to seed an empty profile.
 */
export function nextGroupIds(progress: Progress, count: number): string[] {
  const order = OLL_UNLOCK_ORDER.map(predictItemId)
  const out: string[] = []
  for (const id of order) {
    const existing = progress.items[id]
    if (!existing || existing.phase === 'locked') out.push(id)
    if (out.length >= count) break
  }
  return out
}

/** Human-facing label for an item id. */
export function itemLabel(id: string): string {
  return OLL_CASES.find((c) => c.id === caseIdOf(id))?.name ?? id
}

export function itemGroup(id: string): string {
  return OLL_CASES.find((c) => c.id === caseIdOf(id))?.group ?? ''
}

/**
 * Distractors for a forced-choice answer. Drawn from the same recognition
 * bucket as the target wherever possible: choosing between cases that look
 * alike is what builds the discrimination, whereas random distractors let a
 * rough gestalt guess succeed.
 */
export function distractorsFor(targetPllId: string, count: number, rng: () => number): string[] {
  const target = PLL_CASES.find((c) => c.id === targetPllId)
  if (!target) return []

  const sameBucket = PLL_CASES.filter(
    (c) => c.id !== target.id && c.recognition.faces.F === target.recognition.faces.F,
  )
  const rest = PLL_CASES.filter(
    (c) => c.id !== target.id && c.recognition.faces.F !== target.recognition.faces.F,
  )

  const shuffle = <T,>(list: T[]): T[] => {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  return [...shuffle(sameBucket), ...shuffle(rest)].slice(0, count).map((c) => c.id)
}
