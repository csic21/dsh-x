export declare function ownedEnvironment(root: any, content: any, password: any): Record<string, string | undefined>;
export declare function freeModels(providers: any): {
    id: string;
    free: boolean;
    label: string;
    providerID: string;
    modelID: string;
}[];
export declare function runtimeConfig(model: any, mcp?: any): {
    username: string;
    enabled_providers: string[];
    provider?: {
        opencode: {
            whitelist: any[];
        };
    } | undefined;
    plugin: never[];
    instructions: never[];
    skills: {
        paths: never[];
        urls: never[];
    };
    share: string;
    snapshot: boolean;
    autoupdate: boolean;
    lsp: boolean;
    formatter: boolean;
    model: any;
    small_model: any;
    default_agent: string;
    permission: {
        '*': string;
        dsh_browser_tabs?: string | undefined;
        dsh_browser_action?: string | undefined;
        task: string;
    };
    agent: {
        build: {
            disable: boolean;
        };
        plan: {
            disable: boolean;
        };
        general: {
            disable: boolean;
        };
        explore: {
            disable: boolean;
        };
        dsh_browser: {
            mode: string;
            model: any;
            permission: {
                '*': string;
                dsh_browser_tabs?: string | undefined;
                dsh_browser_action?: string | undefined;
                task: string;
            };
        };
        title: {
            disable: boolean;
            model: any;
        };
        summary: {
            disable: boolean;
            model: any;
        };
        compaction: {
            model: any;
            permission: {
                '*': string;
            };
        };
    };
    compaction: {
        auto: boolean;
        prune: boolean;
    };
    mcp: {
        dsh_browser: any;
    } | {
        dsh_browser?: undefined;
    };
};
export declare function validateEffectiveConfig(actual: any, expected: any): void;
export declare function closeOwnedProcess({ child, mcp, browser, timeoutMs }: any): Promise<void>;
export declare function closeOwnedState({ root, remove, ...options }: any): Promise<void>;
export declare function createOwnedClose(operation: any): () => any;
export declare function retainCleanupContext(cleanup: any, original: any, stage: any, promptAttempted: any): any;
export declare function closeAfterOwnedOutcome(native: any, { result, original }?: any): Promise<void>;
export declare function createOwnedOpenCodeAdapter({ spawn, fetch, config }?: any): {
    id: string;
    transport: string;
    backendIdentity: string;
    capabilities: Readonly<{
        nativeSessions: true;
        resume: false;
        streaming: true;
        tools: true;
        plans: true;
        permissions: true;
        input: false;
        usage: true;
        cancel: true;
        models: true;
        authDiscovery: false;
        ownedBrowser: true;
        deferredInitialization: true;
        permissionScopes: string[];
        limitations: string[];
    }>;
    discover: (options?: any) => Promise<{
        available: boolean;
        version: string;
        authenticated: null;
        models: never[];
        capabilities: Readonly<{
            nativeSessions: true;
            resume: false;
            streaming: true;
            tools: true;
            plans: true;
            permissions: true;
            input: false;
            usage: true;
            cancel: true;
            models: true;
            authDiscovery: false;
            ownedBrowser: true;
            deferredInitialization: true;
            permissionScopes: string[];
            limitations: string[];
        }>;
        authentication: {
            state: string;
            source: string;
        };
        reason: string;
    } | {
        authentication?: undefined;
        available: boolean;
        version: null;
        authenticated: null;
        models: never[];
        capabilities: Readonly<{
            nativeSessions: true;
            resume: false;
            streaming: true;
            tools: true;
            plans: true;
            permissions: true;
            input: false;
            usage: true;
            cancel: true;
            models: true;
            authDiscovery: false;
            ownedBrowser: true;
            deferredInitialization: true;
            permissionScopes: string[];
            limitations: string[];
        }>;
        reason: any;
    }>;
    discoverModels: (options?: any) => Promise<{
        available: boolean;
        version: string;
        authenticated: null;
        models: {
            id: string;
            free: boolean;
            label: string;
            providerID: string;
            modelID: string;
        }[] | undefined;
        capabilities: Readonly<{
            nativeSessions: true;
            resume: false;
            streaming: true;
            tools: true;
            plans: true;
            permissions: true;
            input: false;
            usage: true;
            cancel: true;
            models: true;
            authDiscovery: false;
            ownedBrowser: true;
            deferredInitialization: true;
            permissionScopes: string[];
            limitations: string[];
        }>;
        authentication: {
            state: string;
            source: string;
        };
        providerAuthentication: string;
        modelCatalog: {
            source: string;
        };
    }>;
    discoverProtocol: (options?: any) => Promise<{
        available: boolean;
        version: any;
        model: any;
        source: string;
        modelRequests: number;
    }>;
    run: (options?: any) => Promise<any>;
};
