export declare const QUANT_MAX_BARS = 5000;
export declare const QUANT_TRADING_DAYS = 252;
export declare const QUANT_RULE_KEYS: readonly ['ma5-20', 'ma10-60', 'macd', 'kdj'];
export type QuantRuleKey = (typeof QUANT_RULE_KEYS)[number];
export interface QuantBar {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    isFinal?: boolean;
}
export interface MonthlyReturn {
    year: number;
    month: number;
    returnRatio: number;
    bars: number;
    /** The month's last bar is the dataset's last bar and is still moving. */
    partial: boolean;
}
export interface QuantStats {
    samples: number;
    from: string | null;
    to: string | null;
    totalReturn: number | null;
    cagr: number | null;
    annualVolatility: number | null;
    sharpe: number | null;
    maxDrawdown: number | null;
    drawdownPeakDate: string | null;
    drawdownTroughDate: string | null;
    dailyWinRate: number | null;
    bestDay: number | null;
    worstDay: number | null;
    averageDaily: number | null;
    atr14: number | null;
    rsi14: number | null;
    bollingerPercentB: number | null;
    ma20: number | null;
    ma60: number | null;
    ma120: number | null;
    priceVsMa20: number | null;
    priceVsMa60: number | null;
    momentum20: number | null;
    momentum60: number | null;
    momentum120: number | null;
    high52w: number | null;
    low52w: number | null;
    drawdownFromHigh: number | null;
    monthly: MonthlyReturn[];
}
export interface CorrelationResult {
    value: number;
    samples: number;
}
export interface BacktestTrade {
    entryDate: string;
    exitDate: string;
    /** Gross traded prices; the net return already includes both costs. */
    entryPrice: number;
    exitPrice: number;
    returnRatio: number;
    bars: number;
    /** Marked at the last close because no exit signal arrived in the sample. */
    open: boolean;
}
export interface BacktestPoint {
    date: string;
    strategy: number;
    buyHold: number;
}
export interface BacktestOptions {
    rule?: QuantRuleKey;
    commissionBps?: number;
    slippageBps?: number;
}
export interface BacktestResult {
    rule: QuantRuleKey;
    commissionBps: number;
    slippageBps: number;
    bars: number;
    trades: BacktestTrade[];
    points: BacktestPoint[];
    totalReturn: number | null;
    buyHoldReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
    sharpe: number | null;
    winRate: number | null;
    tradeCount: number;
    averageTrade: number | null;
    profitFactor: number | null;
    exposure: number | null;
}
/**
 * Sorts, de-duplicates and bounds the series. A bar without a usable positive
 * OHLC is dropped; nothing is interpolated across the gap.
 */
export declare function normalizeQuantBars(input: unknown): QuantBar[];
/** Wilder ATR; null until a full warm-up window exists. */
export declare function averageTrueRange(bars: QuantBar[], period?: number): number | null;
/** Wilder RSI. A perfectly flat window is neutral (50), not 0 or 100. */
export declare function relativeStrengthIndex(bars: QuantBar[], period?: number): number | null;
/** %B of a 20-period, 2-sigma Bollinger band; null when the band has no width. */
export declare function bollingerPercentB(bars: QuantBar[], period?: number, multiplier?: number): number | null;
export declare function monthlyReturns(bars: QuantBar[]): MonthlyReturn[];
export declare function computeQuantStats(input: unknown): QuantStats;
/** Pearson correlation of aligned daily returns; requires at least 20 pairs. */
export declare function correlationWith(left: unknown, right: unknown): CorrelationResult | null;
export declare function validateRule(raw: unknown): QuantRuleKey;
/** Declared rule signals, evaluated at each close. Exported for tests. */
export declare function ruleSignals(bars: QuantBar[], rule: QuantRuleKey): ('buy' | 'sell' | null)[];
/**
 * Long-only, fully invested rule replay. A signal is read at the close and
 * executed at the next bar's open; commission and slippage are applied on both
 * sides. No shorting, leverage, position sizing, dividends or taxes are
 * modelled, and the final open position is marked at the last close.
 */
export declare function runBacktest(input: unknown, options?: BacktestOptions): BacktestResult;
