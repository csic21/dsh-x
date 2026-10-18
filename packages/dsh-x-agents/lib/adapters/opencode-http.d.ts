export declare function loopbackEndpoint(value: any): string;
export declare function failure(code: any, message: any): Error & {
    code: any;
};
export declare function aborted(): Error & {
    name: string;
    code: string;
};
export declare function abortable(promise: any, signal: any): Promise<any>;
export declare function delay(ms: any, signal: any): Promise<void>;
export declare function createRedactor(config: any): {
    clean: any;
    text: (value: any) => string;
};
export declare function createHttp({ fetch, config, endpoint }: any): (path: any, { method, body, cwd, signal, stream, timeout, authenticate }?: any) => Promise<any>;
export declare function consumeSse(body: any, onEvent: any, signal: any, maxBytes?: number): Promise<void>;
export declare function resolveSchema(spec: any, schema: any): any;
export declare function findRoute(spec: any, pattern: string, method: string): any;
