/** One registered client RPC endpoint: one buffered JSON request and one JSON response. */
export interface CodeRoute {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: Request): Promise<Response>;
}
export declare function createCodeRoute<Args extends Record<string, unknown>>(endpoint: string, handler: (args: Args & {
    signal: AbortSignal;
}) => unknown, allowed: string[]): CodeRoute;
