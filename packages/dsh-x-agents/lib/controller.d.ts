export declare const RUNTIMES: readonly string[];
export declare const defaultCatalog: () => {
    id: string;
    label: string | undefined;
    transport: string;
    available: null;
    authenticated: null;
    version: null;
    reason: string;
    models: never[];
    capabilities: {
        [k: string]: boolean;
    };
}[];
export declare function validateRun(args: any): void;
export declare function createAgentsController({ store, adapter, cwdOf, policyOf, approve, askInput, beforeDispatch, bindBrowser, trustedExternalRuntime, now, modelTtlMs }: any): {
    snapshot: (sessionId: any) => {
        scope: any;
        sessionId: any;
        revision: any;
        catalog: any;
        operation: any;
        task: any;
        history: any;
    };
    inspect: (exec: any) => Promise<{
        scope: any;
        sessionId: any;
        revision: any;
        catalog: any;
        operation: any;
        task: any;
        history: any;
    }>;
    models: (args: any, exec: any) => Promise<{
        scope: any;
        sessionId: any;
        revision: any;
        catalog: any;
        operation: any;
        task: any;
        history: any;
        modelRuntime: any;
    }>;
    run: (args: any, exec: any) => Promise<{
        scope: any;
        sessionId: any;
        revision: any;
        catalog: any;
        operation: any;
        task: any;
        history: any;
    }>;
    cancel: (args: any) => {
        scope: any;
        sessionId: any;
        revision: any;
        catalog: any;
        operation: any;
        task: any;
        history: any;
    };
    isRunning: (sessionId: any) => boolean;
    dispose: () => Promise<void>;
};
