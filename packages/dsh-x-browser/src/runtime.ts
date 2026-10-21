import type { BrowserBackend, BrowserScope } from './backends/types.ts'
import type { EmbeddedBroker } from './backends/embedded/broker.ts'
import type { BrowserCommand } from './contract/commands.ts'
import { fail } from './contract/errors.ts'
import { boundedJson } from './contract/json.ts'
import type { BrowserJson } from './contract/json.ts'
import { modelUrl } from './contract/observation.ts'
import { parseAddress } from './contract/url.ts'

/** One model-facing target; embedded tabs and CDP targets share this shape. */
export interface RuntimeTarget {
  tabId: string
  sessionId: string
  epoch: number
  grantRevision: number
  visible: boolean
  granted: boolean
  title: string
  url: string
  busy: boolean
  status: string
}

export interface RuntimeList {
  tabs: RuntimeTarget[]
  runtime: string
  nativeRuntimes: string[]
  experimental?: boolean
}

export interface RuntimeResult {
  tabId: string
  epoch: number
  grantRevision: number
  untrustedPageContent: true
  result: BrowserJson
}

export interface DispatchOwner {
  signal?: AbortSignal
  runId?: string
  turnNumber?: number
  assertCurrent?: () => void
  ownerToken?: symbol | null
}

export interface RuntimeExecuteArgs {
  tabId: string
  epoch: number
  grantRevision: number
  command: BrowserCommand
}

/** The only browser surface the model-facing tools know about. */
export interface BrowserRuntime {
  readonly kind: 'embedded' | 'cdp'
  /** Present only when the runtime can create a target without a renderer. */
  readonly open?: (scope: BrowserScope, url: string, owner: DispatchOwner) => Promise<RuntimeTarget>
  /** Validate a prospective open before asking for approval; throws on invalid or disallowed URLs. */
  readonly canOpen?: (url: string) => void
  list(scope: BrowserScope, options?: { ownerToken?: symbol | null, assertCurrent?: () => void, signal?: AbortSignal }): Promise<RuntimeList>
  execute(scope: BrowserScope, args: RuntimeExecuteArgs, owner: DispatchOwner): Promise<RuntimeResult>
  dispose(): Promise<void>
}

/** Adapter over the renderer-backed broker; behavior stays exactly as before. */
export function embeddedRuntime(broker: EmbeddedBroker): BrowserRuntime {
  return {
    kind: 'embedded',
    canOpen(url) {
      parseAddress(url)
    },
    /**
     * Ask the shell to open the AI Browser tab for this session.
     *
     * The renderer creates the tab, mounts the guest and owns the capability; this
     * call only records a bounded request. The tab starts ungranted, so the model
     * still cannot act in it until the profile's grant policy allows it.
     */
    async open(scope, url, owner) {
      owner.signal?.throwIfAborted()
      owner.assertCurrent?.()
      const address = parseAddress(url)
      await broker.requestOpen({ sessionId: scope.sessionId, url: address })
      return { tabId: '', sessionId: scope.sessionId, epoch: 0, grantRevision: 0, visible: false, granted: false, title: '', url: modelUrl(address), busy: false, status: 'opening' }
    },
    async list(scope, options = {}) {
      const value = await broker.list(scope, options)
      return { tabs: value.tabs, runtime: value.runtime, nativeRuntimes: value.nativeRuntimes, experimental: value.experimental }
    },
    async execute(scope, args, owner) {
      return await broker.execute(scope, args, owner)
    },
    async dispose() { broker.dispose() },
  }
}

export interface CdpRuntimeOptions {
  /** Empty means unrestricted; matching is exact host or a subdomain of the entry. */
  allowedDomains?: readonly string[]
}

function domainPermitted(allowed: readonly string[], url: string): boolean {
  if (allowed.length === 0) return true
  const host = new URL(url).hostname.toLowerCase()
  return allowed.some(domain => host === domain || host.endsWith(`.${domain}`))
}

/** Adapter over the external agent-browser backend: epoch is the target revision, grant is config-level. */
export function cdpRuntime(backend: BrowserBackend, options: CdpRuntimeOptions = {}): BrowserRuntime {
  const allowed = (options.allowedDomains ?? []).map(domain => domain.trim().toLowerCase()).filter(Boolean)
  const assertPermitted = (url: string) => {
    if (!domainPermitted(allowed, url)) throw fail('BROWSER_URL', `The domain is outside the configured allowlist: ${new URL(url).hostname}`)
  }
  const target = (scope: BrowserScope, value: { targetId: string, revision: number, visible: boolean, title: string, url: string }): RuntimeTarget => ({
    tabId: value.targetId,
    sessionId: scope.sessionId,
    epoch: value.revision,
    grantRevision: 0,
    visible: value.visible,
    granted: true,
    title: value.title,
    url: value.url,
    busy: false,
    status: 'ready',
  })
  return {
    kind: 'cdp',
    canOpen(url) {
      assertPermitted(parseAddress(url))
    },
    async open(scope, url, owner) {
      owner.signal?.throwIfAborted()
      owner.assertCurrent?.()
      const address = parseAddress(url)
      assertPermitted(address)
      const opened = await backend.open(scope, address, owner.signal)
      return target(scope, opened)
    },
    async list(scope, options = {}) {
      options.assertCurrent?.()
      const tabs = await backend.list(scope, options.signal)
      return { tabs: tabs.map(value => target(scope, value)), runtime: 'cdp', nativeRuntimes: [], experimental: true }
    },
    async execute(scope, args, owner) {
      owner.signal?.throwIfAborted()
      owner.assertCurrent?.()
      if (args.grantRevision !== 0) throw fail('BROWSER_STALE', 'Read grantRevision from tabs; the CDP backend always reports 0.')
      if (args.command.action === 'navigate' && args.command.url) assertPermitted(parseAddress(args.command.url))
      const tabs = await backend.list(scope, owner.signal)
      const current = tabs.find(value => value.targetId === args.tabId)
      if (!current) throw fail('BROWSER_TARGET', 'Unknown browser target. Refresh tabs and observe again.')
      if (current.revision !== args.epoch) throw fail('BROWSER_STALE', 'Refresh tabs or observe again; this epoch is stale.')
      const result = await backend.execute(scope, args.tabId, args.command, owner.signal)
      owner.assertCurrent?.()
      return {
        tabId: args.tabId,
        epoch: result.revision,
        grantRevision: 0,
        untrustedPageContent: true,
        result: result.observation ? boundedJson(result.observation) : boundedJson(result.value ?? null),
      }
    },
    async dispose() { await backend.dispose() },
  }
}
