/** One route registered with the official authenticated connection service. */
export interface UiRoute {
    path: string;
    methods: string[];
    requestBody: 'buffered';
    fetch(request: Request): Promise<Response>;
}
/**
 * The appearance route: one buffered JSON request, one JSON response. The route
 * checks only the envelope; the handler validates every value it stores.
 */
export declare function createUiRoute(endpoint: string, handler: (payload: Record<string, unknown>) => unknown | Promise<unknown>, allowed: readonly string[]): UiRoute;
