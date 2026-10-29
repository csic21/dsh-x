import type { QuantScanScheduler } from './quant-scan-scheduler.ts';
export declare const QUANT_SCHEDULE_ENDPOINT = "dsh-x-finance.quant-schedule";
export type QuantScheduleRequest = {
    action: 'get' | 'disable';
    scope: string;
} | {
    action: 'enable';
    scope: string;
    consent: true;
};
export declare function parseQuantScheduleRequest(input: unknown): QuantScheduleRequest;
export declare function createQuantScheduleHandler(scheduler: QuantScanScheduler): (endpoint: unknown, payload: unknown, signal: AbortSignal | undefined, peer: any) => Promise<{
    ok: boolean;
    error: {
        code: string;
        message: string;
        details: {};
    };
} | {
    ok: boolean;
    value: import("./quant-scan-scheduler.ts").QuantScheduleState;
}>;
/** Register only behind the official shared Connection owner admission bridge. */
export declare function createQuantScheduleRoute(scheduler: QuantScanScheduler): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
