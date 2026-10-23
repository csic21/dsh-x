import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { zh, en, NS, errorKey } from '../src/client/locales.ts'
import { quoteErrorKey } from '../src/quote-messages.ts'
import { createFormatters, formatLocale } from '../src/client/format.ts'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'
import { createWatchlistController } from '../src/client/controller.ts'
import { quoteStatus } from '../src/watchlist.ts'

const placeholders = (value: any) => [...value.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort()
test('stock dictionaries have identical keys and interpolation contracts', async () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const key of Object.keys(zh)) { assert.ok(en[key as keyof typeof en]); assert.deepEqual(placeholders(en[key as keyof typeof en]), placeholders(zh[key as keyof typeof zh]), key) }
  for (const locale of ['en', 'zh'] as const) {
    const meta = JSON.parse(await readFile(new URL(`../locale/${locale}.json`, import.meta.url), 'utf8')).meta
    assert.ok(meta.title); assert.ok(meta.description)
  }
})
test('official locale registry resolves live switches, regional packs and English fallback', async () => {
  const locale = await createOfficialLocale('en')
  const dispose = locale.register(NS, { zh, en })
  const t = locale.bind(NS), format = createFormatters(() => locale.getLocale().active)
  assert.equal(t('title'), 'Finance')
  assert.equal(format.price(1234.5), '1,234.50')
  assert.equal(format.change(1.2), '+1.20%')
  assert.equal(format.change(-1.2), '-1.20%')
  assert.equal(format.change(0), '0.00%')
  assert.equal(format.price(null), '—')
  assert.equal(format.time('bad', t), 'Not provided')
  locale.setLocale('zh')
  assert.equal(t('title'), '金融')
  assert.equal(format.time(null, t), '未提供')
  assert.match(format.time('2026-10-16T16:00:00Z', t), /2026\/10\/17 00:00:00（上海）/)
  ;(locale as any).addLanguage({ id: 'zh-Hant', label: '繁體中文', fallback: 'zh' })
  locale.setLocale('zh-Hant')
  assert.equal(t('title'), '金融')
  ;(locale as any).addLanguage({ id: 'de-DE', label: 'Deutsch', fallback: 'en' })
  locale.setLocale('de-DE')
  assert.equal(t('title'), 'Finance')
  assert.equal(format.price(1234.5), '1.234,50')
  assert.equal(format.change(1.2), '+1,20\u00a0%')
  assert.equal(formatLocale('not_a_locale'), 'en')
  assert.equal(formatLocale('xx'), 'en')
  dispose()
})
test('stable stock statuses and errors never depend on localized text', () => {
  const controller = createWatchlistController()
  assert.throws(() => controller.add({ symbol: 'SH.600519' }), { code: 'scope-loading' })
  controller.setScope('11111111-1111-4111-8111-111111111111')
  controller.add({ symbol: 'SH.600519', alias: '贵州茅台' })
  assert.equal(controller.source.getSnapshot().storageError, 'storage-save')
  assert.equal(controller.source.getSnapshot().items[0].alias, '贵州茅台')
  assert.equal(errorKey('finance/offline'), 'error.offline')
  assert.equal(errorKey('foreign sensitive error'), 'error.unknown')
  assert.equal(quoteErrorKey({ name: 'DshXFinanceError', code: 'DSH_X_FINANCE_MISSING_KEY' }), 'quote.error.MISSING_KEY')
  assert.equal(quoteErrorKey({ code: 'DSH_X_FINANCE_MISSING_KEY' }), 'quote.error.UNKNOWN')
  assert.equal(quoteStatus({ quotedAt: 'invalid' }), 'unknown-time')
  assert.equal(quoteStatus({ quotedAt: '2026-10-16T07:00:00Z', marketStatus: 'closed' }, Date.parse('2026-10-16T07:01:00Z')), 'closed')
})
