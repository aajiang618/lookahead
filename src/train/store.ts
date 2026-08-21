/**
 * Persistent progress. Everything lives in the browser: no accounts, no
 * server, works offline. `exportProgress` / `importProgress` are the escape
 * hatch so a solver is never locked in.
 */

import { DEFAULT_MOTOR_SECONDS } from './latency.ts'

export const STORAGE_KEY = 'lookahead.progress.v1'
/**
 * Bumping this resets learning state on load, keeping settings. Done three
 * times now: version 2 for the colour reading, version 3 for pattern-first
 * teaching with multiple choice throughout, version 4 for the camera fix.
 *
 * Version 5 is the largest of them. The app no longer decides what you train —
 * you pick the OLLs — so the phases, streaks and due dates earned under a
 * curriculum that unlocked cases on your behalf describe a schedule that no
 * longer exists. Carrying them forward would show cases as automatic on the
 * strength of reps the new model never counted the same way.
 */
export const SCHEMA_VERSION = 5

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
  /**
   * Every PLL this OLL has actually left you, by id.
   *
   * The unit of recognition here is the SEAM — one OLL leaving one PLL — not
   * the OLL on its own. There are 1,197 of them and each is its own thing to
   * recognise, so "I have trained OLL 21" says much less than it sounds like:
   * you may have met four of its twenty-one outcomes. This is what makes a rep
   * honestly new, and what the drill prefers when choosing what to show.
   */
  seenPlls: string[]
  /** When this case was last put in front of the solver. */
  lastSeenAt: number | null
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
  /**
   * Rotate the camera between reps.
   *
   * Off, and it should stay off. Fourteen of the 57 OLL top shapes repeat under
   * a whole-cube rotation, so a rotated view of one of those is genuinely
   * ambiguous: the solver aligns to the shape, executes in a frame the drill
   * did not intend, and gets a different PLL from the one the app is grading.
   * Measured — with the camera straight, 0 of 1,197 drills disagree.
   */
  varyAngle: boolean
  varyAuf: boolean
  reduceMotion: boolean
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
  /**
   * How much of the frame the cube fills. 1 exactly fits its silhouette; higher
   * is closer. The default sits below 1 deliberately: a cube that touches the
   * edges of its frame is harder to read than one with air around it, and the
   * last layer is read at a glance rather than inspected.
   */
  /**
   * Which OLLs you are training, by case id. This is the whole plan now: there
   * is no schedule choosing for you, so an empty selection means the drill has
   * nothing to draw on rather than "everything".
   */
  trainCases: string[]
  /**
   * Show the scramble alone, full screen, and start the clock only when you tap.
   *
   * For training with a real cube in hand. Setting a case up physically is not
   * recognition and must not be timed as though it were — but it is a tap per
   * rep, so it is off unless you are actually holding a cube.
   */
  setupFirst: boolean
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
  varyAngle: false,
  varyAuf: true,
  reduceMotion: false,
  motorSeconds: DEFAULT_MOTOR_SECONDS,
  motorCalibrated: false,
  algChoice: {},
  trainCases: [],
  setupFirst: false,
  cubeZoom: 0.7,
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
    seenPlls: [],
    lastSeenAt: null,
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

/**
 * The cube used to be framed tight. Anyone still sitting on a default they
 * never chose gets the current framing; a zoom set by hand is left alone.
 */
const PREVIOUS_DEFAULT_ZOOMS = [1.05, 0.82]

/** Settings that no longer exist, so an old profile cannot smuggle them back. */
interface LegacySettings {
  /** The old timed test's case selection — the ancestor of `trainCases`. */
  testCases?: string[]
  answerMode?: string
}

function migrate(progress: Progress): Progress {
  const base = emptyProgress()
  const stored = (progress.settings ?? {}) as Partial<Settings> & LegacySettings
  const settings: Settings = {
    ...base.settings,
    ...(stored as Partial<Settings>),
    algChoice: stored.algChoice ?? {},
    /*
     * The timed test's picker is the direct ancestor of the training selection,
     * so a solver who had chosen a set keeps it rather than arriving at an empty
     * screen wondering where their cases went.
     *
     * Length rather than `??`, because the value being migrated from is very
     * often an empty array rather than a missing key — nullish coalescing sees
     * `[]` as a real answer and would drop the selection on exactly the
     * profiles this clause exists to rescue.
     */
    trainCases: stored.trainCases?.length ? stored.trainCases : (stored.testCases ?? []),
  }
  // Fields that no longer exist must not survive a spread from an old profile.
  delete (settings as Partial<LegacySettings>).testCases
  delete (settings as Partial<LegacySettings>).answerMode

  if (PREVIOUS_DEFAULT_ZOOMS.includes(settings.cubeZoom)) settings.cubeZoom = base.settings.cubeZoom
  if ((progress.version ?? 1) < SCHEMA_VERSION) {
    // A superseded default is not a preference — the trap that has bitten this
    // migration three times. It was the old default and it makes some drills
    // genuinely ambiguous, so it resets whatever the old profile said.
    settings.varyAngle = base.settings.varyAngle
    return { ...base, settings }
  }
  return {
    ...base,
    ...progress,
    version: SCHEMA_VERSION,
    settings,
    // Items predate `seenPlls`, and an item missing it would crash the seam
    // check on the very first rep.
    items: Object.fromEntries(
      Object.entries(progress.items ?? {}).map(([id, item]) => [
        id,
        { ...newItem(id), ...item, seenPlls: item.seenPlls ?? [], lastSeenAt: item.lastSeenAt ?? null },
      ]),
    ),
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
