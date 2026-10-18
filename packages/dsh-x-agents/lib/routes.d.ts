export declare function createAgentsRoute(endpoint: any, handler: any): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
