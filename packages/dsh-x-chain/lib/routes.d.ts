/**
 * The authenticated JSON route the settings page reads.
 *
 * It mirrors the official connection envelope: one buffered POST carrying
 * `{ type: 'client-request', method, rpcId, payload }`, answered with
 * `{ type: 'server-response', rpcId, result }`. No other method or shape is
 * accepted, and the payload must be empty.
 *
 * @module dsh-x-chain/routes
 */
/** One route registered with the official authenticated connection service. */
export interface ChainRoute {
    path: string;
    methods: string[];
    requestBody: 'buffered';
    fetch(request: Request): Promise<Response>;
}
/**
 * Build the stats route.
 * @param endpoint - the endpoint name under `/api/`.
 * @param handler - produces the snapshot.
 * @returns a route for `connection.fetch.register`.
 */
export declare function createStatsRoute(endpoint: string, handler: () => unknown): ChainRoute;
