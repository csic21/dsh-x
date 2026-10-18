// Exercise the files extracted/installed from the final DMG/EXE, using only a
// disposable home and a test-only Host probe. No provider account or model call.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, access, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { root as repository } from './suite-support.mjs'

const { values } = parseArgs({ options: { stage: { type: 'string' }, driver: { type: 'string' }, report: { type: 'string' } } })
assert(values.stage && values.driver && values.report)
const info = JSON.parse(await readFile(path.join(values.stage, 'staged-root.json'), 'utf8'))
const require = createRequire(path.join(path.resolve(values.driver), 'package.json'))
const { _electron } = require('playwright')
const temporary = await mkdtemp(path.join(tmpdir(), 'dsh-x-installed-proof-'))
const home = path.join(temporary, 'home')
await mkdir(home)
const report = { status: 'running', target: info.target, assertions: [], notVerified: ['code signing and notarization', 'real vendor login and model calls', 'previous released version data migration', 'self-update and deep-link integration'] }
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.status}`)
}
let root, application, runtimeLogs = ''
try {
  if (process.platform === 'darwin') {
    const volume = path.join(temporary, 'volume')
    await mkdir(volume)
    run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', volume, info.installer])
    try { run('/usr/bin/ditto', [path.join(volume, 'DSH-X.app'), path.join(temporary, 'DSH-X.app')]) }
    finally { run('/usr/bin/hdiutil', ['detach', volume]) }
    root = path.join(temporary, 'DSH-X.app/Contents/Resources')
    run('/usr/bin/codesign', ['--verify', '--strict', path.join(temporary, 'DSH-X.app')])
  } else {
    root = path.join(temporary, 'DSH-X')
    run(info.installer, ['/S', `/D=${root}`])
    await access(path.join(root, 'DSH-X.exe'))
    await access(path.join(root, 'Uninstall.exe'))
  }
  report.assertions.push('final installer extracts a runnable application without editing the official archive')
  const bootstrap = await import(pathToFileURL(path.join(root, 'bootstrap.mjs')).href)
  const manifest = await bootstrap.readDistribution(root)
  report.kernelSha = manifest.kernelSha; report.kernelVersion = manifest.kernelVersion
  assert.equal(await bootstrap.digest(path.join(root, manifest.archive)), manifest.archiveSha256)
  const environment = bootstrap.runtimeEnvironment(home, Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|TOKEN|SECRET|PASSWORD|COOKIE/i.test(key))))
  const launch = async () => {
    const app = await _electron.launch({ executablePath: path.join(root, manifest.executable), args: [`--user-data-dir=${path.join(home, 'electron')}`], cwd: home, env: environment, chromiumSandbox: true, timeout: 120000 })
    const receive = bytes => { runtimeLogs = (runtimeLogs + bytes.toString().replace(/(token=)[A-Za-z0-9_-]+/g, '$1[redacted]')).slice(-24000) }
    app.process().stdout?.on('data', receive); app.process().stderr?.on('data', receive)
    return app
  }
  const initialized = await bootstrap.installDistribution({ root, home, initialize: async () => {
    application = await launch()
    for (let n = 0; n < 120; n++) {
      try { await access(path.join(home, 'profiles/desktop/package.json')); break } catch { await new Promise(resolve => setTimeout(resolve, 500)) }
    }
    await access(path.join(home, 'profiles/desktop/package.json'))
    await application.close(); application = undefined
  } })
  assert.equal(initialized.changed, true)
  report.assertions.push('official application creates its Desktop profile; bundled official CLI installs all plugin tarballs')
  await bootstrap.installedVersions(home, manifest)
  report.assertions.push('suite, bundled Code and Agents, and four optional plugins resolve to the packaged exact versions')
  await bootstrap.desktopCli(root, manifest, home, ['plugin', '--profile', 'desktop', 'add', `link:${path.join(repository, 'scripts/fixtures/desktop-distribution-probe')}`, '--ignore-scripts', '--config.auto-install-peers=false', '--config.minimum-release-age=0'])
  application = await launch()
  report.runtime = await application.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), userData: app.getPath('userData'), home: process.env.DSH_HOME }))
  assert.equal(report.runtime.packaged, true)
  assert.equal(report.runtime.version, manifest.kernelVersion)
  assert.equal(path.resolve(report.runtime.home), path.resolve(home))
  assert.equal(await realpath(report.runtime.userData), await realpath(path.join(home, 'electron')))
  let snapshot
  for (let attempt = 0; attempt < 120; attempt++) {
    const pages = application.windows().filter(page => page.url().startsWith('dsh-app://app/'))
    for (const page of pages) {
      try {
        const result = await page.evaluate(async () => { const response = await fetch('/api/dsh-x-distribution-proof', { method: 'POST' }); if (!response.ok) return null; return response.json() })
        if (result?.entries?.length === 6) snapshot = result
      } catch {}
    }
    // Entry registration precedes module evaluation. Windows can expose the
    // rows while the nested suite components are still initializing.
    if (snapshot?.entries?.every(entry => entry.active) && snapshot.clients?.length === 6 && snapshot.plugins?.every(entry => entry.enabled && entry.phase === 'active')) break
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  assert(snapshot, 'Actual Desktop Host did not expose all six installed plugins')
  assert.equal(snapshot.entries.length, 6)
  assert(snapshot.entries.every(entry => entry.active), JSON.stringify(snapshot))
  assert.equal(snapshot.clients.length, 6)
  assert.equal(snapshot.plugins.length, 6)
  assert(snapshot.plugins.every(entry => entry.enabled && entry.phase === 'active'), JSON.stringify(snapshot))
  report.snapshot = snapshot
  report.assertions.push('actual packaged Electron Host activates all six plugins and registers all six client modules once')
  await application.close(); application = undefined
  const repeated = await bootstrap.installDistribution({ root, home, initialize: () => { throw new Error('Repeated launch must not initialize') } })
  assert.equal(repeated.changed, false)
  report.assertions.push('repeated startup does not reinstall plugins or override user plugin controls')
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.error = String(error); report.runtimeLogs = runtimeLogs; process.exitCode = 1
} finally {
  try { await application?.close() } catch (error) { report.status = 'failed'; report.cleanupError = String(error); process.exitCode = 1 }
  if (process.platform === 'win32' && root) {
    try { await access(path.join(root, 'Uninstall.exe')); run(path.join(root, 'Uninstall.exe'), ['/S']) } catch (error) { report.status = 'failed'; report.uninstallError = String(error); process.exitCode = 1 }
  }
  await mkdir(path.dirname(path.resolve(values.report)), { recursive: true })
  await writeFile(values.report, JSON.stringify(report, null, 2) + '\n')
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }).catch(error => { console.error('Temporary installer cleanup failed:', error.message); process.exitCode = 1 })
  console.log(JSON.stringify(report))
}
