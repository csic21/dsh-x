// Runs with the unmodified application's bundled Node. No profile is written
// here: the official application initializes it, and its CLI owns installation.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, open, readFile, rm, writeFile, rename } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const defaultHome = () => path.join(homedir(), '.dsh-x', 'desktop-preview')
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
  const environment = Object.fromEntries(Object.entries(inherited).filter(([key]) => !['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'DSH_HOME', 'DSH_AGENTS_HOME'].includes(key)))
  return { ...environment, DSH_HOME: home, DSH_AGENTS_HOME: path.join(home, 'agents'), DSH_DESKTOP_USER_DATA_DIR: path.join(home, 'electron'), DSH_TELEMETRY_DISABLED: '1' }
}
export async function readDistribution(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'distribution.json'), 'utf8'))
  assert.equal(manifest.schema, 1)
  assert.match(manifest.id, /^[a-zA-Z0-9.-]+$/)
  assert.equal(manifest.plugins.length, 5)
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
  await dialog(root, '首次安装会打开官方应用初始化独立配置。窗口出现后，请完全退出应用（macOS 用 Command+Q，Windows 用托盘菜单的退出）。安装器随后会安装插件并重新打开应用。此时无需登录。')
  await new Promise((resolve, reject) => {
    const child = spawn(localPath(root, manifest.executable), [`--user-data-dir=${path.join(home, 'electron')}`], { env: runtimeEnvironment(home), stdio: 'ignore' })
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
export async function launchRuntime(root, manifest, home = defaultHome()) {
  const child = spawn(localPath(root, manifest.executable), [`--user-data-dir=${path.join(home, 'electron')}`], { env: runtimeEnvironment(home), detached: true, stdio: 'ignore' })
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  child.unref()
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(fileURLToPath(import.meta.url))
  try { const { manifest } = await installDistribution({ root }); await launchRuntime(root, manifest) }
  catch (error) { await dialog(root, `DSH-X 安装或启动失败：${error.message}\n日志：${path.join(defaultHome(), 'distribution-install.log')}`, true).catch(() => {}); process.exitCode = 1 }
}
