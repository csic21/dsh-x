import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readPendingApp, readPendingPlugin, stageAppUpdate, stagePluginUpdate } from '../src/stage.ts'
import type { PluginRelease } from '../src/types.ts'

function digest(bytes: Buffer, algorithm: 'sha256' | 'sha512'): string {
  const hash = createHash(algorithm).update(bytes)
  return algorithm === 'sha256' ? hash.digest('hex') : `sha512-${hash.digest('base64')}`
}

async function serverFor(files: Record<string, Buffer>) {
  const server = createServer((request, response) => {
    const body = files[request.url ?? '']
    if (!body) { response.statusCode = 404; response.end(); return }
    response.setHeader('content-length', String(body.byteLength))
    response.end(body)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test server address')
  return { server, base: `http://127.0.0.1:${address.port}` }
}

test('stages only installed plugin artifacts and writes a verifiable pending manifest', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-x-update-stage-'))
  const code = Buffer.from('code-package')
  const stock = Buffer.from('stock-package')
  const { server, base } = await serverFor({ '/code.tgz': code, '/stock.tgz': stock })
  t.after(async () => { server.close(); await rm(home, { recursive: true, force: true }) })
  const release: PluginRelease = {
    tag: 'plugins-v0.1.2', version: '0.1.2', runtime: '0.2.1-rc.2',
    artifacts: [
      { name: 'dsh-x-code', version: '0.1.2', file: 'dsh-x-code-0.1.2.tgz', sha256: digest(code, 'sha256'), integrity: digest(code, 'sha512'), url: `${base}/code.tgz` },
      { name: 'dsh-x-stock', version: '0.1.2', file: 'dsh-x-stock-0.1.2.tgz', sha256: digest(stock, 'sha256'), integrity: digest(stock, 'sha512'), url: `${base}/stock.tgz` },
    ],
  }
  const pending = await stagePluginUpdate({ release, installed: new Set(['dsh-x-code']), home })
  assert.equal(pending.files.length, 1)
  assert.equal(pending.files[0].name, 'dsh-x-code')
  assert.equal((await readFile(pending.files[0].path, 'utf8')), 'code-package')
  const stored = await readPendingPlugin(home)
  assert.equal(stored?.tag, 'plugins-v0.1.2')
  assert.equal(stored?.runtime, '0.2.1-rc.2')
})

test('rejects a tampered download and leaves no pending manifest', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-x-update-stage-bad-'))
  const bytes = Buffer.from('tampered')
  const { server, base } = await serverFor({ '/code.tgz': bytes })
  t.after(async () => { server.close(); await rm(home, { recursive: true, force: true }) })
  const release: PluginRelease = {
    tag: 'plugins-v0.1.2', version: '0.1.2', runtime: '0.2.1-rc.2',
    artifacts: [{ name: 'dsh-x-code', version: '0.1.2', file: 'dsh-x-code-0.1.2.tgz', sha256: '0'.repeat(64), integrity: '', url: `${base}/code.tgz` }],
  }
  await assert.rejects(stagePluginUpdate({ release, installed: new Set(['dsh-x-code']), home }), /SHA-256/)
  assert.equal(await readPendingPlugin(home), null)
})

test('stages a desktop installer with target paths', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-x-update-app-'))
  const bytes = Buffer.from('installer-bytes')
  const { server, base } = await serverFor({ '/desktop.dmg': bytes })
  t.after(async () => { server.close(); await rm(home, { recursive: true, force: true }) })
  const pending = await stageAppUpdate({
    release: {
      tag: 'desktop-v0.1.2', version: '0.1.2', kernelVersion: '0.2.1-rc.2', target: 'macos-arm64',
      installer: { file: 'DSH-X-0.1.2-mac-arm64-preview.dmg', sha256: digest(bytes, 'sha256'), url: `${base}/desktop.dmg` },
    },
    home,
    installRoot: '/Applications',
    appPath: '/Applications/DSH-X.app',
  })
  assert.equal(pending.installer.endsWith('DSH-X-0.1.2-mac-arm64-preview.dmg'), true)
  assert.equal((await stat(pending.installer)).size, bytes.byteLength)
  const stored = await readPendingApp(home)
  assert.equal(stored?.version, '0.1.2')
  assert.equal(stored?.appPath, '/Applications/DSH-X.app')
})
