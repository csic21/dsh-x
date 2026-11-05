import type { HkProvider } from './hk-provider.ts';
export interface HkGate {
    enabled: () => boolean | Promise<boolean>;
    provider?: HkProvider;
}
/**
 * Exact-route handler behind the official shared Connection admission bridge.
 * The bridge rejects non-owner peers before this code runs; the explicit check
 * keeps the handler safe when it is called directly in tests or another Host.
 *
 * The HK board is part of the same opt-in local free source: a disabled gate
 * answers `status: 'disabled'` without any network request.
 */
export declare function createHkHandler({ enabled, provider }: HkGate): (endpoint: any, payload: any, signal: any, peer: any) => Promise<{
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
        quote?: undefined;
        history?: undefined;
    };
} | {
    ok: boolean;
    value: {
        status: string;
        quote: import("./hk-market.ts").HkQuote;
        history?: undefined;
    };
} | {
    ok: boolean;
    value: {
        quote?: undefined;
        status: string;
        history: import("./market.ts").MarketHistory;
    };
}>;
export declare function createHkRoute(options: HkGate): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
