import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../src/index.ts'

const NAME = '贵州茅台'
function payload() {
  const fields = Array.from({ length: 50 }, () => '')
  Object.assign(fields, {
    0: '1', 1: NAME, 2: '600519', 3: '1329.00', 4: '1312.97', 5: '1311.57',
    6: '38502', 29: '', 30: '20261016161447', 31: '16.03', 32: '1.22', 33: '1329.88', 34: '1301.68',
  })
  return `v_sh600519="${fields.join('~')}";`
}

function gbk(text: string) {
  const start = text.indexOf(NAME)
  return Buffer.concat([
    Buffer.from(text.slice(0, start), 'ascii'),
    Buffer.from('b9f3d6ddc3a9cca8', 'hex'),
    Buffer.from(text.slice(start + NAME.length), 'ascii'),
  ])
}

function harness() {
  const routes: any[] = []
  const ctx: any = {
    tools: { register() {} },
    inject(_deps: any, callback: any) {
      callback({
        connection: { fetch: { register: (route: any) => routes.push(route) } },
        profileContext: { dir: '/tmp' },
      })
    },
  }
  return { ctx, routes }
}

async function call(routes: any[]) {
  const route = routes.find(item => item.path === '/api/dsh-x-stock.quotes')
  const request = new Request('http://localhost/api/dsh-x-stock.quotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request', rpcId: 'r1', method: 'dsh-x-stock.quotes', payload: { symbols: ['SH.600519'] },
    }),
  })
  return (await (await route.fetch(request)).json()) as any
}

test('defaults to no provider: the route reports unconfigured and never fetches', async () => {
  const original = globalThis.fetch
  globalThis.fetch = () => assert.fail('must not fetch without opt-in')
  try {
    const { ctx, routes } = harness()
    apply(ctx)
    const body = await call(routes)
    assert.equal(body.result.ok, true)
    assert.equal(body.result.value.source, null)
    assert.equal(body.result.value.quotes[0].status, 'unconfigured')
  } finally {
    globalThis.fetch = original
  }
})

test('freeSource config wires the opt-in adapter through the owner-only RPC', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (url: any) => {
    assert.equal(String(url), 'https://qt.gtimg.cn/q=sh600519')
    return new Response(gbk(payload()), { headers: { 'content-type': 'text/html; charset=GBK' } })
  }
  try {
    const { ctx, routes } = harness()
    apply(ctx, { freeSource: true })
    const body = await call(routes)
    assert.equal(body.result.ok, true)
    assert.equal(body.result.value.source, 'qt.gtimg.cn (unofficial)')
    assert.deepEqual(body.result.value.quotes[0], {
      symbol: 'SH.600519',
      status: 'available',
      name: NAME,
      price: 1329,
      changePercent: 1.22,
      quotedAt: '2026-10-16T16:14:47+08:00',
      fetchedAt: body.result.value.quotes[0].fetchedAt,
      marketStatus: 'unknown',
    })
  } finally {
    globalThis.fetch = original
  }
})
