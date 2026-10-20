/** One route registered with the official authenticated connection service. */
export interface PetRoute {
    path: string;
    methods: string[];
    requestBody: 'buffered';
    fetch(request: Request): Promise<Response>;
}
/**
 * The pet list/selection route: one buffered JSON request, one JSON response.
 * Every field is validated by the handler; the route only checks the envelope.
 */
export declare function createPetRoute(endpoint: string, handler: (payload: Record<string, unknown>) => unknown | Promise<unknown>, allowed: readonly string[]): PetRoute;
/**
 * The detached pet document: no JSON envelope, no Client runtime. The page is
 * opened in its own window and reads `/api/dsh-x-pet/state` from the Host.
 */
export declare function createPetPageRoute(endpoint: string, render: () => string): PetRoute;
/**
 * The atlas route returns the sheet itself as image bytes, so the browser can
 * hand it straight to `Image`/CSS without base64 expansion. It accepts the
 * same authenticated envelope, but answers with `image/*` rather than JSON.
 */
export declare function createAtlasRoute(endpoint: string, load: (id: string) => Promise<{
    bytes: Uint8Array;
    mime: string;
}>): PetRoute;
