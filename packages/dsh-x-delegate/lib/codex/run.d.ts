/**
 * Codex delegation over `codex exec --json`.
 *
 * The official `@deepseek-ai/dsh-subagent-codex` drives `codex app-server` and
 * pins both the npm payload (`@openai/codex@0.153.4`, ~275 MB per platform)
 * and the protocol baseline in source constants, so it cannot use a Codex the
 * user already installed. This backend instead runs the `exec --json`
 * non-interactive surface, whose newline-delimited event stream is stable
 * across Codex releases and which resolves the binary from configuration,
 * `PATH`, or a bundled payload.
 *
 * Observed event stream (`codex exec --json`):
 *
 * ```text
 * {"type":"thread.started","thread_id":"..."}
 * {"type":"turn.started"}
 * {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"..."}}
 * {"type":"turn.completed","usage":{...}}
 * {"type":"turn.failed","error":{"message":"..."}}
 * {"type":"error","message":"..."}
 * ```
 *
 * @module dsh-x-delegate/codex/run
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import { type SubagentRun, type SubagentStartRequest, type SubagentStopReason } from '@deepseek-ai/dsh-subagent';
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
/** Default grace between SIGTERM and SIGKILL on disposal. */
export declare const DEFAULT_DISPOSE_GRACE_MS = 3000;
/** Sandbox mode passed to `codex exec --sandbox`. */
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
/** Every accepted {@link CodexSandboxMode}. */
export declare const CODEX_SANDBOX_MODES: readonly ['read-only', 'workspace-write', 'danger-full-access'];
/** Fully resolved inputs for one Codex delegation. */
export interface CodexRunSpec {
    /** Absolute path or bare name of the `codex` executable. */
    readonly command: string;
    /** Optional `--model` value. */
    readonly model?: string | undefined;
    /** Sandbox mode. */
    readonly sandbox: CodexSandboxMode;
    /** Skip approval prompts; required for unattended runs. */
    readonly fullAuto: boolean;
    /** Absolute working directory. */
    readonly cwd: string;
    /** Extra environment entries layered over the scrubbed parent environment. */
    readonly env: Record<string, string>;
    /** Grace between termination tiers. */
    readonly disposeGraceMs: number;
    /** Spawn function from the subprocess seam. */
    readonly spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle;
    /** Host sink for original failures. */
    readonly onError?: ((error: Error, stopReason: SubagentStopReason) => void) | undefined;
}
/** Structured failure facts for one Codex run. */
export interface CodexFailureFacts {
    readonly stage: 'spawn' | 'stream' | 'process' | 'teardown';
    readonly outcome?: SubprocessOutcome | undefined;
}
/** Render fixed safe failure text. */
export declare function codexFailureDiagnostic(facts: CodexFailureFacts): string;
/**
 * Build the `codex exec` argument vector.
 * @param spec - the resolved run inputs.
 * @returns argv excluding the executable itself.
 */
export declare function codexExecArgv(spec: Pick<CodexRunSpec, 'model' | 'sandbox' | 'fullAuto' | 'cwd'>): string[];
/**
 * Resolve the Codex executable.
 *
 * An explicit path wins; a bare name is passed through for the subprocess seam
 * to resolve against the scrubbed `PATH`; `bundled` selects the payload
 * installed beside this package when one exists.
 *
 * @param configured - the configured value.
 * @param bundledManifestPath - optional absolute path to a bundled package manifest.
 * @returns the value to spawn.
 */
export declare function resolveCodexCommand(configured: string, bundledManifestPath?: string): string;
/** One parsed `codex exec --json` line. */
type CodexEvent = {
    readonly [key: string]: unknown;
};
/**
 * Folds `codex exec --json` events into one assistant answer.
 *
 * Only `agent_message` items contribute. The last non-empty message wins, so a
 * final answer that follows commentary supersedes it; reasoning, tool calls,
 * and errors never become the answer.
 */
export declare class CodexEventFold {
    #private;
    /**
     * Consume one parsed event.
     * @param event - the parsed JSON object for one line.
     */
    push(event: CodexEvent): void;
    /** The selected answer text, or `''`. */
    get answer(): string;
    /** The last failure message the stream reported, if any. */
    get failure(): string | undefined;
}
/**
 * Cooperative teardown for a Codex child: stdin EOF, then termination tiers.
 * @param child - the spawned child handle.
 * @param graceMs - tier-1 window after stdin EOF.
 */
export declare function disposeCodexChild(child: SubprocessHandle, graceMs: number): Promise<void>;
/** Translate harness prompt blocks into one plain-text task. */
export declare function codexPromptText(prompt: readonly ContentBlock[]): string;
/**
 * Start one Codex delegation and publish its run handle.
 * @param request - the subagent start request; its signal is the cancellation channel.
 * @param spec - resolved command, sandbox, and environment inputs.
 * @returns the published run.
 */
export declare function startCodexRun(request: SubagentStartRequest, spec: CodexRunSpec): Promise<SubagentRun>;
export {};
