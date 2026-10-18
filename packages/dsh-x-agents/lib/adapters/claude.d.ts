import type { NativeDiscovery } from '../types.ts';
export declare const CLAUDE_SDK_VERSION = "0.3.302";
export declare function createClaudeAdapter({ spawn, config }?: any): {
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
        sandbox: {
            owner: string;
            nativePermissionsAreSandbox: boolean;
        };
        limitations: string[];
    }>;
    backendIdentity: string;
    discover: ({ cwd, signal, sandboxPolicy }?: any) => Promise<NativeDiscovery>;
    discoverModels: ({ cwd, signal, sandboxPolicy }?: any) => Promise<{
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
    } | {
        authenticated: boolean | null;
        capabilities: Readonly<Record<string, unknown>>;
        modelCatalog?: Record<string, unknown>;
        available: boolean;
        version: string;
        models: {
            id: any;
            label: any;
        }[];
        authentication: {
            state: string;
            source: string;
            reason: string;
        };
        reason: string;
    }>;
    run: ({ prompt, model, cwd, nativeSessionId, sandboxPolicy, signal, onEvent, requestPermission, requestInput }?: any) => Promise<{
        nativeSessionId: any;
        status: any;
        summary: any;
        reason?: any;
        usage?: any;
    }>;
};
