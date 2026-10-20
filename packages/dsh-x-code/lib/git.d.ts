/** One managed subprocess request: fixed argv, scrubbed environment, per-stream stdio. */
export interface SpawnSpec {
    argv: string[];
    cwd: string;
    env: Record<string, string | undefined>;
    signal: AbortSignal;
    graceMs: number;
    stdio: {
        stdin: 'ignore';
        stdout: 'pipe';
        stderr: 'pipe';
    };
}
/** One settled managed subprocess; its streams deliver raw output bytes. */
export interface SpawnHandle {
    stdout: AsyncIterable<Uint8Array> | null;
    stderr: AsyncIterable<Uint8Array> | null;
    done: Promise<{
        exitCode: number | null;
        signal: string | null;
    }>;
}
export type Spawn = (spec: SpawnSpec) => SpawnHandle | Promise<SpawnHandle>;
/** One bounded Git read; `code` stays nullable because a signal can end the process. */
export interface GitCapture {
    output: string;
    error: string;
    ok: boolean;
    code: number | null;
    truncated: boolean;
    bytes?: Buffer;
}
/** One independent fixed-argv read. */
export interface GitCommand {
    args: string[];
    maxBytes?: number;
    binary?: boolean;
}
/** Safety lookups one operation needs before it starts reading. */
export interface GitNeeds {
    ignore?: boolean;
    filters?: boolean;
}
/** A group of reads that share one safety lookup round and may run together. */
export interface GitPrepared {
    read(command: GitCommand): Promise<GitCapture>;
    parallel(commands: GitCommand[]): Promise<GitCapture[]>;
}
/** A Git reader with one fast path for reads that belong to the same operation. */
export interface GitReader {
    (cwd: string, args: string[], signal?: AbortSignal | undefined, maxBytes?: number, binary?: boolean): Promise<GitCapture>;
    prepare(cwd: string, signal: AbortSignal | undefined, needs?: GitNeeds): Promise<GitPrepared>;
}
/** Fixed argv only; never invoke a shell, textconv, hooks, or configured filters. */
export declare function createGit(spawn: Spawn): GitReader;
