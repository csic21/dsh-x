import type { MarketPreference, MarketProvider, MarketQuote } from './market.ts';
import type { MarketController } from './market-preference.ts';
export type MarketProviderSource = MarketProvider | (() => Promise<MarketProvider | undefined>);
/**
 * Re-validates every quote before it reaches the browser and reports a symbol
 * the source did not answer for as `unavailable`. Raw payloads, extra fields
 * and upstream errors never leave the Host.
 */
export declare function projectQuotes(raw: unknown, symbols: string[], now: number): MarketQuote[];
export declare function createMarketHandler({ provider, now }?: {
    provider?: MarketProviderSource;
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
        source: null;
        overview?: undefined;
        breadth?: undefined;
        quotes?: undefined;
        board?: undefined;
    };
} | {
    ok: boolean;
    value: {
        status: string;
        overview: import("./market.ts").MarketOverview;
        breadth?: undefined;
        source?: undefined;
        quotes?: undefined;
        board?: undefined;
    };
} | {
    ok: boolean;
    value: {
        overview?: undefined;
        status: string;
        breadth: import("./market.ts").MarketBreadth;
        source?: undefined;
        quotes?: undefined;
        board?: undefined;
    };
} | {
    ok: boolean;
    value: {
        overview?: undefined;
        breadth?: undefined;
        status: string;
        source: string;
        quotes: MarketQuote[];
        board?: undefined;
    };
} | {
    ok: boolean;
    value: {
        overview?: undefined;
        breadth?: undefined;
        source?: undefined;
        quotes?: undefined;
        status: string;
        board: import("./market.ts").BoardDetail;
    };
}>;
export declare function createMarketRoute(options?: {
    provider?: MarketProviderSource;
    now?: () => number;
}): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
export declare function createMarketPreferenceHandler({ controller }?: {
    controller?: MarketController;
}): (endpoint: any, payload: any, signal: any, peer: any) => Promise<{
    ok: boolean;
    error: {
        code: string;
        message: string;
        details: {};
    };
} | {
    ok: boolean;
    value: MarketPreference;
}>;
export declare function createMarketPreferenceRoute(options?: {
    controller?: MarketController;
}): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
