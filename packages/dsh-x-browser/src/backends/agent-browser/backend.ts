import { assertCapability, CDP_CAPABILITIES } from '../../contract/capabilities.ts'
import { fail } from '../../contract/errors.ts'
import { observationFromSnapshot, cliRef } from './parse.ts'
import { openResult, snapshotResult, tabNewResult, tabsResult } from './contract.ts'
import { createAgentBrowserCli } from './cli.ts'
import type { AgentBrowserCliOptions } from './cli.ts'
import type { BrowserCommand } from '../../contract/commands.ts'
import { boundedJson } from '../../contract/json.ts'
import { modelUrl } from '../../contract/observation.ts'
import type { Observation } from '../../contract/observation.ts'
import type { BackendExecution, BrowserBackend, BrowserScope, TargetSummary } from '../types.ts'
import { parseAddress } from '../../contract/url.ts'

export interface AgentBrowserBackendOptions extends AgentBrowserCliOptions {
  /** Headed by default so the user can watch; headless must be explicit in config. */
  headed?: boolean
}

/** Per-target state the model never sees directly. */
interface TargetState {
  tabId: string
  targetId: string
  title: string
  url: string
  revision: number
  refs: Set<string>
}

interface SessionState {
  name: string
  targets: Map<string, TargetState>
  activeTab: string | null
  queue: Promise<unknown>
}

const KEY_MAP: Readonly<Record<string, string>> = {
  Tab: 'Tab',
  Escape: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  PageUp: 'Page_Up',
  PageDown: 'Page_Down',
  Home: 'Home',
  End: 'End',
}

/** The CLI attaches a per-call lifecycle block to every result; it is noise for the model. */
function withoutLifecycle(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const { lifecycle: _lifecycle, ...rest } = value as Record<string, unknown>
  return rest
}

/** Serialize every CLI call for one session; the daemon is shared, ordering is ours. */
function enqueue<T>(session: SessionState, task: () => Promise<T>): Promise<T> {
  const run = session.queue.then(task, task)
  session.queue = run.then(() => undefined, () => undefined)
  return run
}

