/**
 * The Codex pet sprite contract, shared by the Host (validation) and the
 * Client (playback). Values are copied from the Codex pet atlas: 8 columns,
 * 192x208 cells, rows in this fixed order, and per-row frame durations.
 *
 *   https://github.com/openai/codex  tui/src/pets/*
 *
 * v1 sheets have 9 rows (1536x1872); v2 sheets add two look-direction rows
 * and have 11 rows (1536x2288).
 */

export const CELL_WIDTH = 192
export const CELL_HEIGHT = 208
export const COLUMNS = 8
export const V1_ROWS = 9
export const V2_ROWS = 11
export const V1_HEIGHT = CELL_HEIGHT * V1_ROWS
export const V2_HEIGHT = CELL_HEIGHT * V2_ROWS
export const ATLAS_WIDTH = CELL_WIDTH * COLUMNS

/** Rows every sheet must carry, in order. */
export const STATES = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
] as const
export type PetState = typeof STATES[number]

export const LOOK_ROW_A = 9
export const LOOK_ROW_B = 10
/** 16 clockwise look directions, 22.5 degrees apart; 000 looks up. */
export const LOOK_STEP_DEGREES = 22.5
export const LOOK_DIRECTIONS = 16

/** The row each state occupies in the atlas. */
export const IDLE_ROW: Record<PetState, number> = {
  idle: 0,
  'running-right': 1,
  'running-left': 2,
  waving: 3,
  jumping: 4,
  failed: 5,
  waiting: 6,
  running: 7,
  review: 8,
}

/** How many cells of each row the contract defines; the rest stay transparent. */
export const USED_COLUMNS: Record<PetState, number> = {
  idle: 6,
  'running-right': 8,
  'running-left': 8,
  waving: 4,
  jumping: 5,
  failed: 8,
  waiting: 6,
  running: 6,
  review: 6,
}

/** One played frame: which cell, and how long it stays. */
export interface Frame {
  row: number
  column: number
  durationMs: number
}

const row = (rowIndex: number, count: number, durationMs: number, lastMs: number): Frame[] =>
  Array.from({ length: count }, (_, column) => ({ row: rowIndex, column, durationMs: column === count - 1 ? lastMs : durationMs }))


const IDLE: Frame[] = [
  { row: 0, column: 0, durationMs: 280 },
  { row: 0, column: 1, durationMs: 110 },
  { row: 0, column: 2, durationMs: 110 },
  { row: 0, column: 3, durationMs: 140 },
  { row: 0, column: 4, durationMs: 140 },
  { row: 0, column: 5, durationMs: 320 },
]

/** Idle runs six times slower so the resting loop stays calm. */
const IDLE_SLOW: Frame[] = IDLE.map(frame => ({ ...frame, durationMs: frame.durationMs * 6 }))

export const STATE_FRAMES: Record<PetState, Frame[]> = {
  idle: IDLE,
  'running-right': row(1, 8, 120, 220),
  'running-left': row(2, 8, 120, 220),
  waving: row(3, 4, 140, 280),
  jumping: row(4, 5, 140, 280),
  failed: row(5, 8, 140, 240),
  waiting: row(6, 6, 150, 260),
  running: row(7, 6, 120, 220),
  review: row(8, 6, 150, 280),
}

export interface Playback {
  frames: Frame[]
  /** Index to resume from after the last frame, or null to stop on it. */
  loopStart: number | null
}

/**
 * Resolve one state into its playback plan, exactly as Codex does:
 * - reduced motion shows the state's first frame only;
 * - idle always loops its slowed frames;
 * - an explicit loop repeats the state forever;
 * - otherwise the state plays three times, then the slowed idle loop takes over.
 */
export function resolvePlayback(state: PetState, options: { reducedMotion?: boolean, loop?: boolean } = {}): Playback {
  const frames = STATE_FRAMES[state]
  if (options.reducedMotion) return { frames: [frames[0]], loopStart: null }
  if (state === 'idle') return { frames: IDLE_SLOW, loopStart: 0 }
  if (options.loop) return { frames, loopStart: 0 }
  const repeated = [...frames, ...frames, ...frames]
  return { frames: [...repeated, ...IDLE_SLOW], loopStart: repeated.length }
}

/** Column percentage for `background-position`; columns are evenly spaced. */
export const columnPercent = (column: number): number => (column / (COLUMNS - 1)) * 100
/** Row percentage for `background-position`; rows are evenly spaced. */
export const rowPercent = (rowIndex: number, rows: number): number => (rowIndex / (rows - 1)) * 100

/** How many rows a sheet of this pixel height has, or null when it is not a pet atlas. */
export function rowsForHeight(height: number): 9 | 11 | null {
  if (height === V1_HEIGHT) return V1_ROWS
  if (height === V2_HEIGHT) return V2_ROWS
  return null
}

export interface LookFrame {
  row: number
  column: number
}

/**
 * Look direction for a pointer offset from the pet's centre, in screen pixels.
 * 000 degrees looks up, 090 looks screen-right, and the deadzone falls back to
 * the idle animation.
 */
export function lookFrame(dx: number, dy: number, deadzone = 1): LookFrame | null {
  if (Math.hypot(dx, dy) <= deadzone) return null
  const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360
  const direction = Math.round(angle / LOOK_STEP_DEGREES) % LOOK_DIRECTIONS
  return { column: direction % COLUMNS, row: LOOK_ROW_A + Math.floor(direction / COLUMNS) }
}
