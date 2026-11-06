/** A daily bar, in the shape both the Host and the research script hold. */
export interface TradeBar {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
}
/**
 * Round-trip cost in basis points. Commission and transfer are charged on both
 * sides, stamp duty only on the sell. Slippage is not a constant: the closer
 * the open sits to the price limit, the less the printed open says about the
 * price a real order would have paid.
 */
export declare const TRADE_COST_BPS: Readonly<{
    commission: 2.5;
    transfer: 0.1;
    stamp: 5;
    baseSlippage: 5;
    maxSlippage: 45;
}>;
/**
 * A forward-adjusted series never prints the exact limit price, so an open
 * this close to the limit is treated as sealed. 0.3pp matches the tolerance the
 * close-side limit test already uses: wide enough for adjustment rounding, far
 * too narrow to accept a 9.0% open on a 10% board.
 */
export declare const OPEN_LIMIT_TOLERANCE = 0.3;
/** True when the whole session printed one price: no intraday fill exists. */
export declare function isOneWordBar(bar: TradeBar): boolean;
/**
 * Whether the next session's open could be bought. A board that opens on its
 * limit is excluded even when it later breaks: the queue at the limit is the
 * only fill available at that price, and it is not available to a reader who
 * sees the number after the fact.
 */
export declare function isBuyableOpen(bar: TradeBar, previousClose: number, rate: number): boolean;
/**
 * Cost of one round trip in percent, given the gap the entry paid. The gap
 * itself is not a cost — the return is measured from the open, so the gap is
 * already excluded — but it measures how crowded the entry was, and that is
 * what slippage tracks.
 */
export declare function roundTripCostPercent(gapPercent: number, rate: number): number;
/** Net percent return from a fill at `entryOpen` to an exit at `exitClose`. */
export declare function netReturnPercent(entryOpen: number, exitClose: number, costPercent: number): number | null;
export interface EvaluatedRow {
    symbol: string;
    sessionDate: string;
    score: number;
    /** Net percent return of the trade this row proposed. */
    netReturn: number;
}
export interface RankingMetrics {
    days: number;
    trades: number;
    winRate: number;
    avgNet: number;
    total: number;
    maxDrawdown: number;
    /** Mean within-session Spearman correlation between score and net return. */
    ic: number;
    /** ic divided by its own across-session deviation; the stability of the edge. */
    icIr: number;
    /** Spearman correlation between score quintile and mean net return. */
    monotonicity: number;
}
/**
 * Everything a ranking should be judged on: does the order agree with realised
 * net return (ic), is that agreement stable (icIr), does a higher score mean a
 * higher return (monotonicity), and does the equal-weight top-k actually keep
 * its capital after cost.
 */
export declare function evaluateRanking(rows: readonly EvaluatedRow[], k: number): RankingMetrics;
