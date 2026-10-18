/** Official Grok Build ACP v1; every process must be owned and confined by spawn. */
export declare function createGrokAdapter({ spawn, config }?: any): {
    id: string;
    transport: string;
    capabilities: Readonly<{
        nativeSessions: true;
        resume: true;
        streaming: true;
        tools: true;
        plans: true;
        permissions: true;
        input: true;
        usage: true;
        cancel: true;
        models: true;
        authDiscovery: false;
        permissionScopes: string[];
        limitations: string[];
    }>;
    backendIdentity: string;
    discover: ({ cwd, signal }?: any) => Promise<{
        available: boolean;
        authenticated: boolean | null;
        version?: string | null;
        models: import("../types.ts").NativeModel[];
        capabilities: Readonly<Record<string, unknown>>;
        modelCatalog?: Record<string, unknown>;
        authentication?: {
            state: string;
            source: string;
            reason?: string;
        };
        reason: string;
    }>;
    discoverModels: ({ cwd, signal, sandboxPolicy }?: any) => Promise<{
        available: boolean;
        version: string;
        authenticated: null;
        models: any;
        capabilities: {
            nativeSessions: true;
            resume: true;
            streaming: true;
            tools: true;
            plans: true;
            permissions: true;
            input: true;
            usage: true;
            cancel: true;
            authDiscovery: false;
            permissionScopes: string[];
            limitations: string[];
            models: boolean;
        };
        authentication: {
            state: string;
            source: string;
        };
    }>;
    run: ({ prompt, model, cwd, nativeSessionId, sandboxPolicy, signal, onEvent, requestPermission, requestInput }?: any) => Promise<{
        nativeSessionId: any;
        status: any;
        summary: any;
        reason?: any;
        usage?: any;
    }>;
};
