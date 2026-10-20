/** One finished CLI invocation; JSON failures still exit 0, so callers must read the envelope. */
export interface CliResult {
    code: number;
    stdout: string;
    stderr: string;
}
export interface CliRunnerOptions {
    command: string;
    args: string[];
    signal?: AbortSignal;
    timeoutMs: number;
    env?: NodeJS.ProcessEnv;
}
/** Injected in tests; the production runner is a real child process. */
export type CliRunner = (options: CliRunnerOptions) => Promise<CliResult>;
/** Spawn without a shell: arguments never pass through command-line parsing. */
export declare const spawnRunner: CliRunner;
export interface AgentBrowserCliOptions {
    command?: string;
    sessionPrefix?: string;
    extraArgs?: readonly string[];
    runner?: CliRunner;
    timeoutMs?: number;
    versionTimeoutMs?: number;
    env?: NodeJS.ProcessEnv;
}
export interface InvokeOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}
/** One CLI facade per plugin instance; version checks and session names are shared. */
export declare function createAgentBrowserCli(options?: AgentBrowserCliOptions): {
    command: string;
    extraArgs: string[];
    sessionName: (profile: string, sessionId: string) => string;
    version: () => Promise<void>;
    invoke: <T = unknown>(session: string, args: readonly string[], invokeOptions?: InvokeOptions) => Promise<T>;
};
export type AgentBrowserCli = ReturnType<typeof createAgentBrowserCli>;
