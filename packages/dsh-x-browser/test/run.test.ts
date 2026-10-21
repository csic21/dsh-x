import test from 'node:test'
import assert from 'node:assert/strict'
import { matchLabel, validateRun } from '../src/contract/batch.ts'
import { runSequence } from '../src/run.ts'
import type { BrowserRuntime, RuntimeResult, RuntimeTarget } from '../src/runtime.ts'

const scope = { profile: 'p', sessionId: 's', workspace: '/w' }

/** One fake tab that mutates on the commands the run issues. */
function fixture(options: { targets?: { ref: string, label: string, editable?: boolean }[], failOn?: string } = {}) {
  const targets = options.targets ?? [
    { ref: 'e1:s1:n0', label: '点我 +1' },
    { ref: 'e1:s1:n1', label: '测试输入框', editable: true },
  ]
  let epoch = 1, revision = 5, granted = true, visible = true
  const commands: { action: string, [key: string]: unknown }[] = []
  const tab = (): RuntimeTarget => ({ tabId: 't1', sessionId: 's', epoch, grantRevision: revision, visible, granted, title: 'Fixture', url: 'https://example.test/', busy: false, status: 'ready' })
  const runtime: BrowserRuntime = {
    kind: 'embedded',
    async list() { return { tabs: [tab()], runtime: 'dsh', nativeRuntimes: [], experimental: true } },
    async execute(_scope, args): Promise<RuntimeResult> {
      commands.push(args.command as never)
      if (options.failOn && args.command.action === options.failOn) throw Object.assign(new Error('The page refused that control.'), { code: 'BROWSER_TARGET' })
      if (args.command.action === 'observe') {
        return { tabId: 't1', epoch, grantRevision: revision, untrustedPageContent: true, result: { text: 'Visible fixture page', targets, url: 'https://example.test/', title: 'Fixture' } }
      }
      if (args.command.action === 'navigate' || (args.command.action === 'click' && String((args.command as { target?: string }).target).endsWith('nav'))) epoch += 1
      return { tabId: 't1', epoch, grantRevision: revision, untrustedPageContent: true, result: { action: args.command.action, status: 'input-sent' } }
    },
    async dispose() {},
  }
  return { runtime, commands, tab, setGranted: (value: boolean) => { granted = value }, setVisible: (value: boolean) => { visible = value }, bumpEpoch: () => { epoch += 1 } }
}

test('run validation rejects unknown fields, oversized runs and steps without a target', () => {
  assert.throws(() => validateRun([]), { code: 'BROWSER_INPUT' })
  assert.throws(() => validateRun([{ action: 'click' }]), { code: 'BROWSER_INPUT' })
  assert.throws(() => validateRun([{ action: 'click', label: 'x', nope: 1 }]), { code: 'BROWSER_INPUT' })
  assert.throws(() => validateRun([{ action: 'hover', label: 'x' }]), { code: 'BROWSER_INPUT' })
  assert.throws(() => validateRun(Array.from({ length: 21 }, () => ({ action: 'observe' }))), { code: 'BROWSER_INPUT' })
  assert.deepEqual(validateRun([{ action: 'observe' }]), [{ action: 'observe' }])
})

test('label matching prefers an exact label and an editable control', () => {
  const targets = [
    { ref: 'a', label: 'Search settings' },
    { ref: 'b', label: 'Search' },
    { ref: 'c', label: 'Search', editable: true },
  ]
  assert.equal(matchLabel(targets, 'search')?.target.ref, 'c')
  assert.equal(matchLabel(targets, 'settings')?.target.ref, 'a')
  assert.equal(matchLabel(targets, 'missing'), undefined)
  assert.equal(matchLabel([{ ref: 'x', label: 'Name' }], 'name', true), undefined)
})

test('a run resolves labels internally and returns one bounded observation', async () => {
  const f = fixture()
  const run = await runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '点我 +1' },
    { action: 'type', label: '测试输入框', text: '你好' },
  ]), textLimit: 4000, targetLimit: 40, finalObservation: true })
  assert.equal(run.steps.length, 2)
  assert.deepEqual(run.steps.map(step => step.ok), [true, true])
  assert.equal(run.observation?.text, 'Visible fixture page')
  // click(locate) => observe, click, observe(settle probe) ... the run must never send
  // a click without a reference the page just offered.
  assert.ok(f.commands.some(command => command.action === 'click' && command.target === 'e1:s1:n0'))
  assert.ok(f.commands.some(command => command.action === 'type' && command.target === 'e1:s1:n1' && command.text === '你好'))
  assert.equal(run.tabId, 't1')
})

