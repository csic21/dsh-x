/** Planner and reviewer families. The executor is always the current DSH session. */
export declare const FAMILIES: string[];
/**
 * Launch spec for each family's ACP adapter.
 * Codex read-only mode is the adapter's documented `INITIAL_AGENT_MODE`.
 * Claude's session mode id `plan` restricts its tools. These are adapter modes,
 * not an OS sandbox. Grok must advertise `read-only`; its `plan` mode alone
 * does not protect against shell or subagent writes and is never accepted.
 * Only preinstalled, operator-audited adapters are used; nothing is downloaded.
 */
export declare const AGENT_LAUNCH: {
    codex: {
        bin: string;
        binArgs: never[];
        env: {
            INITIAL_AGENT_MODE: string;
            NO_BROWSER: string;
            DEFAULT_AUTH_REQUEST: string;
        };
        modeId: string;
        documentationUrl: string;
    };
    claude: {
        bin: string;
        binArgs: never[];
        env: {};
        modeId: string;
        documentationUrl: string;
    };
    grok: {
        bin: string;
        binArgs: string[];
        env: {};
        modeId: string;
        documentationUrl: string;
    };
};
/** Reviewer default so the planner does not grade its own plan. */
export declare function defaultReviewer(planner: any): string;
export declare function assertFamily(value: any, label: any): any;
/**
 * Resolve an already-installed ACP executable. The operator is responsible for
 * auditing/pinning that installation; ACP preflight records its advertised
 * identity/version. No package manager or automatic installation is attempted.
 * `DSH_X_ACP_CODEX` / `_CLAUDE` / `_GROK` replace the executable, not its safety policy.
 * @param {'codex'|'claude'|'grok'} family
 * @param {{ resolveExecutable: Function, env?: NodeJS.ProcessEnv, signal?: AbortSignal }} options
 */
export declare function resolveLaunch(family: 'codex' | 'claude' | 'grok', { resolveExecutable, env, signal }: {
    resolveExecutable: Function;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
}): Promise<{
    argv: any[];
    env: any;
    modeId: any;
}>;
