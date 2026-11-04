import type { MarketHistory } from './market.ts';
export declare const US_ENDPOINT = "dsh-x-finance.us";
export declare const US_SOURCE_NAME = "\u817E\u8BAF\u7F8E\u80A1 (unofficial)";
export declare const US_CURRENCY: 'USD';
export declare const US_EXCHANGE_TIME_ZONE: 'America/New_York';
/** Four years of daily bars, the same ceiling the A-share chart uses. */
export declare const US_MAX_HISTORY = 1000;
export declare const US_QUOTE_MAX_BYTES: number;
export declare const US_HISTORY_MAX_BYTES: number;
export declare const US_TIMEOUT_MS = 10000;
/**
 * A US listing can suspend for months and still have a meaningful last price;
 * the timestamp is reported as-is and the browser marks it old. A year is the
 * point where a row stops describing "this security" and starts describing
 * history, so it is the only age cutoff applied here.
 */
export declare const US_MAX_QUOTE_AGE_MS: number;
/**
 * The directory answers `us~aapl.oq~Apple~apple~GP`; the last segment is the
 * venue, not part of the ticker. Only the venues that were observed and
 * cross-checked are accepted — an unknown suffix is skipped rather than guessed.
 */
export declare const US_VENUES: Set<string>;
export declare function usError(code: string, message: string): Error;
/** Canonical `US.<ticker>` identity. Rejects A-share, Hong Kong and index codes. */
export declare function normalizeUsSymbol(input: unknown): string;
export declare function isUsSymbol(input: unknown): boolean;
/** Ticker only: `US.BRK.A` → `BRK.A`, the part the quote endpoint accepts. */
export declare function usTickerOf(symbol: string): string;
/**
 * The venue-qualified code the daily endpoint requires (`AAPL.OQ`, `BRK.A.N`).
 * It must belong to the symbol it is sent with: a client cannot use one US
 * identity to read another security's history.
 */
export declare function normalizeUsCode(input: unknown, symbol: string): string;
/** Splits a directory code into `{ ticker, code }`; null when it is not usable. */
export declare function parseUsDirectoryCode(input: unknown): {
    ticker: string;
    code: string;
} | null;
/** The quote host answers the bare ticker; the venue suffix belongs to the daily one. */
export declare function usQuoteUrl(symbol: string): string;
export declare function usHistoryUrl(code: string, limit: number): string;
export declare function validateUsHistoryLimit(input: unknown): number;
export interface UsQuote {
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
    /** Turnover in USD when the source stated one. */
    amount: number | null;
    currency: typeof US_CURRENCY;
    /** Exchange-local stamp converted to an instant; null when it cannot be trusted. */
    quotedAt: string | null;
    fetchedAt: string;
    /** The source has no closed flag for a US row, so it never claims one. */
    marketStatus: 'closed' | 'unknown';
    source: string;
}
export type UsRequest = {
    kind: 'quote';
    symbol: string;
} | {
    kind: 'history';
    symbol: string;
    code: string;
    limit: number;
};
export type UsResult = {
    status: 'disabled';
} | {
    status: 'ready';
    quote: UsQuote;
} | {
    status: 'ready';
    history: MarketHistory;
};
/**
 * Projects the `v_usXXXX="..."` payload. Unknown symbols come back as
 * `v_pv_none_match`; that is "no such listing", not a transport failure.
 * Exported for offline tests.
 */
export declare function parseUsQuote(text: unknown, symbol: string, now: number): UsQuote;
interface RawUsRow {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    amount: number | null;
}
/**
 * The US daily rows use the same open/close/high/low order as the A-share
 * feed. Rows with impossible OHLC, duplicate or unsorted dates are dropped
 * rather than repaired; an empty result is reported as unavailable.
 */
export declare function parseUsDailyRows(rows: unknown): RawUsRow[];
/**
 * The daily endpoint reports volume in shares for US rows, but a unit claim
 * needs evidence: the embedded quote block carries the same session's volume,
 * so a matching last bar confirms shares (`×100` would mean lots). Without that
 * block the unit stays unknown and volume is omitted instead of guessed.
 */
export declare function usVolumeBasis(rows: RawUsRow[], quotedVolume: number | null): 'shares' | 'lots' | 'unknown';
/** Projects the US daily response; exported for offline tests. */
export declare function parseUsHistory(payload: unknown, options: {
    symbol: string;
    code: string;
    limit: number;
    now: number;
}): MarketHistory;
/** Accepts only the two documented request shapes; extra keys are rejected. */
export declare function parseUsRequest(payload: unknown): UsRequest;
/**
 * Re-validates a provider's quote at the RPC boundary, so a replacement
 * adapter cannot publish extra fields, another symbol or an impossible price.
 */
export declare function projectUsQuote(raw: unknown, symbol: string, now: number): UsQuote;
/** Re-validates a provider's history: identity, bars, ordering and provenance. */
export declare function projectUsHistory(raw: unknown, symbol: string, now: number): MarketHistory;
export {};
