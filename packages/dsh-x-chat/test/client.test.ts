import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React, { act, useState, useSyncExternalStore } from 'react'
import * as jsx from 'react/jsx-runtime'
import { en, zh, NS } from '../src/client/locales.ts'
import { chatViewModel } from '../src/client/model.ts'
import { ERROR_MESSAGES } from '../src/errors.ts'
import type { DshXChatErrorCode } from '../src/errors.ts'

const require = createRequire(import.meta.url)
const args = (value: Record<string, string>) => ({ text: (key: string) => value[key] as string | undefined })
const meta = { kind: 'dsh-x-chat', version: 1, answerBlocks: 1, provider: 'fixture', model: '模型-id', truncated: true }
const answer = '  Model answer 原文\n[回答达到输出 token 上限，内容可能不完整。]\n'
const warning = '[回答达到输出 token 上限，内容可能不完整。]'
// Fixture builder for recorded call material; overrides intentionally include
// malformed shapes the view must tolerate.
function result(extra: Record<string, unknown> = {}): any {
  return {
    kind: 'tool-result', name: 'dsh_x_chat', callId: 'call-1',
    args: args({ prompt: '  原问题 question\n', context: '原文 reference  ' }),
    call: null, content: [{ type: 'text', text: answer }, { type: 'text', text: warning }], isError: false, meta,
    ...extra,
  }
}

test('Chinese and English dictionaries cover identical chrome and all owned errors', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const code of Object.keys(ERROR_MESSAGES) as DshXChatErrorCode[]) {
    assert.ok(en[`error.${code}`])
    assert.equal(zh[`error.${code}`], ERROR_MESSAGES[code])
  }
  for (const dictionary of [en, zh]) {
    for (const value of Object.values(dictionary)) assert.equal(typeof value, 'string')
  }
})

test('presentation reads identities and metadata, never translated text', () => {
  for (const code of Object.keys(ERROR_MESSAGES) as DshXChatErrorCode[]) {
    const view = chatViewModel('result', result({ isError: true, error: { name: 'DshXChatError', code } }))
    assert.equal(view.errorKey, `error.${code}`)
    assert.equal(view.text, '')
  }
  const unowned = chatViewModel('result', result({ isError: true, error: { name: 'ThirdPartyError', code: 'DSH_X_CHAT_TIMEOUT' }, content: [{ type: 'text', text: zh['error.DSH_X_CHAT_TIMEOUT'] }] }))
  assert.equal(unowned.errorKey, 'error.unknown')
  assert.equal(chatViewModel('result', result({ isError: true, error: { code: 'interrupted' } })).state, 'cancelled')
  assert.equal(chatViewModel('result', result({ meta: { ...meta, version: 2 } })).truncated, false)
  assert.equal(chatViewModel('result', result({ meta: { ...meta, truncated: 'true' } })).truncated, false)
  assert.equal(chatViewModel('result', result({ meta: undefined })).text, `${answer}\n${warning}`)
  assert.equal(chatViewModel('result', result({ content: [{ type: 'text', text: answer }] })).truncated, false)
  assert.equal(chatViewModel('result', result({ meta: { ...meta, answerBlocks: 2 } })).truncated, false)
  assert.equal(chatViewModel('result', result()).truncated, true)
  assert.equal(chatViewModel('preparing', { args: args({ prompt: 'part' }) }).state, 'preparing')
  assert.equal(chatViewModel('start', { args: args({ prompt: 'part' }) }).state, 'running')
})

async function loadFactory(path: string | URL, imports: (name: string) => unknown, globals: Record<string, unknown> = {}): Promise<any> {
  let loaded: any
  vm.runInNewContext(await readFile(path, 'utf8'), {
    ...globals,
    window: { __ModuleLoader__: { load(row: any) { loaded = { id: row.id, exports: row.factory(imports) } } } },
    console,
  })
  return loaded
}

