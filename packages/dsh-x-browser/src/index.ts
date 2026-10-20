import type { Context } from '@deepseek-ai/cordis'
import { createAgentBrowserBackend } from './backends/agent-browser/backend.ts'
import { createBrowserBroker } from './backends/embedded/broker.ts'
import { registerEmbeddedRoutes } from './backends/embedded/register.ts'
import { createAuthority } from './authority.ts'
import type { AuthorityServices } from './authority.ts'
import { createBrowserOwnership } from './ownership.ts'
import { cdpRuntime, embeddedRuntime } from './runtime.ts'
import type { BrowserRuntime } from './runtime.ts'
import { registerBrowserTools } from './tools.ts'

/** Plugin config; `embedded` stays the default until a packaged CDP run is recorded. */
export interface BrowserConfig {
  backend?: 'embedded' | 'cdp'
  cdp?: {
    /** CLI executable; defaults to `agent-browser` on PATH. */
    command?: string
    /** Headed by default so the user can watch; headless must be explicit. */
    headed?: boolean
    /** Empty means unrestricted; entries match a host or its subdomains. */
    allowedDomains?: string[]
    extraArgs?: string[]
    timeoutMs?: number
  }
}

/** Official host services this plugin consumes without a shipped type dependency. */
type HostServices = AuthorityServices & {
  systemPrompt: { section(options: { name: string, order: number, interpolate: boolean, text: string }): () => void }
}

export const name = 'dsh-x-browser'
export const inject = ['tools', 'workingDirectory', 'profileContext', 'systemPrompt']

/** Composition root: authority + one backend + optional renderer routes + model-facing tools. */
export function apply(ctx: Context, config: BrowserConfig = {}) {
  const services = ctx as Context & HostServices
  const authority = createAuthority(services)
  let runtime: BrowserRuntime
  let ownership: ReturnType<typeof createBrowserOwnership> | undefined

  if (config.backend === 'cdp') {
    const domains = config.cdp?.allowedDomains ?? []
    const backend = createAgentBrowserBackend({
      command: config.cdp?.command,
      headed: config.cdp?.headed,
      timeoutMs: config.cdp?.timeoutMs,
      extraArgs: [...(config.cdp?.extraArgs ?? []), ...(domains.length ? ['--allowed-domains', domains.join(',')] : [])],
    })
    runtime = cdpRuntime(backend, { allowedDomains: domains })
  } else {
    const broker = createBrowserBroker({ profile: authority.profile, contextOf: authority.contextOf, turnOf: authority.turnOf, onTrace: event => ctx.emit('dsh-x-browser/trace', event) })
    ownership = createBrowserOwnership({ onClose: token => broker.revokeOwner(token) })
    ctx.provide('dshXBrowserOwnership', { bind: ownership.bind })
    ctx.effect(() => () => { ownership!.dispose(); broker.dispose() }, 'browser: broker lifetime')
    registerEmbeddedRoutes(ctx, broker)
    runtime = embeddedRuntime(broker)
  }

  ctx.effect(() => () => { void runtime.dispose() }, 'browser: runtime lifetime')
  registerBrowserTools(ctx, { name, authority, runtime, ownership, systemPrompt: services.systemPrompt })
}
