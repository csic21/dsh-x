import type { MarketProviderSource } from './market-rpc.ts';
import type { MarketHistory } from './market.ts';
import type { InstrumentSearchGate } from './search-rpc.ts';
import type { WatchSignalScheduler } from './watch-signal-scheduler.ts';
export declare const WATCH_SCHEDULE_ENDPOINT = "dsh-x-finance.watch-schedule";
export type WatchScheduleRequest = {
    action: 'get' | 'disable' | 'run';
    scope: string;
} | {
    action: 'enable';
    scope: string;
    symbols: string[];
    consent: true;
} | {
    action: 'sync';
    scope: string;
    symbols: string[];
};
/** Reject, rather than silently truncate, duplicates, extras and oversized lists. */
export declare function scheduleSymbols(input: unknown): string[];
export declare function parseWatchScheduleRequest(input: unknown): WatchScheduleRequest;
/** Only register this exact route on the official shared Connection owner bridge. */
export declare function createWatchScheduleHandler(scheduler: WatchSignalScheduler): (endpoint: unknown, payload: unknown, signal: AbortSignal | undefined, peer: any) => Promise<{
    ok: boolean;
    error: {
        code: string;
        message: string;
        details: {};
    };
} | {
    ok: boolean;
    value: import("./watch-signal-scheduler.ts").WatchScheduleState;
}>;
export declare function createWatchScheduleRoute(scheduler: WatchSignalScheduler): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
export interface ScheduleRpcOptions {
    market?: MarketProviderSource;
    search: InstrumentSearchGate;
    now?: () => number;
    /** Rechecked at each boundary; includes consent, scope, generation and source. */
    allowed: () => Promise<boolean>;
    onHistory: (history: MarketHistory) => void;
}
/** Internal adapter for the SAME scanner as the browser. Never a public route. */
export declare function createWatchScheduleRpc(options: ScheduleRpcOptions): {
    call(channel: string, endpoint: string, payload: any, signal: AbortSignal): Promise<{
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
            quantScan?: undefined;
            overview?: undefined;
            breadth?: undefined;
            quotes?: undefined;
            history?: undefined;
            intraday?: undefined;
            csi300Funds?: undefined;
            global?: undefined;
            hotScan?: undefined;
            predictScan?: undefined;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            status: string;
            quantScan: import("./quant-scan.ts").QuantScanResult | null;
            overview?: undefined;
            breadth?: undefined;
            source?: undefined;
            quotes?: undefined;
            history?: undefined;
            intraday?: undefined;
            csi300Funds?: undefined;
            global?: undefined;
            hotScan?: undefined;
            predictScan?: undefined;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            status: string;
            overview: import("./market.ts").MarketOverview;
            breadth?: undefined;
            source?: undefined;
            quotes?: undefined;
            history?: undefined;
            intraday?: undefined;
            csi300Funds?: undefined;
            global?: undefined;
            hotScan?: undefined;
            predictScan?: undefined;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            overview?: undefined;
            status: string;
            breadth: import("./market.ts").MarketBreadth;
            source?: undefined;
            quotes?: undefined;
            history?: undefined;
            intraday?: undefined;
            csi300Funds?: undefined;
            global?: undefined;
            hotScan?: undefined;
            predictScan?: undefined;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            overview?: undefined;
            breadth?: undefined;
            status: string;
            source: string;
            quotes: import("./market.ts").MarketQuote[];
            history?: undefined;
            intraday?: undefined;
            csi300Funds?: undefined;
            global?: undefined;
            hotScan?: undefined;
            predictScan?: undefined;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            overview?: undefined;
            breadth?: undefined;
            source?: undefined;
            quotes?: undefined;
            status: string;
            history: MarketHistory;
            intraday?: undefined;
            csi300Funds?: undefined;
            global?: undefined;
            hotScan?: undefined;
            predictScan?: undefined;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            overview?: undefined;
            breadth?: undefined;
            source?: undefined;
            quotes?: undefined;
            history?: undefined;
            status: string;
            intraday: import("./market.ts").MarketIntraday;
            csi300Funds?: undefined;
            global?: undefined;
            hotScan?: undefined;
            predictScan?: undefined;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            overview?: undefined;
            breadth?: undefined;
            source?: undefined;
            quotes?: undefined;
            history?: undefined;
            intraday?: undefined;
            status: string;
            csi300Funds: import("./market.ts").Csi300FundShare;
            global?: undefined;
            hotScan?: undefined;
            predictScan?: undefined;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            overview?: undefined;
            breadth?: undefined;
            source?: undefined;
            quotes?: undefined;
            history?: undefined;
            intraday?: undefined;
            csi300Funds?: undefined;
            status: string;
            global: import("./global.ts").GlobalMarketOverview;
            hotScan?: undefined;
            predictScan?: undefined;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            overview?: undefined;
            breadth?: undefined;
            source?: undefined;
            quotes?: undefined;
            history?: undefined;
            intraday?: undefined;
            csi300Funds?: undefined;
            global?: undefined;
            status: string;
            hotScan: import("./hot.ts").HotScanResult;
            predictScan?: undefined;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            overview?: undefined;
            breadth?: undefined;
            source?: undefined;
            quotes?: undefined;
            history?: undefined;
            intraday?: undefined;
            csi300Funds?: undefined;
            global?: undefined;
            hotScan?: undefined;
            status: string;
            predictScan: import("./predict.ts").PredictScanResult;
            tailScan?: undefined;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            overview?: undefined;
            breadth?: undefined;
            source?: undefined;
            quotes?: undefined;
            history?: undefined;
            intraday?: undefined;
            csi300Funds?: undefined;
            global?: undefined;
            hotScan?: undefined;
            predictScan?: undefined;
            status: string;
            tailScan: import("./tail-scan.ts").TailScanResult;
            board?: undefined;
        };
    } | {
        ok: boolean;
        value: {
            quantScan?: undefined;
            overview?: undefined;
            breadth?: undefined;
            source?: undefined;
            quotes?: undefined;
            history?: undefined;
            intraday?: undefined;
            csi300Funds?: undefined;
            global?: undefined;
            hotScan?: undefined;
            predictScan?: undefined;
            tailScan?: undefined;
            status: string;
            board: import("./market.ts").BoardDetail;
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
            results: import("./instrument-search.ts").InstrumentMatch[];
        };
    }>;
};
