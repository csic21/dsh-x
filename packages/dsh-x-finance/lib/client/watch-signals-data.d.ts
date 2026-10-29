import type { MarketHistory } from '../market.ts';
import type { WatchSignal } from '../watch-signals.ts';
import type { WatchReplay } from '../watch-signal-backtest.ts';
export declare const WATCH_SIGNAL_CONCURRENCY = 2;
export declare const WATCH_SIGNAL_PAUSE_MS = 1000;
export declare const WATCH_SIGNAL_FAILURE_LIMIT = 6;
export declare const WATCH_SIGNAL_HISTORY_BARS = 250;
export declare const WATCH_SIGNAL_MAX_AGE_DAYS = 7;
export interface SignalWatchItem {
    symbol: string;
    alias: string;
}
export type WatchRowStatus = 'pending' | 'ready' | 'unavailable' | 'unknown-kind' | 'unsupported' | 'unadjusted' | 'stale' | 'skipped';
export interface WatchSignalRow {
    symbol: string;
    alias: string;
    name: string;
    status: WatchRowStatus;
    signal: WatchSignal | null;
    replay: WatchReplay | null;
    source: string | null;
    fetchedAt: string | null;
    adjustment: MarketHistory['adjustment'] | null;
    pricePrecision: number | null;
    /** A directory-name warning, not authoritative exchange status. */
    stWarning: boolean;
}
/** Process all listed items at concurrency two; partial successes are observable. */
export declare function scanWatchSignals(rpc: any, input: readonly SignalWatchItem[], options: {
    signal: AbortSignal;
    now?: () => number;
    onProgress?: (rows: WatchSignalRow[]) => void;
    wait?: (signal: AbortSignal) => Promise<void>;
}): Promise<WatchSignalRow[]>;
