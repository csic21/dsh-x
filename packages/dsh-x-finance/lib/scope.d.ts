export declare function loadProfileScope(profileDirectory: any): Promise<string>;
export declare function createScopeRoute(readScope: any): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
