import type { Readable, Writable } from 'node:stream';
export type NativeRuntime = 'codex' | 'opencode' | 'claude' | 'grok';
export interface NativeModel {
    id: string;
    label: string;
    free?: boolean;
}
export interface NativeDiscovery {
    available: boolean;
    authenticated: boolean | null;
    version?: string | null;
    models: NativeModel[];
    capabilities: Readonly<Record<string, unknown>>;
    reason?: string | null;
    modelCatalog?: Record<string, unknown>;
    authentication?: {
        state: string;
        source: string;
        reason?: string;
    };
}
export interface Deferred<T = any> {
    promise: Promise<T>;
    resolve(value?: T): void;
    reject(reason?: unknown): void;
    settled?: boolean;
    confirmed?: boolean;
    onResult?: (value: any) => void;
}
export interface NativeProcess {
    stdin?: Writable;
    stdout?: Readable;
    stderr?: Readable;
    done: Promise<{
        exitCode: number | null;
        signal: string | null;
    }>;
    terminate(): unknown;
    waitForExit?(signal?: AbortSignal): Promise<boolean>;
}
export interface SpawnSpec {
    argv: string[];
    cwd: string;
    env?: Record<string, string | undefined>;
    signal?: AbortSignal;
    graceMs?: number;
    stdio?: {
        stdin: string;
        stdout: string;
        stderr: string;
    };
}
export type NativeSpawn = (spec: SpawnSpec) => NativeProcess | Promise<NativeProcess>;
