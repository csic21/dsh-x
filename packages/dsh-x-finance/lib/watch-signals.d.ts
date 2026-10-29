import type { MarketDailyBar } from './market.ts';
export type WatchSignalBar = Readonly<Pick<MarketDailyBar, 'sessionDate' | 'close' | 'isFinal'>>;
export type WatchSignalStatus = 'buy' | 'sell' | 'watch' | 'insufficient';
export type WatchSignalReason = 'ok' | 'invalid' | 'insufficient';
export declare const WATCH_SIGNAL_MIN_SAMPLES = 120;
export declare const WATCH_SIGNAL_MA20_PERIOD = 20;
export declare const WATCH_SIGNAL_MA60_PERIOD = 60;
export declare const WATCH_SIGNAL_BREAKOUT_PERIOD = 20;
export interface WatchSignal {
    status: WatchSignalStatus;
    reason: WatchSignalReason;
    sessionDate: string | null;
    /** Accepted bars, including an unfinished latest bar; zero for invalid input. */
    samples: number;
    /** False means intraday/unconfirmed, or no valid latest bar is available. */
    isFinal: boolean;
    close: number | null;
    ma20: number | null;
    ma60: number | null;
    previousClose: number | null;
    previousMa20: number | null;
    prior20High: number | null;
}
/**
 * Deterministic A-share daily research observations from caller-supplied bars.
 * These user-confirmed example rules have not been backtested; buy/sell are
 * observation labels, not investment advice or instructions to place orders.
 * Free quotes may be unreliable. The caller owns market eligibility and data
 * freshness; names/ST labels, system time, networks and models are not used.
 *
 * Reject the entire series on any invalid row (including duplicate dates or an
 * unfinished historical bar). No row is silently dropped or deduplicated.
 * Valid short series retain all available fields, but an indicator is null
 * until its full window exists. The 120-bar gate includes an unfinished latest
 * bar, whose isFinal=false must remain visible as intraday/unconfirmed in UI.
 */
export declare function evaluateWatchSignal(input: unknown): WatchSignal;
