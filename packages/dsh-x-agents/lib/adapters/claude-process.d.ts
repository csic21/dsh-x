import type { Deferred } from '../types.ts';
import { EventEmitter } from 'node:events';
import { Transform } from 'node:stream';
export declare const failure: (message: any, code?: string) => Error & {
    code: string;
};
export declare function deferred(): Deferred;
export declare function abortable(promise: any, signal: any): Promise<any>;
export declare function deadline(promise: any, ms: any, signal: any): Promise<any>;
/**
 * The SDK requires a synchronous SpawnedProcess. The host has an asynchronous
 * managed-range spawner. This stream shell never invokes child_process itself.
 * Range cleanup includes a spawn still awaiting confinement, not just root exit.
 */
export declare class ClaudeProcessOwner {
    spawn: any;
    options: any;
    processes: any[];
    fatal: any;
    closed: boolean;
    nativeResultReceived: boolean;
    requestController: any;
    cancelledRequests: Set<any>;
    constructor(spawn: any, options: any);
    create: (native: any) => EventEmitter<any> & {
        stdin: import("node:stream").Writable;
        stdout: import("node:stream").Readable;
        killed: boolean;
        exitCode: number | null;
        signalCode?: NodeJS.Signals | null;
        kill: (signal: NodeJS.Signals) => boolean;
        on: {
            (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
            (event: 'error', listener: (error: Error) => void): void;
        };
        once: {
            (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
            (event: 'error', listener: (error: Error) => void): void;
        };
        off: {
            (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
            (event: 'error', listener: (error: Error) => void): void;
        };
    } & {
        stdout: Transform;
    };
    guard(promise: any, signal: any): Promise<any>;
    close(query?: any): Promise<void>;
}
