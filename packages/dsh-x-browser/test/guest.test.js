import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { createGuest } from '../src/client/guest.js'
import { helperScript } from '../src/client/dom-helper.js'
function fixture(options = {}) {
  const events = new Map(), calls = [], attrs = {}, invalidations = []
  let url = '', title = '', destroyed = false
  const element = { className: '', dataset: {}, setAttribute(k, v) { attrs[k] = v }, addEventListener(k, v) { events.set(k, [...events.get(k) ?? [], v]) }, removeEventListener(k, v) { events.set(k, (events.get(k) ?? []).filter(fn => fn !== v)) },
    remove() { destroyed = true }, getURL: () => url, getTitle: () => title, canGoBack: () => false, canGoForward: () => false,
    async loadURL(value) { calls.push(['loadURL', value]); emit('did-start-navigation', { isMainFrame: true }); url = value; title = 'Fixture'; emit('did-navigate'); emit('dom-ready'); emit('did-stop-loading') },
    executeJavaScript: async script => { calls.push(['helper', script]); return script.endsWith('{"action":"observe"})') ? { text: 'Visible fixture', targets: [{ index: 0, tag: 'input', type: 'text', label: 'Name', fingerprint: 'fixed', editable: true }] } : { x: 40, y: 50 } },
    sendInputEvent: async value => { calls.push(['input', value]) }, insertText: async value => { calls.push(['text', value]) }, capturePage: async () => {}, reload() { calls.push(['reload']) }, ...options.element,
  }
  function emit(name, values = {}) { for (const callback of events.get(name) ?? []) callback(values) }
  const desktop = { protocolVersion: 1, browser: { acquire: async workspace => { calls.push(['acquire', workspace]); return { lease: 'lease-owned', partition: 'partition-owned' } }, release: async lease => calls.push(['release', lease]), onOpenRequested: () => () => {} } }
  const host = { append(value) { assert.equal(value, element); queueMicrotask(() => emit('dom-ready')) } }
  const guest = createGuest({ desktop, workspace: 'workspace', host, applicationOrigin: 'http://localhost:9000', documentObject: { createElement: tag => { assert.equal(tag, 'webview'); return element } }, onInvalidate: (reason, navigation) => invalidations.push([reason, navigation]) })
  return { guest, element, attrs, calls, emit, invalidations, destroyed: () => destroyed }
}
test('guest adapter calls reviewed Electron APIs on one owned mock webview (unit only)', async t => {
  const f = fixture(); t.after(() => f.guest.dispose()); await f.guest.start()
  assert.equal(f.attrs.name, 'lease-owned'); assert.equal(f.attrs.partition, 'partition-owned'); assert.equal(f.attrs.src, 'about:blank#lease-owned'); assert.equal(f.attrs.preload, undefined)
  f.guest.grant(1)
  const result = await f.guest.perform({ id: 'observe', epoch: 0, grantRevision: 1, action: 'observe' })
  assert.equal(result.result.targets[0].ref, 'e0:s1:n0')
  await f.guest.perform({ id: 'type', epoch: 0, grantRevision: 1, action: 'type', target: result.result.targets[0].ref, text: 'test' })
  assert.deepEqual(f.calls.find(call => call[0] === 'text'), ['text', 'test'])
  await assert.rejects(f.guest.perform({ id: 'click', epoch: 0, grantRevision: 1, action: 'click', target: result.result.targets[0].ref }), { code: 'BROWSER_TARGET' })
  const second = await f.guest.perform({ id: 'observe2', epoch: 0, grantRevision: 1, action: 'observe' })
  await f.guest.perform({ id: 'click2', epoch: 0, grantRevision: 1, action: 'click', target: second.result.targets[0].ref })
  assert.deepEqual(f.calls.filter(call => call[0] === 'input').map(call => call[1].type), ['mouseDown', 'mouseUp'])
})
test('takeover during awaited helper prevents later input; guest navigation invalidates old refs', async t => {
  const f = fixture(); t.after(() => f.guest.dispose()); await f.guest.start(); f.guest.grant(1)
  const observed = await f.guest.perform({ id: 'o', epoch: 0, grantRevision: 1, action: 'observe' })
  let resolve
  f.element.executeJavaScript = () => new Promise(done => { resolve = done })
  const pending = f.guest.perform({ id: 'c', epoch: 0, grantRevision: 1, action: 'click', target: observed.result.targets[0].ref })
  f.guest.revoke(); resolve({ x: 1, y: 2 })
  await assert.rejects(pending, { code: 'BROWSER_STALE' }); assert.equal(f.calls.some(call => call[0] === 'input'), false)
  f.guest.grant(3); await f.guest.perform({ id: 'n', epoch: 0, grantRevision: 3, action: 'navigate', url: 'https://example.test/' })
  assert.equal(f.guest.state().epoch, 1)
  await assert.rejects(f.guest.perform({ id: 'old', epoch: 0, grantRevision: 3, action: 'observe' }), { code: 'BROWSER_STALE' })
})
test('no browser fallback exists; guest APIs cannot navigate application host or credential URLs', async () => {
  const unavailable = createGuest({ desktop: null, workspace: 'w', host: {}, documentObject: {} })
  await assert.rejects(unavailable.start(), { code: 'BROWSER_DESKTOP' })
  const f = fixture(); await f.guest.start(); f.guest.grant(1)
  await assert.rejects(f.guest.perform({ id: 'n', epoch: 0, grantRevision: 1, action: 'navigate', url: 'http://127.0.0.1:9000/' }), { code: 'BROWSER_HOST' })
  await assert.rejects(f.guest.navigate('https://user:pass@example.test/'), { code: 'BROWSER_URL' })
  await f.guest.dispose(); await f.guest.dispose()
  assert.equal(f.calls.filter(call => call[0] === 'release').length, 1); assert.equal(f.destroyed(), true)
})
test('fixed helper omits form values, password targets and hidden content; serialized text cannot become code', () => {
  const dom = new JSDOM('<body><p>Visible words</p><p hidden>hidden secret</p><input id="name" aria-label="Fixture name" value="private-value"><input type="password" value="do-not-read"><textarea>private-text</textarea><label>Verification code<input name="verification_code" value="112233"></label><input aria-label="Card number" autocomplete="off"><input placeholder="验证码"><input name="otp"><button aria-label="Apply">Apply</button></body>', { runScripts: 'outside-only' })
  const win = dom.window
  win.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 20 })
  const observed = vm.runInContext(helperScript({ action: 'observe' }), dom.getInternalVMContext())
  assert.match(observed.text, /Visible words/); assert.doesNotMatch(observed.text, /hidden secret|private-value|do-not-read|private-text/)
  assert.equal(observed.targets.some(target => target.type === 'password'), false)
  assert.equal(observed.targets.some(target => target.label === 'Fixture name'), true)
  assert.equal(observed.targets.filter(target => target.tag === 'input').length, 1)
  const invalid = vm.runInContext(helperScript({ action: 'bad");globalThis.injected=true;("' }), dom.getInternalVMContext())
  assert.match(invalid.error, /Unsupported/); assert.equal(win.injected, undefined)
  dom.window.close()
})

test('actual observation result strips URL query and fragment before model output', async t => {
 const f = fixture(); t.after(() => f.guest.dispose()); await f.guest.start(); await f.guest.navigate('https://example.test/page?token=secret#private'); f.guest.grant(1)
 const observed = await f.guest.perform({ id: 'o', epoch: 1, grantRevision: 1, action: 'observe' })
 assert.equal(observed.result.url, 'https://example.test/page'); assert.doesNotMatch(JSON.stringify(observed), /token=secret|#private/)
})
