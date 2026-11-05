import type { UsProvider } from './us-provider.ts';
export interface UsGate {
    enabled: () => boolean | Promise<boolean>;
    provider?: UsProvider;
}
/**
 * Exact-route handler behind the official shared Connection admission bridge.
 * The bridge rejects non-owner peers before this code runs; the explicit check
 * keeps the handler safe when it is called directly in tests or another Host.
 *
 * The US board is part of the same opt-in local free source: a disabled gate
 * answers `status: 'disabled'` without any network request.
 */
export declare function createUsHandler({ enabled, provider }: UsGate): (endpoint: any, payload: any, signal: any, peer: any) => Promise<{
    ok: boolean;
    error: {
        code: string;
        message: string;
        details: {};
    };
} | {
    ok: boolean;
    value: {
        quote?: undefined;
        history?: undefined;
        status: string;
    };
} | {
    ok: boolean;
    value: {
        history?: undefined;
        status: string;
        quote: import("./us-market.ts").UsQuote;
    };
} | {
    ok: boolean;
    value: {
        quote?: undefined;
        status: string;
        history: import("./market.ts").MarketHistory;
    };
}>;
export declare function createUsRoute(options: UsGate): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
