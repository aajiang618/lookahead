/**
 * Persistent progress. Everything lives in the browser: no accounts, no
 * server, works offline. `exportProgress` / `importProgress` are the escape
 * hatch so a solver is never locked in.
 */

import { DEFAULT_MOTOR_SECONDS } from './latency.ts'

export const STORAGE_KEY = 'lookahead.progress.v1'
export const SCHEMA_VERSION = 1

export type ItemPhase = 'locked' | 'introducing' | 'building' | 'maintenance'
export type LeechKind = 'none' | 'accuracy' | 'fluency'

export interface TrialRecord {
  /** Milliseconds since epoch. */
  at: number
  sessionId: string
  correct: boolean
  /** Motor-adjusted response time in seconds. */
  netRt: number
  grade: 1 | 2 | 3 | 4
  /** What the solver answered, when wrong — drives confusion-pair diagnosis. */
  answered?: string
  /** Camera angle the drill was shown at, 0–3. */
  viewTurns: number
  /** Which PLL the drill actually resolved to. */
  pllId: string
  /**
   * False for the handful of encoding trials that introduce a case. Those
   * build the representation rather than testing it, so they are shown and
   * recorded but never fed to the schedulers or the solver's baseline.
   */
  scored: boolean
  /** How many hint rungs were taken on this rep, 0 for a clean one. */
  hints?: number
}

export interface ItemProgress {
  id: string
  phase: ItemPhase
  /** FSRS memory state. Null until the first graded review. */
  stability: number | null
  difficulty: number | null
  /** ISO date (yyyy-mm-dd) this case is next due. */
  due: string | null
  /** Last day this case received a rolled-up FSRS review. */
  lastReviewDay: string | null
  /**
   * Timestamp of the newest trial already folded into FSRS. Matching on this
   * rather than on a calendar-day string keeps the roll-up correct across
   * midnight, time-zone changes, and replayed history.
   */
  lastRollUpAt: number
  reps: number
  lapses: number
  /** Encoding trials completed. Caps out at ENCODE_TRIALS. */
  encodes: number
  /** Consecutive correct answers meeting the mastery pace. */
  streak: number
  /**
   * Distinct sessions in which this case was answered correctly at pace. A case
   * cannot be mastered in one sitting however long that sitting runs, which is
   * what makes daily practice structurally necessary rather than merely advised.
   */
  paceSessions: string[]
  /** Most recent trials, newest last. Capped — this is not an audit log. */
  recent: TrialRecord[]
  /** Distinct session ids the recent trials span. */
  sessionsSeen: string[]
  leech: LeechKind
  introducedAt: number | null
  masteredAt: number | null
  /** Sticky: true once this case has ever been mastered, never cleared. */
  everMastered: boolean
  /**
   * The pace bar in force when this case was mastered. Frozen deliberately: the
   * live threshold tracks the solver's own p25 and so keeps tightening as they
   * improve, and judging retired cases against a moving bar would un-master
   * them for the crime of the solver getting better everywhere else.
   */
  masteredThreshold: number | null
  /** Solver parked this case deliberately. */
  parked: boolean
}

export interface Settings {
  /** Target session length in seconds. */
  sessionSeconds: number
  answerMode: 'grid' | 'reveal'
  varyAngle: boolean
  varyAuf: boolean
  reduceMotion: boolean
  showFeatureOverlay: boolean
  /** Measured cost of physically committing an answer, in seconds. */
  motorSeconds: number
  motorCalibrated: boolean
  /**
   * Which published algorithm the solver uses for each OLL, as an index into
   * that case's variant list. Load-bearing rather than a preference: 28 of the
   * 57 cases have variants that leave a different PLL, so the prediction being
   * trained is only correct for the algorithm actually being executed.
   */
  algChoice: Record<string, number>
  /** How much of the frame the cube fills. 1 exactly fits; higher is closer. */
  cubeZoom: number
  /** Drill prediction from part-way through the algorithm, as a move count. */
  headStart: number
  /**
   * Reps of one OLL before moving to the next. A session runs as a sequence of
   * exercises, one case each. Set to 1 to interleave every rep instead, which
   * is harder and, on the perceptual-learning evidence, retains better.
   */
  repsPerExercise: number
  /**
   * Draw the recognition arrows on the cube. An opt-in aid, off by default so
   * an unaided rep is the norm. They show the ALGORITHM's fixed permutation,
   * not the answer, so leaving them on while you think is training wheels
   * rather than cheating.
   */
  showArrows: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  sessionSeconds: 300,
  answerMode: 'reveal',
  varyAngle: true,
  varyAuf: true,
  reduceMotion: false,
  showFeatureOverlay: true,
  motorSeconds: DEFAULT_MOTOR_SECONDS,
  motorCalibrated: false,
  algChoice: {},
  cubeZoom: 1.05,
  headStart: 0,
  repsPerExercise: 4,
  showArrows: false,
}