test('a run lets a navigating click settle before the next step', async () => {
  const f = fixture({ targets: [{ ref: 'e1:s1:nav', label: '跳到第二页' }] })
  const run = await runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '跳到第二页' },
    { action: 'observe' },
  ]), textLimit: 1000, targetLimit: 10, finalObservation: true })
  assert.equal(run.epoch, 2)
  assert.deepEqual(run.steps.map(step => step.ok), [true, true])
})

test('a failing step stops the run and names the step', async () => {
  const f = fixture({ failOn: 'click' })
  await assert.rejects(runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'observe' },
    { action: 'click', label: '点我 +1' },
    { action: 'observe' },
  ]), textLimit: 1000, targetLimit: 10, finalObservation: true }), (error: any) => {
    assert.equal(error.code, 'BROWSER_TARGET')
    assert.match(String(error.message), /Run stopped at step 2 \(click\)/)
    return true
  })
  assert.equal(f.commands.filter(command => command.action === 'observe').length, 2)
})

test('a run refuses to continue when the grant or the tab disappears', async () => {
  const hidden = fixture(); hidden.setVisible(false)
  await assert.rejects(runSequence({ runtime: hidden.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([{ action: 'observe' }]), textLimit: 1000, targetLimit: 10, finalObservation: false }), { code: 'BROWSER_HIDDEN' })
  const revoked = fixture(); revoked.setGranted(false)
  await assert.rejects(runSequence({ runtime: revoked.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([{ action: 'observe' }]), textLimit: 1000, targetLimit: 10, finalObservation: false }), { code: 'BROWSER_GRANT' })
})

test('a step whose command was never delivered is retried once; a stale delivered step is not', async t => {
  let attempts = 0
  const f = fixture()
  const original = f.runtime.execute.bind(f.runtime)
  f.runtime.execute = async (scope, args, owner) => {
    if (args.command.action === 'click' && attempts++ === 0) throw Object.assign(new Error('The page changed before the queued command ran.'), { code: 'BROWSER_UNSENT' })
    return original(scope, args, owner)
  }
  const run = await runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '点我 +1' },
  ]), textLimit: 500, targetLimit: 5, finalObservation: false })
  assert.equal(attempts, 2)
  assert.deepEqual(run.steps.map(step => step.ok), [true])

  const g = fixture()
  const base = g.runtime.execute.bind(g.runtime)
  let delivered = 0
  g.runtime.execute = async (scope, args, owner) => {
    if (args.command.action === 'click') { delivered += 1; throw Object.assign(new Error('The page changed after the command was delivered.'), { code: 'BROWSER_STALE' }) }
    return base(scope, args, owner)
  }
  await assert.rejects(runSequence({ runtime: g.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '点我 +1' },
  ]), textLimit: 500, targetLimit: 5, finalObservation: false }), { code: 'BROWSER_STALE' })
  assert.equal(delivered, 1)
})

test('a locating observation refused before delivery is retried with the step', async t => {
  let probes = 0
  const f = fixture()
  const base = f.runtime.execute.bind(f.runtime)
  f.runtime.execute = async (scope, args, owner) => {
    // This is exactly what a redirecting page does: the probe is refused before the
    // renderer ever sees it, and the run must resolve the label again afterwards.
    if (args.command.action === 'observe' && args.command.action === 'observe' && probes++ === 0) throw Object.assign(new Error('The page changed before the queued command ran.'), { code: 'BROWSER_UNSENT' })
    return base(scope, args, owner)
  }
  const run = await runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '点我 +1' },
  ]), textLimit: 500, targetLimit: 5, finalObservation: false })
  assert.equal(probes, 2)
  assert.deepEqual(run.steps.map(step => step.ok), [true])
})

test('a click that lands but loses its acknowledgement to the navigation counts as success', async t => {
  const f = fixture()
  const base = f.runtime.execute.bind(f.runtime)
  f.runtime.execute = async (scope, args, owner) => {
    if (args.command.action === 'click') {
      f.bumpEpoch()
      throw Object.assign(new Error('The page changed after the command was delivered.'), { code: 'BROWSER_STALE' })
    }
    return base(scope, args, owner)
  }
  const run = await runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '点我 +1' },
  ]), textLimit: 500, targetLimit: 5, finalObservation: true })
  assert.deepEqual(run.steps.map(step => step.ok), [true])
  assert.equal(run.steps[0].note, 'page changed')
  assert.equal(run.epoch, 2)
})

