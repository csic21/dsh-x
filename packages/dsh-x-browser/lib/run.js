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
import { fail } from './contract/errors.js';
import { describeLabels, matchLabel } from './contract/batch.js';
/**
 * How long a step may take to produce a new document.
 *
 * An explicit navigation is expected to replace the document, so it gets a real
 * budget. A click usually does not, so it gets a short probe: waiting the full
 * budget for every ordinary click would cost more than it saves.
 */
const NAVIGATION_SETTLE_MS = 3000;
const CLICK_SETTLE_MS = 300;
const SETTLE_POLL_MS = 60;
/** Total time a single step may spend retrying an undelivered command. */
const UNSENT_BUDGET_MS = 8000;
const actionsNeedingTarget = new Set(['click', 'type']);
/** Read the mutable state of the run's tab, or fail when it is gone. */
async function readTab(request) {
    const list = await request.runtime.list(request.scope, { ownerToken: request.owner.ownerToken ?? null, assertCurrent: request.owner.assertCurrent, signal: request.owner.signal });
    return list.tabs.find(item => item.tabId === request.tabId);
}
/**
 * Wait until the document stops changing, so a command is stamped with the epoch the
 * page will still have when the renderer picks it up.
 *
 * The embedded backend binds every queued command to one document epoch, so issuing a
 * command while the page is mid-redirect is refused before the renderer ever sees it.
 * Waiting for a quiet window is what turns "retry until it happens to work" into a
 * predictable first-try success.
 */
async function waitForQuiet(request, quietMs = 300, capMs = 4000) {
    const deadline = Date.now() + capMs;
    let tab = await currentTab(request, 1200);
    let seen = tab.epoch, since = Date.now();
    while (Date.now() < deadline) {
        if (tab.epoch !== seen) {
            seen = tab.epoch;
            since = Date.now();
        }
        else if (Date.now() - since >= quietMs)
            return tab;
        await new Promise(resolve => setTimeout(resolve, 60));
        request.owner.signal?.throwIfAborted();
        tab = await currentTab(request, 1200);
    }
    return tab;
}
/**
 * Wait until the tab is granted *and stays granted* for a quiet window.
 *
 * A navigating click renews the grant about 400 ms after the document changes. Waiting
 * for `granted: true` alone is not enough: the old grant is still true right up to the
 * moment the renewal revokes it, so a step issued then lands in the gap. Requiring a
 * stable window across the renewal delay is what makes the next step safe.
 */
async function waitForStableGrant(request, quietMs = 900, capMs = 8000) {
    const deadline = Date.now() + capMs;
    let stable;
    for (;;) {
        const tab = await readTab(request);
        const at = Date.now();
        if (tab?.granted && (tab.visible || request.allowHidden === true)) {
            if (!stable || stable.epoch !== tab.epoch)
                stable = { epoch: tab.epoch, since: at };
            else if (at - stable.since >= quietMs)
                return tab;
        }
        else
            stable = undefined;
        if (at >= deadline)
            return await currentTab(request, 0);
        await new Promise(resolve => setTimeout(resolve, 100));
        request.owner.signal?.throwIfAborted();
    }
}
/**
 * Read the run's tab, tolerating the renewal window.
 *
 * A navigating click renews the grant a moment later under an unattended profile, so
 * a read that lands inside that window sees `granted: false`. Waiting briefly turns a
 * spurious failure into the ordinary case; a really revoked tab still fails.
 */