/** CDP backend: one agent-browser session per DSH session, targets addressed by stable tab id. */
export function createAgentBrowserBackend(options: AgentBrowserBackendOptions = {}): BrowserBackend {
  const headed = options.headed ?? true
  const cli = createAgentBrowserCli({
    ...options,
    extraArgs: [...(options.extraArgs ?? []), ...(headed ? ['--headed'] : [])],
  })
  const sessions = new Map<string, SessionState>()
  let disposed = false

  const stateOf = (scope: BrowserScope): SessionState => {
    if (disposed) throw fail('BROWSER_CLOSED', 'The agent-browser backend is disposed.')
    const key = `${scope.profile}\u0000${scope.sessionId}`
    let state = sessions.get(key)
    if (!state) {
      state = { name: cli.sessionName(scope.profile, scope.sessionId), targets: new Map(), activeTab: null, queue: Promise.resolve() }
      sessions.set(key, state)
    }
    return state
  }

  const targetOf = (session: SessionState, targetId: string): TargetState => {
    const target = session.targets.get(targetId)
    if (!target) throw fail('BROWSER_TARGET', 'Unknown browser target. Run tabs and observe again.')
    return target
  }

  const summary = (target: TargetState): TargetSummary => ({
    targetId: target.tabId,
    title: target.title.slice(0, 200),
    url: modelUrl(target.url),
    visible: headed,
    revision: target.revision,
  })

  const sync = (session: SessionState, tabs: ReturnType<typeof tabsResult>): void => {
    const live = new Set<string>()
    for (const tab of tabs) {
      live.add(tab.tabId)
      const existing = session.targets.get(tab.tabId)
      if (existing && existing.targetId === tab.targetId) {
        existing.title = tab.title || existing.title
        existing.url = tab.url || existing.url
      } else if (existing) {
        existing.targetId = tab.targetId
        existing.title = tab.title
        existing.url = tab.url
        existing.revision += 1
        existing.refs.clear()
      } else {
        session.targets.set(tab.tabId, { tabId: tab.tabId, targetId: tab.targetId, title: tab.title, url: tab.url, revision: 1, refs: new Set() })
      }
      if (tab.active) session.activeTab = tab.tabId
    }
    for (const tabId of [...session.targets.keys()]) if (!live.has(tabId)) session.targets.delete(tabId)
  }

  const refresh = async (session: SessionState, signal?: AbortSignal) => {
    sync(session, tabsResult(await cli.invoke(session.name, ['tab', 'list'], { signal })))
  }

  const focus = async (session: SessionState, target: TargetState, signal?: AbortSignal): Promise<void> => {
    if (session.activeTab === target.tabId) return
    await cli.invoke(session.name, ['tab', target.tabId], { signal })
    session.activeTab = target.tabId
  }

  const doObserve = async (session: SessionState, target: TargetState, signal?: AbortSignal): Promise<Observation> => {
    await focus(session, target, signal)
    const snapshot = snapshotResult(await cli.invoke(session.name, ['snapshot', '-i'], { signal }))
    target.revision += 1
    target.refs = new Set(Object.keys(snapshot.refs))
    const observation = observationFromSnapshot(target.tabId, target.revision, snapshot, target.title)
    if (observation.url) target.url = observation.url
    return observation
  }

  /** Any successful command invalidates refs: the model must observe again. */
  const settle = (target: TargetState): void => {
    target.revision += 1
    target.refs.clear()
  }

  return {
    kind: 'cdp',
    capabilities: CDP_CAPABILITIES,

    async ensure(scope, signal) {
      stateOf(scope)
      signal?.throwIfAborted()
      await cli.version()
    },

    async list(scope, signal) {
      const session = stateOf(scope)
      return enqueue(session, async () => {
        signal?.throwIfAborted()
        await refresh(session, signal)
        return [...session.targets.values()].map(summary)
      })
    },

    async open(scope, url, signal) {
      const session = stateOf(scope)
      const address = parseAddress(url)
      return enqueue(session, async () => {
        signal?.throwIfAborted()
        const opened = session.targets.size > 0
          ? tabNewResult(await cli.invoke(session.name, ['tab', 'new', address], { signal }))
          : openResult(await cli.invoke(session.name, ['open', address], { signal }))
        await refresh(session, signal)
        const tab = [...session.targets.values()].find(target => target.targetId === opened.targetId)
        if (!tab) throw fail('BROWSER_TARGET', 'agent-browser opened a page but reported no matching tab.')
        tab.title = ('title' in opened ? opened.title : '') || tab.title
        tab.url = opened.url || tab.url
        tab.revision += 1
        tab.refs.clear()
        session.activeTab = tab.tabId
        return summary(tab)
      })
    },

    async observe(scope, targetId, signal) {
      const session = stateOf(scope)
      return enqueue(session, async () => {
        signal?.throwIfAborted()
        const target = targetOf(session, targetId)
        return doObserve(session, target, signal)
      })
    },

    async execute(scope, targetId, command, signal) {
      const session = stateOf(scope)
      return enqueue(session, async (): Promise<BackendExecution> => {
        signal?.throwIfAborted()
        assertCapability(CDP_CAPABILITIES, command.action)
        const target = targetOf(session, targetId)
        if (command.action === 'observe') {
          const observation = await doObserve(session, target, signal)
          return { targetId: target.tabId, revision: target.revision, observation, value: null, untrustedPageContent: true }
        }
        if (command.action !== 'scroll') {
          if (command.target && !target.refs.has(command.target)) throw fail('BROWSER_STALE', 'Observe again before using this reference.')
        }
        await focus(session, target, signal)
        const value = await run(session, target, command, signal)
        settle(target)
        return { targetId: target.tabId, revision: target.revision, observation: null, value: boundedJson(withoutLifecycle(value)), untrustedPageContent: true }
      })
    },

    async close(scope, targetId) {
      const session = stateOf(scope)
      return enqueue(session, async () => {
        const target = targetOf(session, targetId)
        try { await cli.invoke(session.name, ['tab', 'close', target.tabId]) } catch (error) {
          if ((error as { code?: string }).code !== 'BROWSER_TARGET') throw error
        }
        session.targets.delete(target.tabId)
        if (session.activeTab === target.tabId) session.activeTab = null
      })
    },

    async dispose() {
      if (disposed) return
      disposed = true
      const closing = [...sessions.values()].map(session => enqueue(session, async () => {
        try { await cli.invoke(session.name, ['close']) } catch {}
      }))
      sessions.clear()
      await Promise.all(closing)
    },
  }

  async function run(session: SessionState, target: TargetState, command: BrowserCommand, signal?: AbortSignal) {
    const invoke = (args: string[]) => cli.invoke<unknown>(session.name, args, { signal })
    switch (command.action) {
      case 'navigate': {
        const address = parseAddress(command.url)
        const opened = openResult(await invoke(['open', address]))
        target.url = opened.url
        target.title = opened.title || target.title
        target.targetId = opened.targetId
        return { opened: modelUrl(opened.url) }
      }
      case 'click': return await invoke(['click', cliRef(command.target!)])
      case 'type': return await invoke(['fill', cliRef(command.target!), command.text!])
      case 'press': return await invoke(['press', KEY_MAP[command.key!] ?? command.key!])
      case 'select': return await invoke(['select', cliRef(command.target!), command.value!])
      case 'back': return await invoke(['back'])
      case 'forward': return await invoke(['forward'])
      case 'reload': return await invoke(['reload'])
      case 'scroll': {
        const dy = command.y ?? 0
        const dx = command.x ?? 0
        if (dy === 0 && dx === 0) throw fail('BROWSER_INPUT', 'Scroll needs a non-zero x or y distance.')
        if (dy) await invoke(['scroll', dy > 0 ? 'down' : 'up', String(Math.abs(dy))])
        if (dx) await invoke(['scroll', dx > 0 ? 'right' : 'left', String(Math.abs(dx))])
        return { scrolled: true }
      }
      default: throw fail('BROWSER_UNSUPPORTED', `The CDP backend does not implement ${command.action}.`)
    }
  }
}
