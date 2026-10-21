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