async function currentTab(request, patienceMs = 0) {
    const deadline = Date.now() + patienceMs;
    let tab = await readTab(request);
    while (tab && !tab.granted && tab.visible && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 80));
        request.owner.signal?.throwIfAborted();
        tab = await readTab(request);
    }
    if (!tab)
        throw fail('BROWSER_TARGET', 'The tab this run targets is gone. Open or refresh it, then start a new run.');
    if (!tab.visible && request.allowHidden !== true)
        throw fail('BROWSER_HIDDEN', 'The tab is hidden, so a run cannot continue. Show it and retry, or enable background mode.');
    if (!tab.granted)
        throw fail('BROWSER_GRANT', 'AI access ended during the run. Enable it again, then start a new run.');
    return tab;
}
/** Turn one observation result into the bounded target list a label can match. */
function targetsOf(result) {
    if (typeof result !== 'object' || result === null)
        return [];
    const targets = result.targets;
    if (!Array.isArray(targets))
        return [];
    return targets.flatMap((raw) => {
        if (typeof raw !== 'object' || raw === null)
            return [];
        const value = raw;
        if (typeof value.ref !== 'string' || !value.ref)
            return [];
        return [{
                ref: value.ref,
                tag: typeof value.tag === 'string' ? value.tag : undefined,
                type: typeof value.type === 'string' ? value.type : undefined,
                label: typeof value.label === 'string' ? value.label : undefined,
                editable: value.editable === true,
            }];
    });
}
/** Project one observation payload onto the bounded, model-facing shape. */
function observationOf(result, textLimit, targetLimit) {
    if (typeof result !== 'object' || result === null)
        return null;
    const value = result;
    if (typeof value.text !== 'string')
        return null;
    const text = value.text.length > textLimit ? `${value.text.slice(0, textLimit)}\n…[truncated]` : value.text;
    return {
        text,
        targets: targetsOf(result).slice(0, targetLimit),
        truncated: value.truncated === true || value.text.length > textLimit,
        url: typeof value.url === 'string' ? value.url : '',
        title: typeof value.title === 'string' ? value.title : '',
    };
}
/** Wait until the tab reports a document other than `from`, or the timeout expires. */
async function settle(request, from, budgetMs) {
    const deadline = Date.now() + budgetMs;
    let tab = await currentTab(request);
    while (tab.epoch === from && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, SETTLE_POLL_MS));
        request.owner.signal?.throwIfAborted();
        tab = await currentTab(request);
    }
    return tab;
}
/**
 * Execute one run.
 *
 * @param request - runtime, scope, owner, starting identity, steps and result bounds.
 * @returns per-step outcomes plus the final observation.
 * @throws BROWSER_INPUT, BROWSER_TARGET, BROWSER_HIDDEN, BROWSER_GRANT, BROWSER_STALE
 */
