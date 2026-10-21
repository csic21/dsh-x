/**
 * Multi-step browser runs against one owned tab.
 *
 * The host, not the model, performs the observe/act cycle a run needs, so a whole
 * verification loop costs one model round trip. Each step still goes through the same
 * validated command path as a single action, a navigation is allowed to settle before
 * the next step, and the run stops at the first failure with a precise report.
 *
 * @module dsh-x-browser/run
 */

import { fail } from './contract/errors.ts'
import { describeLabels, matchLabel } from './contract/batch.ts'
import type { RunStep, RunTarget } from './contract/batch.ts'
import type { BrowserCommand } from './contract/commands.ts'
import type { DispatchOwner, BrowserRuntime, RuntimeTarget } from './runtime.ts'
import type { BrowserScope } from './backends/types.ts'

/**
 * How long a step may take to produce a new document.
 *
 * An explicit navigation is expected to replace the document, so it gets a real
 * budget. A click usually does not, so it gets a short probe: waiting the full
 * budget for every ordinary click would cost more than it saves.
 */
const NAVIGATION_SETTLE_MS = 3000
const CLICK_SETTLE_MS = 300
const SETTLE_POLL_MS = 60

/** One step's outcome, kept short so the log never dominates the result. */
export interface RunStepResult {
  step: number
  action: string
  ok: boolean
  /** How a locator resolved, or why the step stopped the run. */
  note?: string
}

/** Model-facing result of one run. */
export interface RunOutcome {
  tabId: string
  epoch: number
  grantRevision: number
  untrustedPageContent: true
  steps: RunStepResult[]
  observation: {
    text: string
    targets: RunTarget[]
    truncated: boolean
    url: string
    title: string
  } | null
}

/** Everything one run needs from the caller. */
export interface RunRequest {
  runtime: BrowserRuntime
  scope: BrowserScope
  owner: DispatchOwner
  tabId: string
  epoch: number
  grantRevision: number
  steps: readonly RunStep[]
  textLimit: number
  targetLimit: number
  /** Whether a final observation is returned when the last step did not produce one. */
  finalObservation: boolean
}

const actionsNeedingTarget = new Set(['click', 'type'])

/** Read the mutable state of the run's tab, or fail when it is gone. */
async function currentTab(request: RunRequest): Promise<RuntimeTarget> {
  const list = await request.runtime.list(request.scope, { ownerToken: request.owner.ownerToken ?? null, assertCurrent: request.owner.assertCurrent, signal: request.owner.signal })
  const tab = list.tabs.find(item => item.tabId === request.tabId)
  if (!tab) throw fail('BROWSER_TARGET', 'The tab this run targets is gone. Open or refresh it, then start a new run.')
  if (!tab.visible) throw fail('BROWSER_HIDDEN', 'The tab is hidden, so a run cannot continue. Show it and retry.')
  if (!tab.granted) throw fail('BROWSER_GRANT', 'AI access ended during the run. Enable it again, then start a new run.')
  return tab
}

/** Turn one observation result into the bounded target list a label can match. */
function targetsOf(result: unknown): RunTarget[] {
  if (typeof result !== 'object' || result === null) return []
  const targets = (result as { targets?: unknown }).targets
  if (!Array.isArray(targets)) return []
  return targets.flatMap((raw): RunTarget[] => {
    if (typeof raw !== 'object' || raw === null) return []
    const value = raw as Record<string, unknown>
    if (typeof value.ref !== 'string' || !value.ref) return []
    return [{
      ref: value.ref,
      tag: typeof value.tag === 'string' ? value.tag : undefined,
      type: typeof value.type === 'string' ? value.type : undefined,
      label: typeof value.label === 'string' ? value.label : undefined,
      editable: value.editable === true,
    }]
  })
}

/** Project one observation payload onto the bounded, model-facing shape. */
function observationOf(result: unknown, textLimit: number, targetLimit: number): RunOutcome['observation'] {
  if (typeof result !== 'object' || result === null) return null
  const value = result as Record<string, unknown>
  if (typeof value.text !== 'string') return null
  const text = value.text.length > textLimit ? `${value.text.slice(0, textLimit)}\n…[truncated]` : value.text
  return {
    text,
    targets: targetsOf(result).slice(0, targetLimit),
    truncated: value.truncated === true || value.text.length > textLimit,
    url: typeof value.url === 'string' ? value.url : '',
    title: typeof value.title === 'string' ? value.title : '',
  }
}

/** Wait until the tab reports a document other than `from`, or the timeout expires. */
async function settle(request: RunRequest, from: number, budgetMs: number): Promise<RuntimeTarget> {
  const deadline = Date.now() + budgetMs
  let tab = await currentTab(request)
  while (tab.epoch === from && Date.now() < deadline) {
    await new Promise<void>(resolve => setTimeout(resolve, SETTLE_POLL_MS))
    request.owner.signal?.throwIfAborted()
    tab = await currentTab(request)
  }
  return tab
}

