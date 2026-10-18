/** One untrusted JSON payload admitted to an authenticated route; handlers validate every field they read. */
export type BrowserRoutePayload = Record<string, unknown>;
/** Responder envelope for one authenticated route call. */
export type BrowserRouteResult = {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: {
        code: unknown;
        message: string;
        details: Record<string, never>;
    };
};
/** One route registered with the official authenticated connection service. */
export interface BrowserRoute {
    path: string;
    methods: string[];
    requestBody: 'buffered';
    fetch(request: Request): Promise<Response>;
}
/** Routes are admitted by the official authenticated connection service, then capability-bound here. */
export declare function createBrowserRoute(method: string, handler: (payload: BrowserRoutePayload) => unknown | Promise<unknown>, fields: readonly string[]): BrowserRoute;