export async function runSequence(request) {
    const log = [];
    let tab = await currentTab(request, 1200);
    let observation = null;
    /** One retry per step is enough: `BROWSER_UNSENT` means the renderer never got it. */
    let retries = 0;
    /** Epoch before the step ran, plus the settle budget its action deserves. */
    let before = { epoch: tab.epoch, budget: 0 };
    /** Perform one step exactly once, resolving a label locator if the step names one. */
    async function attemptStep(step) {
        let target = step.target;
        // Never issue a command into a document that is still navigating.
        tab = await waitForQuiet(request);
        // A step that names a control instead of a reference needs a fresh observation
        // here, because the previous step invalidated every reference on the page.
        if (actionsNeedingTarget.has(step.action) && !target && step.label) {
            const probe = await request.runtime.execute(request.scope, {
                tabId: tab.tabId,
                epoch: tab.epoch,
                grantRevision: tab.grantRevision,
                command: { action: 'observe' },
            }, request.owner);
            tab = await currentTab(request);
            const targets = targetsOf(probe.result);
            const match = matchLabel(targets, step.label, step.action === 'type');
            if (!match)
                throw fail('BROWSER_TARGET', `No control on this page matches ${JSON.stringify(step.label)}. Visible labels: ${describeLabels(targets)}`);
            target = match.target.ref;
        }
        const command = step.action === 'click' || step.action === 'type'
            ? (step.action === 'click'
                ? { action: 'click', target: target }
                : { action: 'type', target: target, text: step.text })
            : step.action === 'navigate' ? { action: 'navigate', url: step.url }
                : step.action === 'press' ? { action: 'press', key: step.key }
                    : step.action === 'scroll' ? { action: 'scroll', x: step.x ?? 0, y: step.y ?? 0 }
                        : step.action === 'observe' ? { action: 'observe' }
                            : { action: step.action };
        const budget = step.action === 'navigate' || step.action === 'back' || step.action === 'forward' || step.action === 'reload'
            ? NAVIGATION_SETTLE_MS
            : step.action === 'click' ? CLICK_SETTLE_MS : 0;
        before = { epoch: tab.epoch, budget };
        const result = await request.runtime.execute(request.scope, { tabId: tab.tabId, epoch: tab.epoch, grantRevision: tab.grantRevision, command }, request.owner);
        return { result, target };
    }
    for (const [index, step] of request.steps.entries()) {
        const position = index + 1;
        try {
            // A page that redirects while a command is queued refuses it without ever
            // showing it to the renderer. That is the one failure worth replaying, and it
            // can hit the locating observation just as easily as the step itself.
            let outcome;
            const retryUntil = Date.now() + UNSENT_BUDGET_MS;
            for (;;) {
                try {
                    outcome = await attemptStep(step);
                    break;
                }
                catch (error) {
                    // A command the renderer never received is safe to replay, and a page that is
                    // still redirecting will keep refusing it. Retry with a time budget instead of
                    // a fixed count: the window between queueing and pickup is up to one poll
                    // interval, so a single extra attempt often lands in the same bad window.
                    const failure = error;
                    if (failure.code !== 'BROWSER_UNSENT' || Date.now() >= retryUntil)
                        throw error;
                    retries += 1;
                    request.owner.signal?.throwIfAborted();
                    tab = await waitForQuiet(request);
                }
            }
            const result = outcome.result;
            observation = observationOf(result.result, request.textLimit, request.targetLimit) ?? observation;
            // A click that navigates makes the renderer renew its grant a moment later, and
            // during that gap a new command is refused. Wait out the whole renewal before the
            // next step is issued, not just until the old grant stops looking valid.
            if (before.budget > 0) {
                tab = await waitForStableGrant(request);
                tab = await waitForQuiet(request);
            }
            else
                tab = await currentTab(request, 1200);
            // Only actions that can replace the document are worth a settle wait; typing,
            // pressing and scrolling cannot, and waiting for them would slow the run down.
            const budget = step.action === 'navigate' || step.action === 'back' || step.action === 'forward' || step.action === 'reload'
                ? NAVIGATION_SETTLE_MS
                : step.action === 'click' ? CLICK_SETTLE_MS : 0;
            if (before.budget > 0)
                tab = await settle(request, before.epoch, before.budget);
            log.push({ step: position, action: step.action, ok: true, note: outcome.target && step.label ? `matched ${JSON.stringify(step.label)}` : undefined });
        }
        catch (error) {
            const failure = error;
            // A delivered click whose document changed did what it was asked to. The broker
            // reports BROWSER_STALE because the acknowledgement raced the navigation, so
            // confirm the document actually moved and treat it as the success it is.
            if (step.action === 'click' && failure.code === 'BROWSER_STALE') {
                const after = await readTab(request).catch(() => undefined);
                if (after && after.epoch !== before.epoch) {
                    tab = after;
                    log.push({ step: position, action: step.action, ok: true, note: 'page changed' });
                    observation = null;
                    continue;
                }
            }
            log.push({ step: position, action: step.action, ok: false, note: String(failure.message ?? 'failed').slice(0, 300) });
            const stopped = { tabId: tab.tabId, epoch: tab.epoch, grantRevision: tab.grantRevision, untrustedPageContent: true, steps: log, observation };
            const code = typeof failure.code === 'string' ? failure.code : 'BROWSER_GUEST';
            const wrapped = fail(code, `Run stopped at step ${position} (${step.action}) [${typeof failure.code === 'string' ? failure.code : 'BROWSER_GUEST'}]: ${String(failure.message ?? 'failed').slice(0, 300)}`);
            if (code === 'BROWSER_STALE' || code === 'BROWSER_UNSENT' || code === 'BROWSER_TARGET' || code === 'BROWSER_INPUT' || code === 'BROWSER_HIDDEN' || code === 'BROWSER_GRANT' || code === 'BROWSER_RUN')
                wrapped.details = stopped;
            throw wrapped;
        }
    }
    if (request.finalObservation && observation === null && request.steps.at(-1)?.action !== 'observe') {
        const result = await request.runtime.execute(request.scope, {
            tabId: tab.tabId,
            epoch: tab.epoch,
            grantRevision: tab.grantRevision,
            command: { action: 'observe' },
        }, request.owner);
        observation = observationOf(result.result, request.textLimit, request.targetLimit);
        tab = await currentTab(request);
    }
    return { tabId: tab.tabId, epoch: tab.epoch, grantRevision: tab.grantRevision, untrustedPageContent: true, steps: log, observation };
}
