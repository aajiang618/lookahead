/**
 * What an item is, and what to call it.
 *
 * This file used to hold a curriculum: all 57 OLL cases in a fixed unlock
 * order, ranked by how hard the algorithm is to track pieces through, with the
 * dot cases last. It decided what you were allowed to meet and when.
 *
 * There is no unlock order any more, because there is no unlocking — you choose
 * the cases. What is left is the naming: an item is one OLL's prediction, and
 * these are the two functions that convert between the two ids plus the labels
 * the interface prints. Small enough to question whether it deserves a file,
 * and kept as one because every other module imports it.
 */

import { OLL_CASES } from '../cube/cases.ts'

export const PREDICT_PREFIX = 'predict:'

export function predictItemId(ollId: string): string {
  return `${PREDICT_PREFIX}${ollId}`
}

/** The OLL case an item id refers to. */
export function caseIdOf(itemId: string): string {
  return itemId.startsWith(PREDICT_PREFIX) ? itemId.slice(PREDICT_PREFIX.length) : itemId
}

/** Human-facing label for an item id. */
export function itemLabel(id: string): string {
  return OLL_CASES.find((c) => c.id === caseIdOf(id))?.name ?? id
}

export function itemGroup(id: string): string {
  return OLL_CASES.find((c) => c.id === caseIdOf(id))?.group ?? ''
}

/**
 * The shape families, in the order a solver would page through them.
 *
 * The selection screen groups by these because it is how cubers already talk
 * about the set — "the dot cases", "the fish" — which makes selecting a
 * meaningful batch one press instead of six.
 */
export const OLL_GROUPS: string[] = [...new Set(OLL_CASES.map((c) => c.group))].sort((a, b) => {
  const rank = (g: string) => (g === 'Corners oriented' ? 0 : g === 'Edges oriented' ? 1 : g === 'Dot' ? 99 : 50)
  const byRank = rank(a) - rank(b)
  return byRank !== 0 ? byRank : a.localeCompare(b)
})