/**
 * Execute one run.
 *
 * @param request - runtime, scope, owner, starting identity, steps and result bounds.
 * @returns per-step outcomes plus the final observation.
 * @throws BROWSER_INPUT, BROWSER_TARGET, BROWSER_HIDDEN, BROWSER_GRANT, BROWSER_STALE
 */
export async function runSequence(request: RunRequest): Promise<RunOutcome> {
  const log: RunStepResult[] = []
  let tab = await currentTab(request)
  let observation: RunOutcome['observation'] = null

  for (const [index, step] of request.steps.entries()) {
    const position = index + 1
    try {
      let target = step.target
      // A step that names a control instead of a reference needs a fresh observation
      // here, because the previous step invalidated every reference on the page.
      if (actionsNeedingTarget.has(step.action) && !target && step.label) {
        const probe = await request.runtime.execute(request.scope, {
          tabId: tab.tabId,
          epoch: tab.epoch,
          grantRevision: tab.grantRevision,
          command: { action: 'observe' },
        }, request.owner)
        tab = await currentTab(request)
        const targets = targetsOf(probe.result)
        const match = matchLabel(targets, step.label, step.action === 'type')
        if (!match) throw fail('BROWSER_TARGET', `No control on this page matches ${JSON.stringify(step.label)}. Visible labels: ${describeLabels(targets)}`)
        target = match.target.ref
      }

      const command: BrowserCommand = step.action === 'click' || step.action === 'type'
        ? (step.action === 'click'
            ? { action: 'click', target: target! }
            : { action: 'type', target: target!, text: step.text! })
        : step.action === 'navigate' ? { action: 'navigate', url: step.url! }
        : step.action === 'press' ? { action: 'press', key: step.key! }
        : step.action === 'scroll' ? { action: 'scroll', x: step.x ?? 0, y: step.y ?? 0 }
        : step.action === 'observe' ? { action: 'observe' }
        : { action: step.action }

      const before = tab.epoch
      // Only actions that can replace the document are worth a settle wait; typing,
      // pressing and scrolling cannot, and waiting for them would slow the run down.
      const budget = step.action === 'navigate' || step.action === 'back' || step.action === 'forward' || step.action === 'reload'
        ? NAVIGATION_SETTLE_MS
        : step.action === 'click' ? CLICK_SETTLE_MS : 0
      const result = await request.runtime.execute(request.scope, {
        tabId: tab.tabId,
        epoch: tab.epoch,
        grantRevision: tab.grantRevision,
        command,
      }, request.owner)
      observation = observationOf(result.result, request.textLimit, request.targetLimit) ?? observation
      tab = await currentTab(request)
      // Navigation and clicks may still be loading; let the next step see the new
      // document instead of racing it with a stale epoch.
      if (budget > 0) tab = await settle(request, before, budget)
      log.push({ step: position, action: step.action, ok: true, note: target && step.label ? `matched ${JSON.stringify(step.label)}` : undefined })
    } catch (error) {
      const failure = error as { code?: unknown, message?: unknown }
      log.push({ step: position, action: step.action, ok: false, note: String(failure.message ?? 'failed').slice(0, 300) })
      const stopped = { tabId: tab.tabId, epoch: tab.epoch, grantRevision: tab.grantRevision, untrustedPageContent: true as const, steps: log, observation }
      const code = typeof failure.code === 'string' ? failure.code : 'BROWSER_GUEST'
      const wrapped = fail(code as never, `Run stopped at step ${position} (${step.action}): ${String(failure.message ?? 'failed').slice(0, 300)}`)
      if (code === 'BROWSER_STALE' || code === 'BROWSER_TARGET' || code === 'BROWSER_INPUT' || code === 'BROWSER_HIDDEN' || code === 'BROWSER_GRANT' || code === 'BROWSER_RUN') (wrapped as { details?: unknown }).details = stopped
      throw wrapped
    }
  }

  if (request.finalObservation && observation === null && request.steps.at(-1)?.action !== 'observe') {
    const result = await request.runtime.execute(request.scope, {
      tabId: tab.tabId,
      epoch: tab.epoch,
      grantRevision: tab.grantRevision,
      command: { action: 'observe' },
    }, request.owner)
    observation = observationOf(result.result, request.textLimit, request.targetLimit)
    tab = await currentTab(request)
  }

  return { tabId: tab.tabId, epoch: tab.epoch, grantRevision: tab.grantRevision, untrustedPageContent: true, steps: log, observation }
}
