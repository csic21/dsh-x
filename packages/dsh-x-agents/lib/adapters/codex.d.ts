import type { NativeDiscovery } from '../types.ts';
/**
 * Create a native Codex app-server adapter. `spawn` must own the entire process
 * range; the host additionally confines run processes to its effective policy.
 * Discovery uses the same injected policy and never starts a model turn.
 */
export declare function createCodexAdapter({ spawn, config }?: any): {
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
        permissionScopes: string[];
        limitations: string[];
    }>;
    discover: ({ cwd, signal }?: any) => Promise<NativeDiscovery>;
    run: ({ prompt, model, cwd, nativeSessionId, sandboxPolicy, signal, onEvent, requestPermission, requestInput }?: any) => Promise<{
        nativeSessionId: any;
        status: any;
        summary: string;
        reason?: any;
        usage?: any;
    }>;
};
