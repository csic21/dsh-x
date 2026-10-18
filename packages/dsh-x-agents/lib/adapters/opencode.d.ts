export declare function createOpenCodeAdapter({ fetch, config, managedScope }?: any): {
    id: string;
    transport: string;
    backendIdentity: string;
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
        authDiscovery: true;
        sandbox: false;
        automaticReplay: false;
        childPermissions: false;
        childInput: false;
        permissionScopes: string[];
        permissionPolicy: "native-server";
        limitations: string[];
    }>;
    discover: (options?: any) => Promise<{
        available: boolean;
        version: any;
        authenticated: boolean;
        providerAuthentication: string;
        models: any;
        capabilities: {
            nativeSessions: true;
            resume: true;
            streaming: true;
            tools: true;
            plans: true;
            usage: true;
            cancel: true;
            models: true;
            authDiscovery: true;
            sandbox: false;
            automaticReplay: false;
            childPermissions: false;
            childInput: false;
            permissionScopes: string[];
            permissionPolicy: "native-server";
            limitations: string[];
            permissions: boolean;
            input: boolean;
        };
        reason: string | undefined;
    } | {
        available: boolean;
        version: null;
        authenticated: boolean | null;
        models: never[];
        reason: string;
        capabilities: {
            nativeSessions: true;
            resume: true;
            streaming: true;
            tools: true;
            plans: true;
            usage: true;
            cancel: true;
            models: true;
            authDiscovery: true;
            sandbox: false;
            automaticReplay: false;
            childPermissions: false;
            childInput: false;
            permissionScopes: string[];
            permissionPolicy: "native-server";
            limitations: string[];
            permissions: any;
            input: any;
        };
    }>;
    run: ({ prompt, model, cwd, nativeSessionId, signal, onEvent, requestPermission, requestInput, sandboxPolicy, trustedExternalRuntime }?: any) => Promise<{
        nativeSessionId: null;
        status: string;
        summary: string;
        reason: any;
    } | {
        nativeSessionId: any;
        status: string;
        summary: string;
        usage?: any;
        reason?: undefined;
    } | {
        nativeSessionId: any;
        status: string;
        summary: string;
        reason: string;
    }>;
};
