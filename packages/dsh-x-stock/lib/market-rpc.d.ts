import type { MarketProvider } from './market.ts';
export declare function createMarketHandler({ provider }?: {
    provider?: MarketProvider;
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
    provider?: MarketProvider;
}): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
