/**
 * ACP child lifecycle for one delegation: spawn, handshake, authenticate,
 * configure, prompt, and quiescent disposal.
 *
 * Differences from the official provider, each driven by an observed defect:
 *
 * - `authenticate` is attempted from the peer's advertised methods, so agents
 *   such as Grok that require an explicit auth step can start at all.
 * - Session `configOptions` (model, effort, mode) are read and applied through
 *   `session/set_config_option`, so a caller can select a model instead of
 *   inheriting whatever the agent defaults to.
 * - Permission answers use three tiers instead of allow-all / deny-all.
 * - Streamed assistant chunks are grouped by message id, so a replayed or
 *   duplicated chunk cannot duplicate the answer text.
 *
 * @module dsh-x-delegate/acp/run
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import { type SubagentRun, type SubagentStartRequest, type SubagentStopReason } from '@deepseek-ai/dsh-subagent';
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import { type JsonObject, type JsonValue } from './wire.ts';
/** How unattended permission requests are answered. */
export type PermissionPolicy = 
/** Decline every request. */
'deny'
/** Approve read-only tool kinds; decline anything that mutates or executes. */
 | 'read-only'
/** Approve every request that offers an allow option. */
 | 'allow';
/** Every accepted {@link PermissionPolicy}. */
export declare const PERMISSION_POLICIES: readonly ['deny', 'read-only', 'allow'];
/** Default grace between SIGTERM and SIGKILL on disposal. */
export declare const DEFAULT_DISPOSE_GRACE_MS = 3000;
/** Default grace for the child's EOF-driven flush before escalation. */
export declare const DEFAULT_DISPOSE_EOF_GRACE_MS = 6000;
/** Which model the child session should use. */
export interface ModelSelection {
    /** The `configOptions` id to set, usually `model`. */
    readonly configId: string;
    /** The option value to select. */
    readonly value: string;
}
/** Fully resolved inputs for one ACP delegation. */
export interface AcpRunSpec {
    /** Executable to spawn. */
    readonly command: string;
    /** Arguments passed to {@link command}. */
    readonly args: readonly string[];
    /** Absolute working directory for both the process and the ACP session. */
    readonly cwd: string;
    /** Unattended permission policy. */
    readonly permission: PermissionPolicy;
    /** Extra environment entries layered over the scrubbed parent environment. */
    readonly env: Record<string, string>;
    /** Optional session configuration applied after `session/new`. */
    readonly config?: Readonly<Record<string, string>> | undefined;
    /** Optional auth method id to try when the peer advertises one. */
    readonly authMethodId?: string | undefined;
    /** Grace for the child's EOF-driven flush. */
    readonly disposeEofGraceMs: number;
    /** Grace between termination tiers. */
    readonly disposeGraceMs: number;
    /** Spawn function from the subprocess seam. */
    readonly spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle;
    /** Host sink for original failures. */
    readonly onError?: ((error: Error, stopReason: SubagentStopReason) => void) | undefined;
}
/** One permission decision retained for the diagnostic. */
interface PermissionDecision {
    readonly policy: PermissionPolicy;
    readonly request: string;
    readonly decision: 'allowed' | 'denied';
}
/** Map an ACP stop reason to the harness vocabulary. */
export declare function acpStopReason(reason: string): SubagentStopReason;
/** Translate harness prompt blocks into ACP text blocks. */
export declare function toAcpPrompt(prompt: readonly ContentBlock[]): JsonValue[];
/**
 * Accumulates streamed assistant text without duplicating replayed chunks.
 *
 * ACP agents emit `agent_message_chunk` updates. A reconnecting or replaying
 * agent can re-send chunks for the same message id; appending blindly would
 * duplicate the answer. Chunks are therefore grouped per message id, and the
 * final answer is the last non-empty group in arrival order.
 */
export declare class ChunkAccumulator {
    #private;
    /**
     * Add one chunk.
     * @param messageId - the ACP message id, when the agent supplied one.
     * @param text - the chunk text.
     */
    push(messageId: string | undefined, text: string): void;
    /**
     * Select the answer: the last message group, else accumulated anonymous text.
     * @returns the selected text, or `''` when nothing arrived.
     */
    collect(): string;
}
/** Decide one permission request under the configured policy. */
export declare function decidePermission(policy: PermissionPolicy, params: JsonObject): {
    readonly outcome: JsonObject;
    readonly decision: PermissionDecision;
};
/**
 * Cooperative teardown: stdin EOF, then the terminate escalation, then the
 * process owner's exit proof.
 * @param child - the spawned child handle.
 * @param eofGraceMs - tier-1 window after stdin EOF.
 */
export declare function disposeAcpChild(child: SubprocessHandle, eofGraceMs: number): Promise<void>;
/**
 * Start one ACP delegation and publish its run handle.
 * @param request - the subagent start request; its signal is the cancellation channel.
 * @param spec - resolved spawn, policy, and configuration inputs.
 * @returns the published run.
 */
export declare function startAcpRun(request: SubagentStartRequest, spec: AcpRunSpec): Promise<SubagentRun>;
export {};
