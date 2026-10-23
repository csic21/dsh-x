import type { MarketIntraday } from './market.ts';
import type { MarketHistory, MarketPreference, MarketProvider, MarketQuote } from './market.ts';
import type { MarketController } from './market-preference.ts';
export type MarketProviderSource = MarketProvider | (() => Promise<MarketProvider | undefined>);
/**
 * Re-validates every quote before it reaches the browser and reports a symbol
 * the source did not answer for as `unavailable`. Raw payloads, extra fields
 * and upstream errors never leave the Host.
 */
export declare function projectQuotes(raw: unknown, symbols: string[], now: number): MarketQuote[];
/**
 * Re-validates a provider's daily history before it reaches the browser. This
 * is the same trust boundary as `projectQuotes`: a replacement adapter cannot
 * inject extra fields, unordered bars or a bar that violates OHLC, and the
 * response is bounded to the requested limit. Nothing is repaired or filled in.
 */
export declare function projectHistoryResponse(raw: unknown, symbol: string, requested: 'none' | 'forward' | 'backward', limit: number, now: number): MarketHistory;
/** Re-validates a minute line before it reaches the browser. No point is filled in. */
export declare function projectIntradayResponse(raw: unknown, symbol: string, now: number): MarketIntraday;
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
        history?: undefined;
        intraday?: undefined;
        global?: undefined;
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
        history?: undefined;
        intraday?: undefined;
        global?: undefined;
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
        history?: undefined;
        intraday?: undefined;
        global?: undefined;
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
        history?: undefined;
        intraday?: undefined;
        global?: undefined;
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
        history: MarketHistory;
        intraday?: undefined;
        global?: undefined;
        board?: undefined;
    };
} | {
    ok: boolean;
    value: {
        overview?: undefined;
        breadth?: undefined;
        source?: undefined;
        quotes?: undefined;
        history?: undefined;
        status: string;
        intraday: MarketIntraday;
        global?: undefined;
        board?: undefined;
    };
} | {
    ok: boolean;
    value: {
        overview?: undefined;
        breadth?: undefined;
        source?: undefined;
        quotes?: undefined;
        history?: undefined;
        intraday?: undefined;
        status: string;
        global: import("./global.ts").GlobalMarketOverview;
        board?: undefined;
    };
} | {
    ok: boolean;
    value: {
        overview?: undefined;
        breadth?: undefined;
        source?: undefined;
        quotes?: undefined;
        history?: undefined;
        intraday?: undefined;
        global?: undefined;
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
