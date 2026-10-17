import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { parseArgs } from 'node:util'
import path from 'node:path'

const { values } = parseArgs({ options: {
  dsh: { type: 'string', default: 'dsh' },
  home: { type: 'string' },
  'scope-output': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
}})
if (values.help) {
  console.log('node scripts/smoke-web.mjs --home /isolated/dsh-home [--dsh /path/to/dsh]')
  process.exit(0)
}
if (!values.home) throw new Error('需要 --home；先用 link-plugins.mjs 将插件链接到该 home 的 web profile。')
const child = spawn(values.dsh, ['web', '--no-open', '--port', '0'], {
  env: { ...process.env, DSH_HOME: path.resolve(values.home) },
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
})
const exited = new Promise(resolve => child.once('exit', resolve))
let log = ''
let timer
try {
  const url = await new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Web 启动超时（30 秒）。')), 30000)
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`Web 在就绪前退出：${code}`)))
    const receive = data => {
      log += data.toString()
      if (log.length > 1048576) { reject(new Error('启动日志超过限制。')); return }
      const match = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)
      if (match) resolve(match[0])
    }
    child.stdout.on('data', receive)
    child.stderr.on('data', receive)
  })
  clearTimeout(timer)
  // Bootstrap token stays in memory; never print it or write it to a report.
  const login = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
  const cookies = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
  if (![302, 303].includes(login.status) || !cookies) throw new Error(`Web 登录引导未返回预期 cookie（HTTP ${login.status}）。`)
  const response = await fetch(new URL('/', url), { headers: { cookie: cookies }, signal: AbortSignal.timeout(10000) })
  const html = await response.text()
  if (response.status !== 200 || !html.includes('<html')) throw new Error('Web 页面没有返回有效 HTML。')
  const endpoint = new URL('/api/dsh-x-stock.quotes', url)
  const body = JSON.stringify({ type: 'client-request', rpcId: 'stock-smoke', method: 'dsh-x-stock.quotes', payload: { symbols: ['SH.600519'] } })
  const headers = { cookie: cookies, origin: endpoint.origin, 'content-type': 'application/json' }
  const rpc = await fetch(endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) })
  assert.equal(rpc.status, 200, 'authenticated stock RPC must succeed')
  const rpcValue = await rpc.json()
  assert.equal(rpcValue.type, 'server-response')
  assert.equal(rpcValue.rpcId, 'stock-smoke')
  assert.equal(rpcValue.result.ok, true)
  assert.deepEqual(rpcValue.result.value, { source: null, quotes: [{ symbol: 'SH.600519', status: 'unconfigured', price: null, changePercent: null, quotedAt: null, fetchedAt: null }] })
  const scopeEndpoint = new URL('/api/dsh-x-stock.scope', url)
  const scopeBody = JSON.stringify({ type: 'client-request', rpcId: 'scope-smoke', method: 'dsh-x-stock.scope', payload: {} })
  const scopeResponse = await fetch(scopeEndpoint, { method: 'POST', headers, body: scopeBody, signal: AbortSignal.timeout(10000) })
  assert.equal(scopeResponse.status, 200)
  const scopeValue = await scopeResponse.json()
  assert.equal(scopeValue.result.ok, true)
  assert.match(scopeValue.result.value.scope, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const anonymousScope = await fetch(scopeEndpoint, { method: 'POST', headers: { origin: endpoint.origin, 'content-type': 'application/json' }, body: scopeBody, signal: AbortSignal.timeout(10000) })
  assert.equal(anonymousScope.status, 401)
  await anonymousScope.body?.cancel()
  const crossOriginScope = await fetch(scopeEndpoint, { method: 'POST', headers: { ...headers, origin: 'https://untrusted.invalid' }, body: scopeBody, signal: AbortSignal.timeout(10000) })
  assert.equal(crossOriginScope.status, 403)
  await crossOriginScope.body?.cancel()
  if (values['scope-output']) await writeFile(values['scope-output'], `${scopeValue.result.value.scope}\n`, { flag: 'wx', mode: 0o600 })
  const anonymous = await fetch(endpoint, { method: 'POST', headers: { origin: endpoint.origin, 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(10000) })
  assert.equal(anonymous.status, 401, 'anonymous stock RPC must be denied')
  await anonymous.body?.cancel()
  const crossOrigin = await fetch(endpoint, { method: 'POST', headers: { ...headers, origin: 'https://untrusted.invalid' }, body, signal: AbortSignal.timeout(10000) })
  assert.equal(crossOrigin.status, 403, 'cross-origin stock RPC must be denied')
  await crossOrigin.body?.cancel()
  const malformed = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ type: 'client-request', rpcId: 'invalid-test', method: 'dsh-x-stock.quotes', payload: { symbols: ['AAPL'] } }), signal: AbortSignal.timeout(10000) })
  assert.equal(malformed.status, 200)
  const malformedValue = await malformed.json()
  assert.equal(malformedValue.result.ok, false)
  assert.equal(malformedValue.result.error.code, 'stock/invalid-input')
  console.log(JSON.stringify({ status: response.status, htmlBytes: Buffer.byteLength(html), errorsInStartupLog: /\b(?:Error|ERROR)\b/.test(log), stockRpcStatus: rpc.status, anonymousStatus: anonymous.status, crossOriginStatus: crossOrigin.status, invalidSymbolRejected: true, scopeValid: true, anonymousScopeStatus: anonymousScope.status, crossOriginScopeStatus: crossOriginScope.status }))
} finally {
  clearTimeout(timer)
  child.kill('SIGTERM')
  let killTimer
  await Promise.race([exited, new Promise(resolve => { killTimer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 5000) })])
  clearTimeout(killTimer)
}
