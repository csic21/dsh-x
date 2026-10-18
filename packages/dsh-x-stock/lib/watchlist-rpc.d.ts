export declare function createWatchlistHandler({ provider, now }?: any): (endpoint: any, payload: any, signal: any, peer: any) => Promise<{
    ok: boolean;
    error: {
        code: any;
        message: any;
        details: {};
    };
} | {
    ok: boolean;
    value: {
        source: null;
        quotes: any;
    };
} | {
    ok: boolean;
    value: {
        source: string;
        quotes: any[];
    };
}>;
export declare function createWatchlistRoute(options?: any): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
export declare function createScopeRoute(readScope: any): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
