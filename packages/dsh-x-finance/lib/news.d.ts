export declare const NEWS_ENDPOINT = "dsh-x-finance.news";
export declare const NEWS_FLASH_SOURCE = "\u65B0\u6D6A\u8D22\u7ECF 7x24 (unofficial)";
export declare const NEWS_STOCK_SOURCE = "\u4E1C\u65B9\u8D22\u5BCC\u8D44\u8BAF (unofficial)";
export declare const NEWS_TIMEOUT_MS = 8000;
export declare const NEWS_MAX_BYTES: number;
export declare const NEWS_FLASH_TTL_MS = 60000;
export declare const NEWS_STOCK_TTL_MS = 120000;
export declare const NEWS_MAX_ITEMS = 60;
/** Older than this and the item is not "news" for a session view any more. */
export declare const NEWS_MAX_AGE_MS: number;
export interface NewsSymbolRef {
    symbol: string;
    name: string;
}
/**
 * One story or flash. `direct` means the item names this security in its title
 * (or the feed tagged it); a mention-only row is kept but the client shows it in
 * a separate, clearly labelled group instead of implying it explains the move.
 */
export interface NewsItem {
    id: string;
    at: string;
    title: string;
    summary: string | null;
    media: string | null;
    url: string | null;
    tags: string[];
    direct: boolean;
    symbols: NewsSymbolRef[];
}
export interface NewsFeed {
    scope: 'flash' | 'stock';
    symbol: string | null;
    source: string;
    fetchedAt: string;
    partial: boolean;
    items: NewsItem[];
}
export type NewsRequest = {
    kind: 'flash';
} | {
    kind: 'stock';
    symbol: string;
    name: string;
};
/** Strip markup, decode the few entities these feeds use, and bound the length. */
export declare function sanitizeText(input: unknown, max: number): string;
/**
 * Only http(s) links on a known finance host survive. A search result may carry
 * anything; the page must never render an arbitrary scheme or an unknown
 * destination as "read the original".
 */
export declare function safeNewsUrl(input: unknown): string | null;
/** Sina prints Shanghai wall clock without a zone; interpret it as UTC+08:00. */
export declare function parseShanghaiStamp(value: unknown): string | null;
/**
 * A feed entry is either bracketed (【headline】body) or a bare sentence. Both
 * shapes become a headline plus an optional body; nothing is generated.
 */
export declare function splitFlash(text: string): {
    title: string;
    summary: string | null;
};
/** Map a Sina `ext.stocks` entry onto the identity this plugin already uses. */
export declare function newsSymbolRef(market: unknown, raw: unknown): string | null;
/** Parse the 7x24 flash list. A malformed envelope is a failure, not an empty feed. */
export declare function parseSinaFlash(payload: unknown, now: number): NewsItem[];
/** Parse the JSONP article search. Titles arrive with `<em>` markers. */
export declare function parseEastmoneyNews(payload: unknown, now: number): NewsItem[];
/** `cb({...})` -> the parsed object. Any other shape is rejected. */
export declare function unwrapJsonp(text: string): unknown;
export declare function parseNewsRequest(payload: unknown): NewsRequest;
/**
 * Deduplicate by id, then by normalized headline. Items that name the security
 * come first, newest first inside each group: a stock page must lead with the
 * stories about the stock, not with a market flash that merely ships nearby.
 */
export declare function mergeNews(items: NewsItem[], limit?: number): NewsItem[];
/**
 * Re-validate the provider's feed at the same boundary as the quote projectors.
 * Individual malformed rows are dropped (a news list has no numeric contract to
 * protect), but a malformed envelope is a failure rather than an empty feed.
 */
export declare function validateNewsFeed(raw: unknown, request: NewsRequest, now: number): NewsFeed;