export interface SessionSummary {
  id: string
  /** ISO date, yyyy-mm-dd. */
  day: string
  startedAt: number
  endedAt: number
  trials: number
  correct: number
  medianNetRt: number
  introduced: string[]
  mastered: string[]
  /** Why the session ended. */
  stopReason: string
}

export interface Progress {
  version: number
  createdAt: number
  settings: Settings
  items: Record<string, ItemProgress>
  /** Rolling window of log response times across all correct trials. */
  logRtWindow: number[]
  sessions: SessionSummary[]
  /** yyyy-mm-dd -> cases introduced that day, for the daily new cap. */
  newByDay: Record<string, string[]>
  /** Consecutive days trained, and the last day counted. */
  streakDays: number
  lastTrainedDay: string | null
}

export const RECENT_TRIAL_CAP = 24
export const LOG_RT_WINDOW_CAP = 400
export const SESSION_HISTORY_CAP = 180

export function today(now: Date = new Date()): string {
  // Local calendar day, not UTC: a session at 11pm belongs to that evening.
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return today(date)
}

export function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split('-').map(Number)
  const [by, bm, bd] = to.split('-').map(Number)
  const a = Date.UTC(ay, am - 1, ad)
  const b = Date.UTC(by, bm - 1, bd)
  return Math.round((b - a) / 86400000)
}

export function newItem(id: string): ItemProgress {
  return {
    id,
    phase: 'locked',
    stability: null,
    difficulty: null,
    due: null,
    lastReviewDay: null,
    lastRollUpAt: 0,
    reps: 0,
    lapses: 0,
    encodes: 0,
    streak: 0,
    paceSessions: [],
    recent: [],
    sessionsSeen: [],
    leech: 'none',
    introducedAt: null,
    masteredAt: null,
    everMastered: false,
    masteredThreshold: null,
    parked: false,
  }
}

export function emptyProgress(): Progress {
  return {
    version: SCHEMA_VERSION,
    createdAt: Date.now(),
    settings: { ...DEFAULT_SETTINGS },
    items: {},
    logRtWindow: [],
    sessions: [],
    newByDay: {},
    streakDays: 0,
    lastTrainedDay: null,
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function safeStorage(): Storage | null {
  try {
    const probe = '__lookahead_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    // Private browsing, disabled storage, or a sandboxed frame. The app still
    // works for the length of the session; only persistence is lost.
    return null
  }
}

export function loadProgress(): Progress {
  const storage = safeStorage()
  if (!storage) return emptyProgress()
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return emptyProgress()
  try {
    return migrate(JSON.parse(raw) as Progress)
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(progress: Progress): void {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Quota exceeded. Shed history rather than losing scheduling state.
    const trimmed: Progress = {
      ...progress,
      sessions: progress.sessions.slice(-30),
      logRtWindow: progress.logRtWindow.slice(-100),
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
      /* Give up quietly; the session continues in memory. */
    }
  }
}

function migrate(progress: Progress): Progress {
  const base = emptyProgress()
  return {
    ...base,
    ...progress,
    version: SCHEMA_VERSION,
    settings: { ...base.settings, ...progress.settings, algChoice: progress.settings?.algChoice ?? {} },
    items: progress.items ?? {},
    logRtWindow: progress.logRtWindow ?? [],
    sessions: progress.sessions ?? [],
    newByDay: progress.newByDay ?? {},
  }
}

export function exportProgress(progress: Progress): string {
  return JSON.stringify(progress, null, 2)
}

export function importProgress(json: string): Progress {
  const parsed = JSON.parse(json) as Progress
  if (typeof parsed !== 'object' || parsed === null || !('items' in parsed)) {
    throw new Error('That file does not look like a Lookahead export.')
  }
  return migrate(parsed)
}
