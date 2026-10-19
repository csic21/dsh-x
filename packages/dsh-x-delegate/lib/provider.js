/**
 * Shared provider scaffolding for delegated external agents.
 *
 * Every backend registers on the public `ctx.subagents` seam and advertises no
 * start-time capabilities: an out-of-process child cannot honour
 * `agentOptions`, `agentPreset`, `outputSchema`, or harness-enforced depth.
 *
 * @module dsh-x-delegate/provider
 */
import { assertUsableCwd } from '@deepseek-ai/dsh-subagent';
/** The capability set every external-agent backend advertises. */
export const NO_START_CAPABILITIES = {
    agentOptions: false,
    agentPreset: false,
    outputSchema: false,
    depthLimit: false,
};
/**
 * One registered external-agent provider.
 *
 * A child starts fresh in its own process, so `inheritsParentContext` is
 * always false and the model-facing tool derives standalone wording.
 */
export class DelegateProvider {
    name;
    capabilities = NO_START_CAPABILITIES;
    inheritsParentContext = false;
    #ctx;
    #prefix;
    #start;
    constructor(options) {
        this.name = options.name;
        this.#ctx = options.ctx;
        this.#prefix = options.prefix;
        this.#start = options.start;
    }
    /**
     * Validate the working directory, then hand the request to the backend.
     * @param request - the resolved start request.
     * @returns the published run.
     */
    async start(request) {
        if (request.signal.aborted) {
            throw new Error(`${this.#prefix}: request was aborted before startup`);
        }
        const cwd = assertUsableCwd(this.#prefix, 'child cwd', request.cwd);
        this.#ctx.logger.debug(`${this.#prefix}: delegating in ${cwd}`);
        return await this.#start({ ...request, cwd });
    }
    /**
     * Report a backend failure on the host logger without replacing it.
     * @param error - the original failure.
     * @param stopReason - the flattened stop reason.
     */
    report(error, stopReason) {
        this.#ctx.logger.warn(`${this.#prefix}: delegated run failed (${stopReason}): ${error.message}`);
    }
}
/**
 * Assert a configured timing bound is a positive finite number within the
 * Node timer range.
 * @param prefix - diagnostic prefix.
 * @param field - the configuration field name.
 * @param value - the configured value.
 */
export function assertGraceMs(prefix, field, value) {
    if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) {
        throw new Error(`${prefix}: ${field} must be a positive finite number no greater than 2147483647`);
    }
}
