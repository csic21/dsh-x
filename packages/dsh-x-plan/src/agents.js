/** Planner and reviewer families. The executor is always the current DeepSeek session. */
export const FAMILIES = ['codex', 'claude', 'grok']

/**
 * Launch spec for each family's ACP adapter.
 * Codex read-only mode is the adapter's documented `INITIAL_AGENT_MODE`.
 * Claude's session mode id `plan` blocks edits. Grok has no documented
 * read-only mode flag; permission rejection is the backstop for every family.
 */
export const AGENT_LAUNCH = {
  codex: {
    bin: 'codex-acp',
    binArgs: [],
    npxArgs: ['@agentclientprotocol/codex-acp'],
    env: { INITIAL_AGENT_MODE: 'read-only' },
    modeId: 'read-only',
  },
  claude: {
    bin: 'claude-agent-acp',
    binArgs: [],
    npxArgs: ['@agentclientprotocol/claude-agent-acp'],
    env: {},
    modeId: 'plan',
  },
  grok: {
    bin: 'grok',
    binArgs: ['--no-auto-update', 'agent', 'stdio'],
    npxArgs: ['@xai-official/grok', '--no-auto-update', 'agent', 'stdio'],
    env: {},
    modeId: null,
  },
}

const NEXT_FAMILY = { codex: 'claude', claude: 'grok', grok: 'codex' }

/** Reviewer default so the planner does not grade its own plan. */
export function defaultReviewer(planner) {
  const next = NEXT_FAMILY[planner]
  if (next === undefined) throw new Error(`未知的规划者：${planner}`)
  return next
}

export function assertFamily(value, label) {
  if (!FAMILIES.includes(value)) throw new Error(`${label}必须是 codex、claude 或 grok。`)
  return value
}

/**
 * Resolve the ACP argv. A bare name on `PATH` wins. Otherwise `npx -y` runs
 * the published adapter. `DSH_X_ACP_CODEX` / `_CLAUDE` / `_GROK` replace the
 * executable and still receive that family's arguments.
 * @param {'codex'|'claude'|'grok'} family
 * @param {{ resolveExecutable: Function, env?: NodeJS.ProcessEnv, signal?: AbortSignal }} options
 */
export async function resolveLaunch(family, { resolveExecutable, env = process.env, signal }) {
  const spec = AGENT_LAUNCH[family]
  if (spec === undefined) throw new Error(`未知的模型家族：${family}`)
  const overrideName = `DSH_X_ACP_${family.toUpperCase()}`
  const override = env[overrideName]
  if (typeof override === 'string' && override.trim() !== '') {
    const bin = await resolveExecutable(override.trim(), undefined, signal)
    return launch(bin, spec)
  }
  try {
    const bin = await resolveExecutable(spec.bin, undefined, signal)
    return launch(bin, spec)
  } catch (binError) {
    try {
      const npx = await resolveExecutable('npx', undefined, signal)
      return launch(npx, spec, ['-y', ...spec.npxArgs])
    } catch (npxError) {
      const binMessage = binError instanceof Error ? binError.message : String(binError)
      const npxMessage = npxError instanceof Error ? npxError.message : String(npxError)
      throw new Error(
        `找不到 ${family} 的 ACP 命令（${spec.bin}），也找不到 npx。${binMessage} ${npxMessage}`,
      )
    }
  }
}

function launch(bin, spec, args = spec.binArgs) {
  return {
    argv: [bin, ...args],
    env: { ...spec.env },
    modeId: spec.modeId,
  }
}
