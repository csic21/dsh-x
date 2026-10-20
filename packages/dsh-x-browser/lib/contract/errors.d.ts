/** Every stable browser failure code the host may map to a tool failure. */
export declare const BROWSER_ERROR_CODES: readonly ['BROWSER_API', 'BROWSER_APPROVAL', 'BROWSER_BINARY_MISSING', 'BROWSER_BUSY', 'BROWSER_CLOSED', 'BROWSER_DAEMON', 'BROWSER_DESKTOP', 'BROWSER_GRANT', 'BROWSER_GUEST', 'BROWSER_HIDDEN', 'BROWSER_HOST', 'BROWSER_INPUT', 'BROWSER_LIMIT', 'BROWSER_OFFLINE', 'BROWSER_OWNER', 'BROWSER_PROTOCOL', 'BROWSER_RESULT', 'BROWSER_REVOKED', 'BROWSER_RPC', 'BROWSER_RUN', 'BROWSER_SCOPE', 'BROWSER_SECRET', 'BROWSER_SESSION', 'BROWSER_STALE', 'BROWSER_TARGET', 'BROWSER_TIMEOUT', 'BROWSER_UNAVAILABLE', 'BROWSER_UNSUPPORTED', 'BROWSER_URL', 'BROWSER_VERSION', 'BROWSER_WORKSPACE'];
export type BrowserErrorCode = (typeof BROWSER_ERROR_CODES)[number];
/** Error carrying a stable browser protocol code; the host maps it to a tool failure. */
export interface BrowserFailure extends Error {
    code: BrowserErrorCode;
}
export declare function fail(code: BrowserErrorCode, message: string): BrowserFailure;
/** True only for errors that carry a known browser code; used to preserve codes across layers. */
export declare function isBrowserFailure(value: unknown): value is BrowserFailure;
