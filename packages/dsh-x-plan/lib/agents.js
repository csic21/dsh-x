import { planError } from './errors.js';
/** Planner and reviewer families. The executor is always the current DSH session. */
export const FAMILIES = ['codex', 'claude', 'grok'];
/**
 * Launch spec for each family's ACP adapter.
 * Codex read-only mode is the adapter's documented `INITIAL_AGENT_MODE`.
 * Claude's session mode id `plan` restricts its tools. These are adapter modes,
 * not an OS sandbox. Grok must advertise `read-only`; its `plan` mode alone
 * does not protect against shell or subagent writes and is never accepted.
 * Only preinstalled, operator-audited adapters are used; nothing is downloaded.
 */
export const AGENT_LAUNCH = {
    codex: {
        bin: 'codex-acp',
        binArgs: [],
        env: { INITIAL_AGENT_MODE: 'read-only', NO_BROWSER: '1', DEFAULT_AUTH_REQUEST: '' },
        modeId: 'read-only',
        documentationUrl: 'https://github.com/agentclientprotocol/codex-acp',
    },
    claude: {
        bin: 'claude-agent-acp',
        binArgs: [],
        env: {},
        modeId: 'plan',
        documentationUrl: 'https://github.com/agentclientprotocol/claude-agent-acp',
    },
    grok: {
        bin: 'grok',
        binArgs: ['--no-auto-update', 'agent', 'stdio'],
        env: {},
        modeId: 'read-only',
        documentationUrl: 'https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md',
    },
};
const NEXT_FAMILY = { codex: 'claude', claude: 'codex', grok: 'codex' };
/** Reviewer default so the planner does not grade its own plan. */
export function defaultReviewer(planner) {
    const next = NEXT_FAMILY[planner];
    if (next === undefined)
        throw planError('FAMILY', `未知的规划者：${planner}`);
    return next;
}
export function assertFamily(value, label) {
    if (!FAMILIES.includes(value))
        throw planError('FAMILY', `${label}必须是 codex、claude 或 grok。`);
    return value;
}
/**
 * Resolve an already-installed ACP executable. The operator is responsible for
 * auditing/pinning that installation; ACP preflight records its advertised
 * identity/version. No package manager or automatic installation is attempted.
 * `DSH_X_ACP_CODEX` / `_CLAUDE` / `_GROK` replace the executable, not its safety policy.
 * @param {'codex'|'claude'|'grok'} family
 * @param {{ resolveExecutable: Function, env?: NodeJS.ProcessEnv, signal?: AbortSignal }} options
 */
export async function resolveLaunch(family, { resolveExecutable, env = process.env, signal }) {
    const spec = AGENT_LAUNCH[family];
    if (spec === undefined)
        throw planError('FAMILY', `未知的模型家族：${family}`);
    signal?.throwIfAborted();
    const overrideName = `DSH_X_ACP_${family.toUpperCase()}`;
    const override = env[overrideName];
    if (typeof override === 'string' && override.trim() !== '') {
        const bin = await resolveExecutable(override.trim(), undefined, signal);
        return launch(bin, spec);
    }
    try {
        const bin = await resolveExecutable(spec.bin, undefined, signal);
        return launch(bin, spec);
    }
    catch (binError) {
        if (signal?.aborted || binError?.name === 'AbortError')
            throw binError;
        const binMessage = binError instanceof Error ? binError.message : String(binError);
        throw planError('LAUNCH', `找不到 ${family} 的 ACP 命令（${spec.bin}）。请先自行安装并审计固定版本，或用 ${overrideName} 指定已审计的本地程序。插件不会自动下载或运行 npx。官方说明：${spec.documentationUrl}。${binMessage}`);
    }
}
function launch(bin, spec, args = spec.binArgs) {
    return {
        argv: [bin, ...args],
        env: { ...spec.env },
        modeId: spec.modeId,
    };
}
