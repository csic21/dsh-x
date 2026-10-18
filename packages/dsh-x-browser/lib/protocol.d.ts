/** Bounded JSON value crossing the browser bridge; identical to the official `JsonValue`. */
export type BrowserJson = null | boolean | number | string | BrowserJson[] | {
    [key: string]: BrowserJson;
};
/** Shared finite protocol. Never accepts JavaScript, selectors, CDP or arbitrary IPC. */
export declare const ACTIONS: readonly string[];
export declare const NAVIGATION: Set<string>;
export declare const MAX_RESULT_BYTES: number;
/** Error carrying a stable browser protocol code; the host maps it to a tool failure. */
export interface BrowserFailure extends Error {
    code: string;
}
/** One validated finite browser command; only the fields its action allows are present. */
export interface BrowserCommand {
    action: string;
    url?: string;
    target?: string;
    text?: string;
    x?: number;
    y?: number;
    key?: string;
}
export declare function fail(code: string, message: string): BrowserFailure;
export declare function identifier(value: unknown, label?: string): string;
export declare function parseAddress(value: unknown, applicationOrigin?: string | null): string;
export declare function validateCommand(raw: unknown, applicationOrigin?: string | null): BrowserCommand;
export declare function boundedResult(value: unknown): BrowserJson;
/** Only origin/path may cross into a model result; query/hash can contain login secrets. */
export declare function modelUrl(value: unknown): string;
