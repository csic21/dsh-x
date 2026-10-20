/** Bounded JSON value crossing the browser bridge; identical to the official `JsonValue`. */
export type BrowserJson = null | boolean | number | string | BrowserJson[] | {
    [key: string]: BrowserJson;
};
/** Serialize once, enforce the byte budget, then return a detached copy. */
export declare function boundedJson(value: unknown, maxBytes?: number): BrowserJson;
