import type { FactorObservation } from './factor-state.ts';
import type { MarketProvider } from './market.ts';
import type { JournalSession } from './factor-journal.ts';
/** The Host ticks more often than the journal can change; this throttles the work. */
export declare const FACTOR_EVOLVE_MIN_INTERVAL_MS: number;
/** A session needs its T+2 close; four calendar days covers a weekend. */
export declare const FACTOR_LABEL_AFTER_DAYS = 4;
/** A session that still has no usable bars after this long is dropped. */
export declare const FACTOR_LABEL_GIVE_UP_DAYS = 12;
export declare const FACTOR_LABEL_MAX_SESSIONS = 2;
export declare const FACTOR_LABEL_MAX_REQUESTS = 120;
export interface FactorEvolveState {
    running: boolean;
    lastRunAt: number | null;
    labeled: number;
    pending: number;
    error: string | null;
}
export interface FactorEvolveOptions {
    profileDirectory: string;
    provider: () => Promise<MarketProvider | undefined>;
    sourceEnabled: () => Promise<boolean>;
    now?: () => number;
    maxSessions?: number;
    maxRequests?: number;
}
export interface FactorEvolve {
    tick(): Promise<FactorEvolveState>;
    state(): FactorEvolveState;
    dispose(): void;
}
/** The only bar fields a label needs; `MarketDailyBar` satisfies this. */
export interface LabelBar {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
}
/**
 * Turns one journal session into labelled observations. A row whose entry open
 * was sealed, or whose bars do not reach the exit, is dropped rather than
 * guessed — the state is only allowed to learn from trades that existed.
 */
export declare function labelJournalSession(session: JournalSession, barsOf: (symbol: string) => LabelBar[] | undefined): FactorObservation[];
export declare function createFactorEvolve(options: FactorEvolveOptions): FactorEvolve;
