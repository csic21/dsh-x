// Runs with the unmodified application's bundled Node. No profile is written
// here: the official application initializes it, and its CLI owns installation.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, open, readFile, rm, stat, writeFile, rename } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The packaged launcher must always land in the official native home. Ambient
// DSH_HOME/DSH_AGENTS_HOME values belong to the process that happened to start
// DSH-X (a shell, a previous isolated build), not to this installation.
export const defaultHome = () => path.join(homedir(), '.dsh')
export async function digest(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
export function localPath(root, relative) {
  assert.equal(typeof relative, 'string')
  assert(relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), 'Invalid distribution path')
  return path.join(root, relative)
}
export function runtimeEnvironment(home, inherited = process.env) {
  // Native layout: the official home and Electron userData defaults are kept.
  // Parent DSH_* values and Node injection variables are dropped so a shell or
  // a previous isolated build cannot drag this launch back to ~/.dsh-x.
  const environment = Object.fromEntries(Object.entries(inherited).filter(([key]) => !['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'DSH_HOME', 'DSH_AGENTS_HOME', 'DSH_DESKTOP_USER_DATA_DIR'].includes(key)))
  return { ...environment, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
}
export async function readDistribution(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'distribution.json'), 'utf8'))
  assert.equal(manifest.schema, 1)
  assert.match(manifest.id, /^[a-zA-Z0-9.-]+$/)
  assert(Array.isArray(manifest.plugins) && manifest.plugins.length > 0, 'Distribution has no plugins')
  assert.equal(new Set(manifest.plugins.map(item => item.name)).size, manifest.plugins.length, 'Duplicate plugin names')
  for (const item of manifest.plugins) {
    assert.match(item.sha256, /^[0-9a-f]{64}$/)
    assert.equal(await digest(localPath(root, item.file)), item.sha256, `Damaged plugin: ${item.name}`)
  }
  return manifest
}
export function run(command, args, { env, log, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const append = chunk => { output = (output + chunk).slice(-16000); if (log) log.write(chunk) }
    child.stdout.on('data', append); child.stderr.on('data', append)
    child.once('error', reject)
    child.once('close', (code, signal) => code === 0 ? resolve(output) : reject(new Error(`Installer command failed (${code ?? signal}): ${output}`)))
  })
}
export async function dialog(root, message, error = false) {
  if (process.platform === 'darwin') {
    await run('/usr/bin/osascript', ['-e', `display dialog ${JSON.stringify(message)} with title "DSH-X" buttons {"OK"} default button "OK"${error ? ' with icon stop' : ''}`])
  } else {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'dialog.ps1'), '-Message', message])
  }
}
export async function desktopCli(root, manifest, home, args, log) {
  // Use Electron's own ASAR support and the official reserved-profile carrier.
  return run(localPath(root, manifest.executable), ['--expose-internals', localPath(root, manifest.cli), ...args], {
    env: { ...runtimeEnvironment(home), ELECTRON_RUN_AS_NODE: '1' }, cwd: home, log,
  })
}
export async function initializeByUser(root, manifest, home) {
  await dialog(root, '首次安装会打开官方应用初始化原生配置。窗口出现后，请完全退出应用（macOS 用 Command+Q，Windows 用托盘菜单的退出）。安装器随后会安装插件并重新打开应用。此时无需登录。')
  await new Promise((resolve, reject) => {
    const child = spawn(localPath(root, manifest.executable), [], { env: runtimeEnvironment(home), stdio: 'ignore' })
    child.once('error', reject)
    child.once('exit', () => resolve())
  })
}
export async function installedVersions(home, manifest) {
  const profile = path.join(home, 'profiles', 'desktop', 'package.json')
  const require = createRequire(profile)
  for (const item of manifest.plugins) {
    const installed = JSON.parse(await readFile(require.resolve(`${item.name}/package.json`), 'utf8'))
    assert.equal(installed.version, item.version, `Installed version mismatch: ${item.name}`)
    if (item.name === 'dsh-x-suite') {
      const suiteRequire = createRequire(require.resolve(`${item.name}/package.json`))
      for (const name of ['dsh-x-code', 'dsh-x-agents']) {
        const component = JSON.parse(await readFile(suiteRequire.resolve(`${name}/package.json`), 'utf8'))
        assert.equal(component.version, item.version, `Bundled component mismatch: ${name}`)
      }
    }
  }
}
export async function installDistribution({ root, home = defaultHome(), initialize = initializeByUser }) {
  assert(path.isAbsolute(root) && path.isAbsolute(home))
  const manifest = await readDistribution(root)
  await mkdir(home, { recursive: true, mode: 0o700 })
  const marker = path.join(home, 'distribution-installed.json')
  try {
    const installed = JSON.parse(await readFile(marker, 'utf8'))
    // Official plugin controls remain authoritative after installation: users
    // may disable or remove components without the launcher putting them back.
    if (installed.id === manifest.id) return { manifest, changed: false }
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const lockFile = path.join(home, 'distribution-install.lock')
  const lock = await open(lockFile, 'wx', 0o600).catch(error => { throw new Error(`另一安装进程尚未完成，或上次安装中断；请检查 ${lockFile}。${error.code}`) })
  const nonce = randomUUID()
  await lock.writeFile(JSON.stringify({ pid: process.pid, nonce })); await lock.close()
  const log = await open(path.join(home, 'distribution-install.log'), 'a', 0o600)
  try {
    assert.equal(await digest(localPath(root, manifest.archive)), manifest.archiveSha256, 'Official application archive was modified')
    const profile = path.join(home, 'profiles', 'desktop', 'package.json')
    try { await access(profile) } catch { await initialize(root, manifest, home); await access(profile) }
    await access(path.join(home, 'profiles', 'desktop', 'lock')).then(() => { throw new Error('Desktop 配置正被使用，请完全退出应用后重新安装。') }, error => { if (error.code !== 'ENOENT') throw error })
    const version = (await desktopCli(root, manifest, home, ['--version'], log)).trim()
    assert.equal(version, manifest.kernelVersion, 'Official runtime version mismatch')
    // Keep immutable tarballs outside the replaceable application directory so
    // profile lockfiles remain resolvable across application upgrades.
    const cache = path.join(home, 'installer-packages', manifest.id)
    await mkdir(cache, { recursive: true, mode: 0o700 })
    const specs = []
    for (const item of manifest.plugins) {
      const target = path.join(cache, path.basename(item.file))
      await copyFile(localPath(root, item.file), target)
      assert.equal(await digest(target), item.sha256)
      specs.push(target)
    }
    await desktopCli(root, manifest, home, ['plugin', '--profile', 'desktop', 'add', ...specs, '--ignore-scripts', '--config.auto-install-peers=false', '--config.minimum-release-age=0'], log)
    await installedVersions(home, manifest)
    const temporary = marker + `.${nonce}.tmp`
    await writeFile(temporary, JSON.stringify({ id: manifest.id, kernelSha: manifest.kernelSha, installedAt: new Date().toISOString() }) + '\n', { mode: 0o600 })
    await rename(temporary, marker)
    return { manifest, changed: true }
  } finally {
    await log.close()
    const owner = JSON.parse(await readFile(lockFile, 'utf8'))
    if (owner.nonce === nonce) await rm(lockFile)
  }
}

export async function appendInstallLog(home, message) {
  await mkdir(home, { recursive: true, mode: 0o700 })
  await writeFile(path.join(home, 'distribution-install.log'), `${new Date().toISOString()} ${message}\n`, { flag: 'a', mode: 0o600 })
}

const UPDATE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const UPDATE_TAG = /^[A-Za-z0-9._-]+$/

async function readPendingPluginUpdate(home) {
  const pending = path.join(home, 'updates', 'pending-plugins.json')
  let raw
  try { raw = JSON.parse(await readFile(pending, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error(`Pending plugin update is unreadable: ${error.message}`)
  }
  assert.equal(raw?.schema, 1, 'Pending plugin update schema mismatch')
  assert.equal(raw?.kind, 'plugins', 'Pending plugin update kind mismatch')
  assert.match(raw?.runtime ?? '', UPDATE_VERSION, 'Pending plugin runtime is invalid')
  assert.match(raw?.tag ?? '', UPDATE_TAG, 'Pending plugin tag is invalid')
  assert(Array.isArray(raw.files) && raw.files.length > 0 && raw.files.length <= 32, 'Pending plugin update has no files')
  const updates = path.join(home, 'updates')
  const files = raw.files.map(file => {
    assert.match(file?.name ?? '', /^dsh-x-[a-z0-9-]+$/, 'Pending plugin name is invalid')
    assert.match(file?.version ?? '', UPDATE_VERSION, 'Pending plugin version is invalid')
    assert.equal(typeof file?.file, 'string', 'Pending plugin file is missing')
    assert.equal(path.basename(file.file), file.file, 'Pending plugin file must be a basename')
    assert.match(file?.sha256 ?? '', /^[0-9a-f]{64}$/, 'Pending plugin checksum is invalid')
    assert.equal(typeof file?.path, 'string', 'Pending plugin path is missing')
    const resolved = path.resolve(file.path)
    const relative = path.relative(updates, resolved)
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Pending plugin path escapes the updates directory')
    assert.equal(path.basename(resolved), file.file, 'Pending plugin path does not match its file name')
    return { ...file, path: resolved }
  })
  return { ...raw, pending, files }
}

/**
 * Apply a plugin-only release staged by dsh-x-update. This runs before the
 * application starts, when the official CLI can own the profile without a
 * running Host. A failed update is logged and skipped instead of blocking the
 * launcher; the bundled distribution remains usable.
 */
export async function applyPendingPluginUpdate({ root, manifest, home = defaultHome(), cli = desktopCli }) {
  let pending
  try { pending = await readPendingPluginUpdate(home) } catch (error) {
    await appendInstallLog(home, `pending plugin update rejected: ${error.message}`)
    await rm(path.join(home, 'updates', 'pending-plugins.json'), { force: true }).catch(() => {})
    return { applied: false, reason: 'invalid' }
  }
  if (!pending) return { applied: false, reason: 'none' }
  await mkdir(path.join(home, 'updates'), { recursive: true, mode: 0o700 })
  const applyLock = path.join(home, 'updates', 'apply.lock')
  const lock = await open(applyLock, 'wx', 0o600).catch(async error => {
    if (error.code !== 'EEXIST') throw error
    const info = await stat(applyLock).catch(() => null)
    if (info && Date.now() - info.mtimeMs > 10 * 60_000) {
      await rm(applyLock, { force: true })
      return open(applyLock, 'wx', 0o600)
    }
    return null
  })
  if (!lock) return { applied: false, reason: 'busy' }
  try {
  if (pending.runtime !== manifest.kernelVersion) {
    await appendInstallLog(home, `pending plugin update ${pending.tag} requires kernel ${pending.runtime}, running ${manifest.kernelVersion}`)
    await rm(pending.pending, { force: true }).catch(() => {})
    return { applied: false, reason: 'kernel-mismatch' }
  }
  const profile = path.join(home, 'profiles', 'desktop', 'package.json')
  let dependencies
  try { dependencies = Object.keys(JSON.parse(await readFile(profile, 'utf8')).dependencies ?? {}) } catch { return { applied: false, reason: 'no-profile' } }
  const selected = pending.files.filter(file => dependencies.includes(file.name))
  if (selected.length === 0) {
    await appendInstallLog(home, `pending plugin update ${pending.tag} has no installed targets`)
    await rm(pending.pending, { force: true }).catch(() => {})
    return { applied: false, reason: 'no-targets' }
  }
  const cache = path.join(home, 'installer-packages', `update-${pending.tag.replace(/[^A-Za-z0-9._-]/g, '-')}`)
  const log = await open(path.join(home, 'distribution-install.log'), 'a', 0o600)
  try {
    await mkdir(cache, { recursive: true, mode: 0o700 })
    const specs = []
    for (const file of selected) {
      const target = path.join(cache, path.basename(file.file))
      await copyFile(file.path, target)
      assert.equal(await digest(target), file.sha256, `Pending plugin checksum mismatch: ${file.name}`)
      specs.push(target)
    }
    await cli(root, manifest, home, ['plugin', '--profile', 'desktop', 'add', ...specs, '--ignore-scripts', '--config.auto-install-peers=false', '--config.minimum-release-age=0'], log)
    for (const file of selected) {
      const installed = JSON.parse(await readFile(path.join(home, 'profiles', 'desktop', 'node_modules', file.name, 'package.json'), 'utf8'))
      assert.equal(installed.version, file.version, `Pending plugin version mismatch: ${file.name}`)
    }
    await rm(pending.pending, { force: true })
    await rm(path.dirname(selected[0].path), { recursive: true, force: true }).catch(() => {})
    log.write(`DSH-X applied plugin update ${pending.tag}\n`)
    return { applied: true, tag: pending.tag }
  } catch (error) {
    log.write(`DSH-X plugin update failed: ${error.message}\n`)
    await rename(pending.pending, `${pending.pending}.failed-${Date.now()}`).catch(() => {})
    return { applied: false, reason: error.message }
  } finally { await log.close() }
  } finally {
    await lock.close().catch(() => {})
    await rm(applyLock, { force: true }).catch(() => {})
  }
}

export async function launchRuntime(root, manifest, home = defaultHome()) {
  const child = spawn(localPath(root, manifest.executable), [], { env: runtimeEnvironment(home), detached: true, stdio: 'ignore' })
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  child.unref()
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(fileURLToPath(import.meta.url))
  try {
    const { manifest } = await installDistribution({ root })
    try { await applyPendingPluginUpdate({ root, manifest }) }
    catch (error) { await appendInstallLog(defaultHome(), `pending plugin update skipped: ${error.message}`).catch(() => {}) }
    await launchRuntime(root, manifest)
  }
  catch (error) { await dialog(root, `DSH-X 安装或启动失败：${error.message}\n日志：${path.join(defaultHome(), 'distribution-install.log')}`, true).catch(() => {}); process.exitCode = 1 }
}
