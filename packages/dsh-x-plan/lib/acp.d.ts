import type { Readable, Writable } from 'node:stream';
export interface AcpOptions {
    spawn: (spec: {
        argv: string[];
        cwd: string;
        env: Record<string, string>;
        signal?: AbortSignal;
        graceMs: number;
        stdio: {
            stdin: 'pipe';
            stdout: 'pipe';
            stderr: 'inherit';
        };
    }) => {
        stdin?: Writable;
        stdout?: Readable;
        terminate?: () => unknown;
        waitForExit?: (signal?: AbortSignal) => Promise<boolean>;
        done?: Promise<unknown>;
    };
    argv: string[];
    cwd: string;
    env?: Record<string, string>;
    prompt?: string;
    signal?: AbortSignal;
    modeId: 'read-only' | 'plan';
    timeoutMs?: number;
    expectedAdapter?: {
        executable: string;
        name: string;
        version: string;
    };
}
export declare const MAX_ACP_LINE_CHARS = 256000;
/**
 * Check an already-installed adapter without sending a model prompt. A session
 * must open using existing CLI credentials, advertise the requested safe mode,
 * and accept it. This verifies adapter behavior, not an OS sandbox or provenance.
 * The returned identity must be supplied as expectedAdapter on the real call.
 *
 * @param {Omit<AcpOptions, 'prompt'>} options
 */
export declare function preflightAcp(options: AcpOptions): Promise<{
    ok: boolean;
    adapter: {
        executable: any;
        name: any;
        version: any;
    };
    modeId: "plan" | "read-only";
    authentication: string;
    permissionDenials: number;
} | {
    adapter: {
        executable: any;
        name: any;
        version: any;
    };
    modeId: "plan" | "read-only";
    authentication: string;
    ok: boolean;
    stopReason: any;
    text: string;
    permissionDenials: number;
}>;
/**
 * One-shot ACP client. Every call repeats the safe-mode handshake and cancels
 * all permission requests. Empty client capabilities expose neither a client
 * filesystem nor client terminals; the adapter still runs as a local process.
 *
 * @typedef {{
 *   spawn: (spec: object) => { stdin: import('node:stream').Writable, stdout: import('node:stream').Readable, terminate?: () => void | Promise<void>, waitForExit?: (signal?: AbortSignal) => Promise<boolean>, done?: Promise<object> },
 *   argv: string[],
 *   cwd: string,
 *   env?: Record<string, string>,
 *   prompt?: string,
 *   signal?: AbortSignal,
 *   modeId: 'read-only' | 'plan',
 *   timeoutMs?: number,
 *   expectedAdapter?: { executable: string, name: string, version: string },
 * }} AcpOptions
 * @param {AcpOptions} options
 */
export declare function runAcpPrompt(options: AcpOptions): Promise<{
    adapter: {
        executable: any;
        name: any;
        version: any;
    };
    modeId: "plan" | "read-only";
    authentication: string;
    ok: boolean;
    stopReason: any;
    text: string;
    permissionDenials: number;
}>;
