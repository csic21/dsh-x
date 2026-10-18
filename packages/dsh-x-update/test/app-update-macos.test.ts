import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnAppUpdate } from '../src/app-update.ts'
import type { PendingAppUpdate } from '../src/types.ts'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('macOS helper replaces the app after the host exits and removes the backup', { skip: process.platform !== 'darwin', timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-x-update-helper-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source', 'DSH-X.app', 'Contents', 'Resources')
  const target = path.join(root, 'DSH-X.app')
  const targetResources = path.join(target, 'Contents', 'Resources')
  await mkdir(source, { recursive: true })
  await mkdir(targetResources, { recursive: true })
  await writeFile(path.join(source, 'marker.txt'), 'new')
  await writeFile(path.join(source, 'distribution.json'), JSON.stringify({ schema: 1, version: '0.1.2', kernelVersion: '0.2.1-rc.2' }))
  await writeFile(path.join(targetResources, 'marker.txt'), 'old')
  const dmg = path.join(root, 'DSH-X-0.1.2-mac-arm64-preview.dmg')
  try {
    execFileSync('/usr/bin/hdiutil', ['create', '-size', '20m', '-fs', 'HFS+', '-volname', 'DSH-X', dmg], { stdio: 'pipe' })
  } catch (error) {
    const stderr = String((error as { stderr?: unknown })?.stderr ?? '')
    if (/not permitted|operation not permitted|操作不被允许|权限/i.test(stderr)) {
      t.skip('hdiutil image creation is not permitted in this sandbox')
      return
    }
    throw error
  }
  const mount = path.join(root, 'mount')
  await mkdir(mount)
  execFileSync('/usr/bin/hdiutil', ['attach', '-nobrowse', '-mountpoint', mount, dmg], { stdio: 'pipe' })
  try {
    execFileSync('/usr/bin/ditto', [path.join(root, 'source', 'DSH-X.app'), path.join(mount, 'DSH-X.app')])
  } finally {
    execFileSync('/usr/bin/hdiutil', ['detach', mount, '-quiet'], { stdio: 'pipe' })
  }
  const bytes = await readFile(dmg)
  const pending: PendingAppUpdate = {
    schema: 1, kind: 'app', tag: 'desktop-v0.1.2', version: '0.1.2', kernelVersion: '0.2.1-rc.2',
    target: 'macos-arm64', installer: dmg, sha256: createHash('sha256').update(bytes).digest('hex'),
    installRoot: root, appPath: target, createdAt: '2026-10-18T00:00:00.000Z',
  }
  const host = spawn('sleep', ['1'], { stdio: 'ignore' })
  t.after(() => host.kill('SIGKILL'))
  const previousLaunch = process.env.DSH_X_UPDATE_NO_LAUNCH
  process.env.DSH_X_UPDATE_NO_LAUNCH = '1'
  let helper: string
  try { ({ helper } = await spawnAppUpdate({ pending, home: path.join(root, 'home'), hostPid: host.pid as number, platform: 'darwin' })) }
  finally { if (previousLaunch === undefined) delete process.env.DSH_X_UPDATE_NO_LAUNCH; else process.env.DSH_X_UPDATE_NO_LAUNCH = previousLaunch }
  let replaced = false
  for (let index = 0; index < 100; index += 1) {
    try {
      if (await readFile(path.join(targetResources, 'marker.txt'), 'utf8') === 'new') { replaced = true; break }
    } catch { /* The helper may be between rename steps. */ }
    await delay(200)
  }
  assert.equal(replaced, true, `helper did not replace the app: ${helper}`)
  await delay(1000)
  const entries = await readdir(root)
  assert.equal(entries.some(name => name.startsWith('DSH-X.app.backup')), false)
  assert.equal(entries.some(name => name.startsWith('DSH-X.app.update')), false)
})
