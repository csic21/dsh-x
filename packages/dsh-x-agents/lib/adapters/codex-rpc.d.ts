import type { Deferred } from '../types.ts';
export declare function deferred(): Deferred;
export declare function failure(message: any, code?: string): Error & {
    code: string;
};
export declare function abortable(promise: any, signal: any): Promise<any>;
/** JSONL request correlation. Responses are independent of slow UI callbacks. */
export declare class CodexRpc {
    child: any;
    requestTimeoutMs: any;
    maxFrameBytes: any;
    maxQueuedEvents: any;
    maxQueuedBytes: any;
    onNotification: any;
    onRequest: any;
    afterRequest: any;
    pending: Map<any, any>;
    serverRequests: Map<any, any>;
    clearedRequests: Set<any>;
    handlers: Set<any>;
    nextId: number;
    buffer: string;
    decoder: any;
    closed: boolean;
    queuedEvents: number;
    queuedBytes: number;
    writeBytes: number;
    notifications: any;
    fatal: any;
    shutdown: any;
    onData: any;
    onStreamError: any;
    onEnd: any;
    drainStderr: any;
    constructor(child: any, { requestTimeoutMs, maxFrameBytes, maxQueuedEvents, maxQueuedBytes, onNotification, onRequest, afterRequest }: any);
    fail(error: any): void;
    guard(promise: any, signal: any): Promise<any>;
    send(message: any): Promise<void>;
    request(method: any, params: any, signal: any): Promise<any>;
    notify(method: any, params: any, signal: any): Promise<void>;
    reserve(bytes: any): void;
    receive(message: any, bytes: any): void;
    invalidateRequest(id: any): void;
    isRequestCleared(id: any): boolean;
    quiesce(): Promise<void>;
    close(): void;
}
/** Managed-range emptiness, rather than the direct child's exit, is required. */
export declare function cleanupCodexChild(child: any, wire: any, cleanupTimeoutMs: any): Promise<void>;
