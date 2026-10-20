import { assertCapability, CDP_CAPABILITIES } from '../contract/capabilities.ts'
import type { BackendKind, CapabilitySet } from '../contract/capabilities.ts'
import type { BrowserCommand } from '../contract/commands.ts'
import { fail } from '../contract/errors.ts'
import type { BrowserErrorCode } from '../contract/errors.ts'
import { boundObservation, modelUrl } from '../contract/observation.ts'
import type { Observation } from '../contract/observation.ts'
import { parseAddress } from '../contract/url.ts'
import type { BackendExecution, BrowserBackend, BrowserScope, TargetSummary } from './types.ts'

/** Injected failures let tests cover every backend failure path without a browser. */
export interface FakeBackendOptions {
  kind?: BackendKind
  capabilities?: CapabilitySet
  failOn?: Partial<Record<'ensure' | 'open' | 'observe' | 'execute' | 'close', BrowserErrorCode>>
}

type FakeTarget = { scope: BrowserScope, summary: TargetSummary, observation: Observation }

/** In-memory backend used by the conformance suite; no page, process or network access. */
export function createFakeBackend(options: FakeBackendOptions = {}): BrowserBackend & { commands: BrowserCommand[] } {
  const kind = options.kind ?? 'cdp'
  const capabilities = options.capabilities ?? CDP_CAPABILITIES
  const commands: BrowserCommand[] = []
  const targets = new Map<string, FakeTarget>()
  let sequence = 0
  let disposed = false
  const key = (scope: BrowserScope, targetId: string) => `${scope.sessionId}\u0000${targetId}`
  const check = () => { if (disposed) throw fail('BROWSER_CLOSED', 'The browser backend is disposed.') }
  const failIf = (step: keyof NonNullable<FakeBackendOptions['failOn']>) => {
    const code = options.failOn?.[step]
    if (code) throw fail(code, `Injected ${step} failure.`)
  }
  const find = (scope: BrowserScope, targetId: string): FakeTarget => {
    const target = targets.get(key(scope, targetId))
    if (!target) throw fail('BROWSER_TARGET', 'Unknown browser target.')
    return target
  }
  const summary = (target: FakeTarget): TargetSummary => ({ ...target.summary })
  return {
    kind,
    capabilities,
    commands,
    async ensure(scope) {
      check()
      failIf('ensure')
      void scope
    },
    async list(scope) {
      check()
      return [...targets.values()].filter(target => target.scope.sessionId === scope.sessionId).map(summary)
    },
    async open(scope, url) {
      check()
      failIf('open')
      const address = parseAddress(url)
      const targetId = `t${++sequence}`
      const observation = boundObservation({ targetId, revision: 0, url: address, title: 'Fixture', text: `Loaded ${address}`, refs: { e1: 'link: Fixture link' } })
      const target: FakeTarget = {
        scope: { ...scope },
        summary: { targetId, title: observation.title, url: modelUrl(address), visible: true, revision: 0 },
        observation,
      }
      targets.set(key(scope, targetId), target)
      return summary(target)
    },
    async observe(scope, targetId) {
      check()
      failIf('observe')
      return find(scope, targetId).observation
    },
    async execute(scope, targetId, command) {
      check()
      failIf('execute')
      assertCapability(capabilities, command.action)
      const target = find(scope, targetId)
      if (command.target && !target.observation.refs[command.target]) throw fail('BROWSER_STALE', 'Observe again before using this reference.')
      commands.push(command)
      const url = command.action === 'navigate' ? parseAddress(command.url) : target.observation.url
      const revision = target.observation.revision + 1
      const observation = boundObservation({ targetId, revision, url, title: target.observation.title, text: `Action ${command.action}`, refs: target.observation.refs })
      target.observation = observation
      target.summary = { targetId, title: observation.title, url: modelUrl(url), visible: true, revision }
      return { targetId, revision, observation, value: null, untrustedPageContent: true } satisfies BackendExecution
    },
    async close(scope, targetId) {
      check()
      failIf('close')
      find(scope, targetId)
      targets.delete(key(scope, targetId))
    },
    async dispose() {
      disposed = true
      targets.clear()
    },
  }
}
