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
export declare const CELL_WIDTH = 192;
export declare const CELL_HEIGHT = 208;
export declare const COLUMNS = 8;
export declare const V1_ROWS = 9;
export declare const V2_ROWS = 11;
export declare const V1_HEIGHT: number;
export declare const V2_HEIGHT: number;
export declare const ATLAS_WIDTH: number;
/** Rows every sheet must carry, in order. */
export declare const STATES: readonly ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'];
export type PetState = typeof STATES[number];
export declare const LOOK_ROW_A = 9;
export declare const LOOK_ROW_B = 10;
/** 16 clockwise look directions, 22.5 degrees apart; 000 looks up. */
export declare const LOOK_STEP_DEGREES = 22.5;
export declare const LOOK_DIRECTIONS = 16;
/** The row each state occupies in the atlas. */
export declare const IDLE_ROW: Record<PetState, number>;
/** How many cells of each row the contract defines; the rest stay transparent. */
export declare const USED_COLUMNS: Record<PetState, number>;
/** One played frame: which cell, and how long it stays. */
export interface Frame {
    row: number;
    column: number;
    durationMs: number;
}
export declare const STATE_FRAMES: Record<PetState, Frame[]>;
export interface Playback {
    frames: Frame[];
    /** Index to resume from after the last frame, or null to stop on it. */
    loopStart: number | null;
}
/**
 * Resolve one state into its playback plan, exactly as Codex does:
 * - reduced motion shows the state's first frame only;
 * - idle always loops its slowed frames;
 * - an explicit loop repeats the state forever;
 * - otherwise the state plays three times, then the slowed idle loop takes over.
 */
export declare function resolvePlayback(state: PetState, options?: {
    reducedMotion?: boolean;
    loop?: boolean;
}): Playback;
/** Column percentage for `background-position`; columns are evenly spaced. */
export declare const columnPercent: (column: number) => number;
/** Row percentage for `background-position`; rows are evenly spaced. */
export declare const rowPercent: (rowIndex: number, rows: number) => number;
/** How many rows a sheet of this pixel height has, or null when it is not a pet atlas. */
export declare function rowsForHeight(height: number): 9 | 11 | null;
export interface LookFrame {
    row: number;
    column: number;
}
/**
 * Look direction for a pointer offset from the pet's centre, in screen pixels.
 * 000 degrees looks up, 090 looks screen-right, and the deadzone falls back to
 * the idle animation.
 */
export declare function lookFrame(dx: number, dy: number, deadzone?: number): LookFrame | null;
