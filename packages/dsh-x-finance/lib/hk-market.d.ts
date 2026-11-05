import type { MarketHistory } from './market.ts';
export declare const HK_ENDPOINT = "dsh-x-finance.hk";
export declare const HK_SOURCE_NAME = "\u817E\u8BAF\u6E2F\u80A1 (unofficial)";
export declare const HK_CURRENCY: 'HKD';
export declare const HK_EXCHANGE_TIME_ZONE: 'Asia/Hong_Kong';
/** Four years of daily bars, the same ceiling the A-share chart uses. */
export declare const HK_MAX_HISTORY = 1000;
export declare const HK_QUOTE_MAX_BYTES: number;
export declare const HK_HISTORY_MAX_BYTES: number;
export declare const HK_TIMEOUT_MS = 10000;
/** A suspended HK listing keeps a meaningful last price; a year is still the cutoff. */
export declare const HK_MAX_QUOTE_AGE_MS: number;
export declare function hkError(code: string, message: string): Error;
/** Canonical `HK.00700` identity. Rejects A-share, US and index codes. */
export declare function normalizeHkSymbol(input: unknown): string;
export declare function isHkSymbol(input: unknown): boolean;
/** Five-digit code without the namespace: `HK.00700` → `00700`. */
export declare function hkCodeOf(symbol: string): string;
/** Whether a directory code is the HKD counter of a dual-counter listing. */
export declare function isRmbCounterCode(code: string): boolean;
/**
 * Splits a directory code into the canonical identity, or null when the row is
 * not an HKD-counter Hong Kong listing. The directory writes codes with their
 * leading zeros, so the padding is preserved rather than re-derived.
 */
export declare function parseHkDirectoryCode(input: unknown): string | null;
export declare function hkQuoteUrl(symbol: string): string;
export declare function hkHistoryUrl(symbol: string, limit: number): string;
export declare function validateHkHistoryLimit(input: unknown): number;
export interface HkQuote {
    symbol: string;
    name: string;
    price: number;
    /** Decimal places the source printed, not a formatting preference. */
    pricePrecision: number;
    change: number | null;
    changePercent: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    previousClose: number | null;
    /** Share count when the source stated one; never a lot conversion guess. */
    volume: number | null;
    /** Turnover in HKD when the source stated one. */
    amount: number | null;
    currency: typeof HK_CURRENCY;
    /** Exchange-local stamp converted to an instant; null when it cannot be trusted. */
    quotedAt: string | null;
    fetchedAt: string;
    /** The source has no closed flag for an HK row, so it never claims one. */
    marketStatus: 'closed' | 'unknown';
    source: string;
}
export type HkRequest = {
    kind: 'quote';
    symbol: string;
} | {
    kind: 'history';
    symbol: string;
    limit: number;
};
export type HkResult = {
    status: 'disabled';
} | {
    status: 'ready';
    quote: HkQuote;
} | {
    status: 'ready';
    history: MarketHistory;
};
/**
 * Projects the `v_hk00700="..."` payload. Unknown symbols come back as a single
 * field, which is "no such listing", not a transport failure. The HK layout is
 * close to the US one but not identical: turnover sits at 37 and the currency
 * at 75, so the indices are spelled out here rather than shared. Exported for
 * offline tests.
 */
export declare function parseHkQuote(text: unknown, symbol: string, now: number): HkQuote;
interface RawHkRow {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    /** The row's turnover column, in whatever unit the source used. */
    amount: number | null;
}
/**
 * The HK daily rows use the same open/close/high/low order as the A-share and
 * US feeds. Rows with impossible OHLC, duplicate or unsorted dates are dropped
 * rather than repaired; an empty result is reported as unavailable.
 */
export declare function parseHkDailyRows(rows: unknown): RawHkRow[];
/**
 * The daily endpoint reports HK volume in shares, but a unit claim needs
 * evidence: the embedded quote block carries the same session's volume, so a
 * matching last bar confirms shares. A row that does not match is left unknown
 * instead of being scaled by a guess — an unknown unit empties the volume
 * rather than publishing a plausible but wrong share count.
 */
export declare function hkVolumeBasis(rows: RawHkRow[], quotedVolume: number | null): 'shares' | 'unknown';
/**
 * The HK turnover column is printed in 万元 (the A-share convention) while the
 * quote block states HKD. The ratio between the two settles the unit: roughly
 * 10,000 means the column is 万元, roughly 1 means it is already HKD. Anything
 * else (a stale last bar, a shifted column) stays unknown and the amount is
 * omitted rather than scaled by a guess.
 */
export declare function hkAmountUnit(rows: RawHkRow[], quotedAmount: number | null): 'wan' | 'yuan' | 'unknown';
/** Projects the HK daily response; exported for offline tests. */
export declare function parseHkHistory(payload: unknown, options: {
    symbol: string;
    limit: number;
    now: number;
}): MarketHistory;
/**
 * Accepts only the two documented request shapes; extra keys are rejected.
 * Unlike the US route there is no venue code: the HK daily endpoint takes the
 * same five-digit code as the quote endpoint, so the identity is enough.
 */
export declare function parseHkRequest(payload: unknown): HkRequest;
/**
 * Re-validates a provider's quote at the RPC boundary, so a replacement
 * adapter cannot publish extra fields, another symbol or an impossible price.
 */
export declare function projectHkQuote(raw: unknown, symbol: string, now: number): HkQuote;
/** Re-validates a provider's history: identity, bars, ordering and provenance. */
export declare function projectHkHistory(raw: unknown, symbol: string, now: number): MarketHistory;
export {};
