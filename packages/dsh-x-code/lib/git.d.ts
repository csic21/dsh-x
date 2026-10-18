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
}
/** Fixed argv only; never invoke a shell, textconv, hooks, or configured filters. */
export declare function createGit(spawn: Spawn): (cwd: string, args: string[], signal: AbortSignal | undefined, maxBytes?: number) => Promise<GitCapture>;