test('a run waits through the brief window where a renewed grant reports not granted', async t => {
  const f = fixture()
  f.setGranted(false)
  setTimeout(() => f.setGranted(true), 150)
  const run = await runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'observe' },
  ]), textLimit: 200, targetLimit: 3, finalObservation: false })
  assert.deepEqual(run.steps.map(step => step.ok), [true])
})

test('a run waits for a still-redirecting page instead of issuing a doomed command', async t => {
  const f = fixture()
  // Two quick document changes, exactly like google.com -> .com.hk -> /search.
  f.bumpEpoch()
  setTimeout(() => f.bumpEpoch(), 80)
  setTimeout(() => f.bumpEpoch(), 160)
  const started = Date.now()
  const run = await runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 3, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '点我 +1' },
  ]), textLimit: 300, targetLimit: 5, finalObservation: false })
  assert.deepEqual(run.steps.map(step => step.ok), [true])
  // The run must have waited out the redirect before clicking.
  assert.ok(Date.now() - started >= 250, `waited ${Date.now() - started}ms`)
  assert.equal(f.commands.filter(command => command.action === 'click').length, 1)
})

test('an undelivered step retries within its budget instead of a fixed count', async t => {
  const f = fixture()
  const base = f.runtime.execute.bind(f.runtime)
  let refusals = 0
  f.runtime.execute = async (scope, args, owner) => {
    // Refuse the first three arrivals, as a slow multi-hop redirect would.
    if (args.command.action !== 'observe' && refusals++ < 3) throw Object.assign(new Error('The page changed before the queued command ran.'), { code: 'BROWSER_UNSENT' })
    return base(scope, args, owner)
  }
  const run = await runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '点我 +1' },
  ]), textLimit: 200, targetLimit: 3, finalObservation: false })
  assert.equal(refusals, 4)
  assert.deepEqual(run.steps.map(step => step.ok), [true])
})

test('the retry budget is finite, so a permanently broken page still fails', async t => {
  const f = fixture()
  f.runtime.execute = async () => { throw Object.assign(new Error('The page changed before the queued command ran.'), { code: 'BROWSER_UNSENT' }) }
  await assert.rejects(runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '点我 +1' },
  ]), textLimit: 200, targetLimit: 3, finalObservation: false }), { code: 'BROWSER_UNSENT' })
})

test('a run waits for the renewed grant after a navigating click before issuing the next step', async t => {
  const f = fixture()
  const base = f.runtime.execute.bind(f.runtime)
  f.runtime.execute = async (scope, args, owner) => {
    if (args.command.action === 'click') {
      f.bumpEpoch()
      // The renderer renews its grant shortly after the document changes.
      f.setGranted(false)
      setTimeout(() => f.setGranted(true), 150)
      return { tabId: 't1', epoch: 2, grantRevision: 5, untrustedPageContent: true, result: { status: 'input-sent' } }
    }
    return base(scope, args, owner)
  }
  const run = await runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '点我 +1' },
    { action: 'observe' },
  ]), textLimit: 200, targetLimit: 3, finalObservation: true })
  assert.deepEqual(run.steps.map(step => step.ok), [true, true])
})

test('the step after a navigating click waits out the renewal revocation, not just the old grant', async t => {
  const f = fixture()
  const base = f.runtime.execute.bind(f.runtime)
  const marks: { action: string, at: number }[] = []
  f.runtime.execute = async (scope, args, owner) => {
    marks.push({ action: args.command.action, at: Date.now() })
    if (args.command.action === 'click') {
      f.bumpEpoch()
      // The real renderer keeps the old grant valid for ~400ms, then revokes for the
      // renewal, then grants again. Anything issued inside that gap is refused.
      setTimeout(() => f.setGranted(false), 400)
      setTimeout(() => f.setGranted(true), 700)
      return { tabId: 't1', epoch: 2, grantRevision: 5, untrustedPageContent: true, result: { status: 'input-sent' } }
    }
    return base(scope, args, owner)
  }
  const started = Date.now()
  const run = await runSequence({ runtime: f.runtime, scope, owner: {}, tabId: 't1', epoch: 1, grantRevision: 5, steps: validateRun([
    { action: 'click', label: '点我 +1' },
    { action: 'observe' },
  ]), textLimit: 200, targetLimit: 3, finalObservation: true })
  assert.deepEqual(run.steps.map(step => step.ok), [true, true])
  // The observe must have been issued after the renewal finished (>=700ms), never in
  // the 400-700ms gap where the client is mid-renewal.
  const observe = marks.filter(mark => mark.action === 'observe').at(-1)!
  assert.ok(observe.at - started >= 690, `observe issued at ${observe.at - started}ms`)
})
