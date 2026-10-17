// The published official runtime owns resolution and fallback. Only unrelated
// settings-row UI modules are inert in this DOM fixture.
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import * as jsx from 'react/jsx-runtime'
const require = createRequire(import.meta.url)
export async function createOfficialLocale(initial = 'zh') {
  let exported
  const dependencies = { react: React, 'react/jsx-runtime': jsx, '@deepseek-ai/dsh-client-ui-primitives': {}, '@deepseek-ai/dsh-client-store': {} }
  vm.runInNewContext(await readFile(require.resolve('@deepseek-ai/dsh-client-locale/client'), 'utf8'), {
    window: { __ModuleLoader__: { load(entry) { exported = entry.factory(name => { if (!(name in dependencies)) throw new Error(`Unexpected locale dependency: ${name}`); return dependencies[name] }) } } },
    navigator: { languages: [initial] },
  })
  const locale = new exported.LocaleRuntime({ emit() {}, effect() {} })
  locale.setLocale(initial)
  return locale
}
