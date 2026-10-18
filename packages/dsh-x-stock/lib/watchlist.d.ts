export interface WatchlistPin {
    symbol: string;
    alias: string;
}
export interface SavedWatchlist {
    pins: WatchlistPin[];
    collapsed: boolean;
}
export declare const watchlistError: (code: any) => Error & {
    code: any;
};
export declare const MAX_PINS = 8;
export declare const STORAGE_KEY = "dsh-x-stock:watchlist:v1";
export declare const QUOTE_CHANNEL = "/api";
export declare const QUOTE_ENDPOINT = "dsh-x-stock.quotes";
export declare function normalizeAShare(exchange: unknown, code: unknown): string;
export declare function validateSymbol(symbol: unknown): string;
export declare function normalizePin(raw: unknown): WatchlistPin;
export declare function parseSaved(raw: string | null | undefined): SavedWatchlist;
export declare function quoteStatus(quote?: any, now?: number): "closed" | "recent" | "stale" | "unavailable" | "unconfigured" | "unknown-time";
export declare const SCOPE_ENDPOINT = "dsh-x-stock.scope";
export declare function validateScope(scope: unknown): string;
export declare const scopedStorageKey: (scope: any) => string;
