import type { NewsItem } from './news.ts';
export interface NewsProvider {
    readonly name: string;
    flash(signal?: AbortSignal): Promise<{
        source: string;
        items: NewsItem[];
    }>;
    stock(input: {
        symbol: string;
        name: string;
    }, signal?: AbortSignal): Promise<{
        source: string;
        items: NewsItem[];
        partial: boolean;
    }>;
}
export interface NewsProviderOptions {
    fetchImpl?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
    flashTtlMs?: number;
    stockTtlMs?: number;
}
export declare const NEWS_FLASH_URL = "https://zhibo.sina.com.cn/api/zhibo/feed?page=1&page_size=60&zhibo_id=152&tag_id=0&dire=f&dpc=1";
/**
 * A stock page only shows stories that name the company. Relevance search
 * returns those but can lag by days; time search is fresh but returns anything
 * that mentions the name in passing. Asking both and keeping the named rows is
 * the only combination that is both current and about this stock.
 */
export declare const NEWS_ARTICLE_WINDOW_MS: number;
/** The exact article-search URL, built from the stock name only. */
export declare function eastmoneySearchUrl(keyword: string, size: number, sort: 'default' | 'time'): string;
export declare function createSinaNewsProvider(options?: NewsProviderOptions): NewsProvider;