test('built client follows official live locale changes, preserves content and disclosure, and disposes', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>')
  const original = { window: (globalThis as any).window, document: (globalThis as any).document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  ;(globalThis as any).document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  let root: any
  const effects: any[] = [], slotDisposers: Array<() => void> = [], entries: any[] = []
  try {
    // Exercise the installed official LocaleRuntime. Its unrelated settings UI
    // dependencies are not invoked by this registry-only fixture.
    const official = await loadFactory(require.resolve('@deepseek-ai/dsh-client-locale/client'), (name: string) => {
      if (name === 'react') return React
      if (name === 'react/jsx-runtime') return jsx
      assert.ok(['@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-store'].includes(name))
      return {}
    })
    const locale = new official.exports.LocaleRuntime({ emit() {} }, undefined, { languages: ['en'], preference: null })
    const plugin = await loadFactory(new URL('../lib/client.js', import.meta.url), (name: string) => {
      assert.equal(name, 'react')
      return React
    }, { document: dom.window.document })
    assert.equal(plugin.id, 'dsh-x-chat')
    assert.deepEqual(Array.from(plugin.exports.inject), ['slots', 'locale'])
    plugin.exports.apply({
      locale,
      effect(fn: () => unknown) { const dispose = fn(); effects.push(dispose); return dispose },
      slots: {
        inject(name: string, fn: () => () => void) { assert.equal(name, 'tool.call.toolview'); const dispose = fn(); slotDisposers.push(dispose); return dispose },
        register(options: { key: string; locale: string }, component: unknown) { const entry = { options, component }; entries.push(entry); return () => entries.splice(entries.indexOf(entry), 1) },
      },
    })
    const [entry] = entries
    assert.equal(entry.options.key, 'dsh_x_chat')
    assert.equal(entry.options.locale, NS)
    assert.equal(entries.length, 1)
    const subscribe = (callback: () => void) => locale.subscribe(callback)
    const getSnapshot = () => locale.getSnapshot()
    const t = locale.bind(NS)
    function useDisclosure() {
      const [expanded, setExpanded] = useState(false)
      return { expanded, setExpanded, toggle: () => setExpanded(value => !value) }
    }
    let inspections = 0
    function Render(props: { phase: string, block: unknown }) {
      useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      return React.createElement(entry.component, { ...props, t, inspect: () => { inspections++ }, useDisclosure })
    }
    const { createRoot } = await import('react-dom/client')
    root = createRoot(document.getElementById('app')!)
    const render = async (phase = 'result', block: unknown = result()) => act(async () => root.render(React.createElement(Render, { phase, block })))
    const click = async (selector: string) => act(async () => document.querySelector(selector)!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await render()
    assert.match(document.body.textContent ?? '', /Read-only Q&A/)
    assert.match(document.body.textContent ?? '', /Answer ready/)
    assert.match(document.body.textContent ?? '', /may be incomplete/)
    await click('.dxc-disclosure')
    assert.equal(document.querySelector('.dxc-answer')!.textContent, answer)
    assert.equal(document.querySelector('[data-chat-field="prompt"]')!.textContent, '  原问题 question\n')
    assert.equal(document.querySelector('[data-chat-field="context"]')!.textContent, '原文 reference  ')
    await act(async () => locale.setLocale('zh'))
    assert.match(document.body.textContent ?? '', /只读问答/)
    assert.match(document.body.textContent ?? '', /回答已完成/)
    assert.equal(document.querySelector('.dxc-warning')!.textContent, zh.truncated)
    assert.equal(document.querySelector('.dxc-answer')!.textContent, answer)
    assert.equal(document.querySelector('.dxc-disclosure')!.getAttribute('aria-label'), zh['details.hide'])
    assert.equal(document.querySelector('.dxc-inspect')!.getAttribute('title'), zh.inspect)
    await click('.dxc-inspect')
    assert.equal(inspections, 1)
    await act(async () => locale.setLocale('en'))
    assert.equal(document.querySelector('.dxc-answer')!.textContent, answer)
    assert.equal(document.querySelector('.dxc-disclosure')!.getAttribute('aria-expanded'), 'true')
    await act(async () => { locale.addLanguage({ id: 'fr', label: 'Français', fallback: 'en' }); locale.setLocale('fr') })
    assert.equal(document.querySelector('section')!.getAttribute('aria-label'), en.title)
    assert.equal(document.querySelector('.dxc-warning')!.textContent, en.truncated)
    await render('start', { args: args({ prompt: 'still original' }) })
    assert.match(document.body.textContent ?? '', /Generating answer/)
    await act(async () => locale.setLocale('zh'))
    assert.match(document.body.textContent ?? '', /正在生成回答/)
    await render('preparing', { args: args({ prompt: 'part' }) })
    assert.match(document.body.textContent ?? '', /正在准备问题/)
    for (const language of ['en', 'zh']) {
      await act(async () => locale.setLocale(language))
      for (const code of Object.keys(ERROR_MESSAGES) as DshXChatErrorCode[]) {
        await render('result', result({ isError: true, error: { name: 'DshXChatError', code }, content: [{ type: 'text', text: 'DO NOT DISPLAY raw diagnostics' }] }))
        assert.equal(document.querySelector('[role="alert"]')!.textContent, (language === 'en' ? en : zh)[`error.${code}`])
        assert.doesNotMatch(document.body.textContent ?? '', /DO NOT DISPLAY/)
        assert.equal(document.querySelector('.dxc-warning'), null)
      }
    }
    await render('result', result({ isError: true, error: { name: 'OtherError', code: 'UNKNOWN' } }))
    assert.equal(document.querySelector('[role="alert"]')!.textContent, zh['error.unknown'])
    await render('result', result({ content: [], meta: null }))
    assert.match(document.body.textContent ?? '', /没有可显示的已记录回答/)
    await render('result', result({ meta: null, content: [{ type: 'text', text: answer }] }))
    assert.equal(document.querySelector('.dxc-warning'), null)
    assert.equal(document.querySelector('.dxc-answer')!.textContent, answer)
    await act(async () => root.unmount())
    root = undefined
    slotDisposers.reverse().forEach(dispose => dispose())
    effects.reverse().forEach(dispose => dispose())
    assert.equal(entries.length, 0)
    assert.equal(document.querySelector('style[data-plugin="dsh-x-chat"]'), null)
    assert.equal(locale.bind(NS)('title'), 'title')
  } finally {
    if (root) await act(async () => root.unmount())
    dom.window.close()
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete (globalThis as any)[key]
      else (globalThis as any)[key] = value
    }
  }
})

test('published manifest exports the browser client and bilingual plugin metadata', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'))
  assert.ok(manifest.files.includes('locale/*.json'))
  for (const language of ['en', 'zh']) {
    const data = JSON.parse(await readFile(new URL(`../locale/${language}.json`, import.meta.url), 'utf8'))
    assert.equal(data.meta.title, (language === 'en' ? en : zh).title)
    assert.ok(data.meta.description)
  }
})
