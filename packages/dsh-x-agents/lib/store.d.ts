export declare const ACTIVE: Set<string>;
export declare const STATES: Set<string>;
export declare const fail: (code: any, message: any) => Error & {
    code: any;
};
export declare function validSession(value: any): string;
export declare function safeText(value: any, max?: number): string;
export declare function safeData(value: any, depth?: number): any;
export declare function createTaskStore(profileDirectory: any): {
    scope: string;
    root: string;
    hostId: `${string}-${string}-${string}-${string}-${string}`;
    read: (sessionId: any) => any;
    snapshot: (sessionId: any) => any;
    claim: (sessionId: any, { taskId, expectedRevision, expectedScope, runtime, model, prompt, cwd, backendIdentity }: any) => any;
    event: (sessionId: any, taskId: any, runId: any, event: any) => any;
    state: (sessionId: any, taskId: any, runId: any, state: any, fields?: {}) => any;
    release: (sessionId: any, taskId: any, runId: any) => void;
    quarantine: (sessionId: any, reason: any, runtime?: string) => void;
    claimOperation: (sessionId: any, runtime: any) => `${string}-${string}-${string}-${string}-${string}`;
    releaseOperation: (sessionId: any, operationId: any) => void;
    operationLock: (sessionId: any) => {
        kind: string;
        runtime: any;
        state: string;
        reason: string;
    } | null;
    hasLock: (sessionId: any) => boolean;
};
