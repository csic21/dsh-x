import type { MarketPreference, MarketProvider } from './market.ts';
import type { MarketController } from './market-preference.ts';
export type MarketProviderSource = MarketProvider | (() => Promise<MarketProvider | undefined>);
export declare function createMarketHandler({ provider }?: {
    provider?: MarketProviderSource;
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
        board?: undefined;
    };
} | {
    ok: boolean;
    value: {
        source?: undefined;
        status: string;
        overview: import("./market.ts").MarketOverview;
        breadth?: undefined;
        board?: undefined;
    };
} | {
    ok: boolean;
    value: {
        source?: undefined;
        overview?: undefined;
        status: string;
        breadth: import("./market.ts").MarketBreadth;
        board?: undefined;
    };
} | {
    ok: boolean;
    value: {
        source?: undefined;
        overview?: undefined;
        breadth?: undefined;
        status: string;
        board: import("./market.ts").BoardDetail;
    };
}>;
export declare function createMarketRoute(options?: {
    provider?: MarketProviderSource;
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
