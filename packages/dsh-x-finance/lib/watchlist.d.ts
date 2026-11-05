export interface WatchlistItem {
    symbol: string;
    alias: string;
    fixed: boolean;
    /**
     * US only: the venue-qualified code (`AAPL.OQ`) the daily endpoint needs.
     * Without it a saved US row could show a quote but not its chart, so it is
     * carried with the item instead of being re-derived on every open. The US
     * route re-validates it; this field is not a trust boundary.
     */
    code?: string;
}
export interface SavedWatchlist {
    items: WatchlistItem[];
    collapsed: boolean;
    barHidden: boolean;
}
export declare const watchlistError: (code: any) => Error & {
    code: any;
};
/** Safety bound for the scrollable page list, not a product limit. */
export declare const MAX_WATCHLIST = 200;
/** The bottom bar is a glanceable strip and stays small on purpose. */
export declare const MAX_FIXED = 8;
export declare const STORAGE_KEY = "dsh-x-finance:watchlist:v2";
/** Pre-split payloads (watchlist == bottom bar) are imported once, unfixed. */
export declare const LEGACY_STORAGE_KEY = "dsh-x-finance:watchlist:v1";
/**
 * Keys written before the plugin was renamed from `dsh-x-stock`. The payload
 * is identical, so an existing list is read once as a fallback instead of
 * being silently dropped.
 */
export declare const PREVIOUS_STORAGE_KEY = "dsh-x-stock:watchlist:v2";
export declare const PREVIOUS_LEGACY_STORAGE_KEY = "dsh-x-stock:watchlist:v1";
export declare const QUOTE_CHANNEL = "/api";
export declare function normalizeAShare(exchange: unknown, code: unknown): string;
/**
 * The A-share exchange identity. Everything that is inherently A-share — daily
 * history, intraday, fundamentals, holdings, signals, the tail scan — keeps
 * using this narrower validator, so an overseas row can never drift into a
 * route that would answer it with the wrong market's fields.
 */
export declare function validateSymbol(symbol: unknown): string;
/** The three boards the page can save. */
export type WatchMarket = 'cn' | 'hk' | 'us';
/** Which board a saved symbol belongs to. Throws for anything else. */
export declare function marketOf(symbol: unknown): WatchMarket;
/** True for a watchable listing on any of the three boards. */
export declare function isWatchSymbol(symbol: unknown): boolean;
/** True when the symbol is an overseas listing rather than an A-share one. */
export declare function isOverseasSymbol(symbol: unknown): boolean;
/** The widest identity the watchlist accepts: A-share, Hong Kong or US. */
export declare function validateWatchSymbol(symbol: unknown): string;
export declare function normalizeItem(raw: unknown): WatchlistItem;
export declare function parseSaved(raw: string | null | undefined): SavedWatchlist;
export declare const fixedItems: (items: WatchlistItem[]) => WatchlistItem[];
export declare function quoteStatus(quote?: any, now?: number): "closed" | "recent" | "stale" | "unavailable" | "unconfigured" | "unknown-time";
export declare const SCOPE_ENDPOINT = "dsh-x-finance.scope";
export declare function validateScope(scope: unknown): string;
export declare const scopedStorageKey: (scope: any) => string;
export declare const legacyScopedStorageKey: (scope: any) => string;
/** Read-only fallbacks from the pre-rename plugin id, newest first. */
export declare const previousScopedStorageKeys: (scope: any) => string[];
