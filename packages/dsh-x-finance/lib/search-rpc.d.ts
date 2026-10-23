import type { InstrumentMatch } from './instrument-search.ts';
import type { InstrumentSearchProvider } from './instrument-search-provider.ts';
export interface InstrumentSearchGate {
    enabled: () => boolean | Promise<boolean>;
    provider?: InstrumentSearchProvider;
}
/**
 * Exact-route handler behind the official shared Connection admission bridge.
 * The bridge rejects non-owner peers before this code runs; the explicit check
 * keeps the handler safe when it is called directly in tests or another Host.
 *
 * The directory is part of the plugin's explicitly opt-in local free source:
 * a disabled gate returns `status: 'disabled'` without any network request.
 */
export declare function createSearchHandler({ enabled, provider }: InstrumentSearchGate): (endpoint: any, payload: any, signal: any, peer: any) => Promise<{
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
        enabled: boolean;
        available: boolean;
        source: null;
        results: never[];
    };
} | {
    ok: boolean;
    value: {
        status: string;
        enabled: boolean;
        available: boolean;
        source: string;
        results: InstrumentMatch[];
    };
}>;
export declare function createSearchRoute(options: InstrumentSearchGate): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
