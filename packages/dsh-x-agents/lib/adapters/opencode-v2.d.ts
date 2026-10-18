import type { NativeDiscovery } from '../types.ts';
export declare function createOpenCodeV2Adapter({ fetch, config, managedScope }?: any): {
    id: string;
    transport: string;
    backendIdentity: string;
    capabilities: Readonly<{
        nativeSessions: true;
        resume: true;
        streaming: true;
        tools: true;
        plans: false;
        permissions: true;
        input: false;
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
    discover: (opts?: any) => Promise<NativeDiscovery>;
    run: ({ prompt, model, cwd, nativeSessionId, signal, onEvent, requestPermission, sandboxPolicy, trustedExternalRuntime }?: any) => Promise<{
        nativeSessionId: any;
        status: any;
        summary: string;
        reason?: any;
        usage?: any;
    }>;
};
