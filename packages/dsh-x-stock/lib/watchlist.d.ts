export interface WatchlistItem {
    symbol: string;
    alias: string;
    fixed: boolean;
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
export declare const STORAGE_KEY = "dsh-x-stock:watchlist:v2";
/** Pre-split payloads (watchlist == bottom bar) are imported once, unfixed. */
export declare const LEGACY_STORAGE_KEY = "dsh-x-stock:watchlist:v1";
export declare const QUOTE_CHANNEL = "/api";
export declare function normalizeAShare(exchange: unknown, code: unknown): string;
export declare function validateSymbol(symbol: unknown): string;
export declare function normalizeItem(raw: unknown): WatchlistItem;
export declare function parseSaved(raw: string | null | undefined): SavedWatchlist;
export declare const fixedItems: (items: WatchlistItem[]) => WatchlistItem[];
export declare function quoteStatus(quote?: any, now?: number): "closed" | "recent" | "stale" | "unavailable" | "unconfigured" | "unknown-time";
export declare const SCOPE_ENDPOINT = "dsh-x-stock.scope";
export declare function validateScope(scope: unknown): string;
export declare const scopedStorageKey: (scope: any) => string;
export declare const legacyScopedStorageKey: (scope: any) => string;
