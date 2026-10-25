export interface HotBar {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
}
/** Bumped when a rule changes meaning, so a cached run is never mixed with a newer registry. */
export declare const HOT_STRATEGY_VERSION = 1;
/** Results returned to the browser. */
export declare const HOT_MAX_RESULTS = 60;
/** Snapshot-ranked candidates that also receive the history layer. */
export declare const HOT_HISTORY_DEPTH = 120;
/** Daily bars requested per candidate. */
export declare const HOT_HISTORY_BARS = 80;
/** A scan result may be reused by the Host for this long. */
export declare const HOT_SCAN_TTL_MS = 20000;
/** Snapshot rows may be reused by the Host for this long. */
export declare const HOT_ROWS_TTL_MS = 60000;
/**
 * A weak rule alone is not a "hit": at least one matched strategy must carry
 * this weight. Otherwise one broad condition (e.g. any main inflow, or a 3%
 * move) would mark most of the market as a match and the headline count would
 * mean nothing. Weight-1 rules still add score and tags.
 */
export declare const HOT_MIN_WEIGHT = 2;
/** Defensive ceiling for one paged snapshot scan. */
export declare const HOT_MAX_STOCKS = 12000;
export declare const HOT_MAX_SCAN_MS = 300000;
export type HotBoard = 'main' | 'star' | 'chinext' | 'bse';
export type HotCategory = 'heat' | 'volume' | 'trend' | 'capital' | 'structure';
export interface HotSnapshot {
    /** Exchange-qualified symbol, e.g. `SH.600519`. */
    symbol: string;
    name: string;
    price: number;
    /** Percent, e.g. 7.37 for +7.37%. */
    changePercent: number;
    /** Turnover rate in percent, when the source reports it. */
    turnoverRate: number | null;
    /** The source's daily volume ratio (量比). */
    volumeRatio: number | null;
    /** Price speed today in percent. */
    speed: number | null;
    /** Intraday amplitude in percent. */
    amplitude: number | null;
    /** Turnover in CNY. */
    amount: number;
    /** Free-float market capitalisation in CNY. */
    floatCap: number | null;
    /** Total market capitalisation in CNY. */
    totalCap: number | null;
    /** Main-force net inflow in CNY. */
    mainInflow: number | null;
    change5d: number | null;
    change10d: number | null;
    change20d: number | null;
    change60d: number | null;
    board: HotBoard;
    suspended: boolean;
}
export interface HotHistoryContext {
    /** Null when the history layer did not run for this symbol. */
    bars: HotBar[] | null;
}
export interface HotStrategy {
    id: string;
    category: HotCategory;
    /** Relative importance inside the composite score. */
    weight: number;
    layer: 'snapshot' | 'history';
    test: (snapshot: HotSnapshot, context: HotHistoryContext) => boolean;
}
export interface HotHit {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    amount: number;
    turnoverRate: number | null;
    volumeRatio: number | null;
    /** 0–100, relative to the strongest stock in the same run. */
    score: number;
    /** Matched strategy ids, in registry order. */
    hits: string[];
}
export interface HotUniverse {
    expected: number;
    covered: number;
    /** Symbols that received the snapshot layer. */
    scanned: number;
    /** Symbols that also received the history layer. */
    historyChecked: number;
    historyFailed: number;
    partial: boolean;
}
export interface HotScanResult {
    source: string;
    fetchedAt: string;
    durationMs: number;
    strategyCount: number;
    /** Present when the scan was limited to one industry board. */
    board: {
        code: string;
        name: string;
    } | null;
    universe: HotUniverse;
    /** Every symbol that matched at least one strategy, not only the rows returned. */
    hitCount: number;
    hits: HotHit[];
}
/**
 * The price limit in percent for the current session. New listings (`N`/`C`)
 * have no reliable limit, so a limit rule stays silent for them instead of
 * guessing. ST names move 5% on the main board and 20% on ChiNext/STAR.
 */
export declare function limitPercent(snapshot: HotSnapshot): number | null;
export declare function isLimitUp(snapshot: HotSnapshot): boolean;
/** Consecutive limit-up sessions ending at the latest bar (capped at 10). */
export declare function limitStreak(bars: HotBar[], limit: number | null): number;
/**
 * The strategy registry. Order is the tag order shown in the UI, so rules are
 * grouped by what a reader would look for: heat, volume, trend, capital.
 */
export declare const HOT_STRATEGIES: readonly HotStrategy[];
export declare const HOT_STRATEGY_COUNT: number;
export declare function hotStrategy(id: string): HotStrategy | undefined;
/**
 * Runs the registry against one symbol. Snapshot rules always run; history
 * rules only run when bars were actually fetched for this symbol.
 */
export declare function hotHits(snapshot: HotSnapshot, bars: HotBar[] | null): string[];
/** True when at least one matched rule is strong enough to count as a hit. */
export declare function hotQualifies(hits: readonly string[]): boolean;
export declare function hotWeight(hits: readonly string[]): number;
/**
 * Normalises each hit list against the strongest list in the same run, so the
 * top stock is 100 and the rest are comparable within this run only. The UI
 * must not present the number as an absolute quality measure.
 */
export declare function hotScores(weights: readonly number[]): number[];
/** Sorts by score, then today's move, then symbol: deterministic for equal scores. */
export declare function sortHotHits(hits: HotHit[]): HotHit[];
/** Bounds and validates a scan result before it leaves the Host. */
export declare function projectHotScan(raw: unknown, now: number): HotScanResult;
