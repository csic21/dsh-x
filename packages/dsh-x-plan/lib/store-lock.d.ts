export declare const runtimeId: `${string}-${string}-${string}-${string}-${string}`;
export declare function inspectLock(dir: any, kind: any): any;
export declare function acquireLock(dir: any, kind: any, options?: any): {
    token: `${string}-${string}-${string}-${string}-${string}`;
    runtimeId: `${string}-${string}-${string}-${string}-${string}`;
    pid: number;
    hostname: string;
    startedAt: string;
    operation?: any;
};
export declare function releaseLock(dir: any, kind: any, token: any): void;
export declare function retainLock(dir: any, kind: any, token: any, reason: any): any;
export declare function withStoreLock(dir: any, callback: any): any;
export declare function assertRecoverable(lock: any, expectedToken: any): void;
