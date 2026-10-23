export declare const failure: (code: string, message: string) => {
    ok: boolean;
    error: {
        code: string;
        message: string;
        details: {};
    };
};
export declare function createRpcRoute(endpoint: any, handle: any): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
