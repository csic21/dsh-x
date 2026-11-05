import type { NewsProvider } from './news-provider.ts';
export type NewsProviderSource = NewsProvider | (() => Promise<NewsProvider | undefined>);
export declare function createNewsHandler({ provider, now }?: {
    provider?: NewsProviderSource;
    now?: () => number;
}): (endpoint: any, payload: any, signal: any, peer: any) => Promise<{
    ok: boolean;
    error: {
        code: string;
        message: string;
        details: {};
    };
} | {
    ok: boolean;
    value: {
        status: string;
        news?: undefined;
    };
} | {
    ok: boolean;
    value: {
        status: string;
        news: import("./news.ts").NewsFeed;
    };
}>;
export declare function createNewsRoute(options?: {
    provider?: NewsProviderSource;
    now?: () => number;
}): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
