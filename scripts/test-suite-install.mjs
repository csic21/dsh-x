// Real CLI/package-manager/Web-Host qualification in disposable directories.
// Version-bumped suite packages below are test fixtures, never release artifacts.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { root, components, suiteName, validateSuite } from './suite-support.mjs'

const { values } = parseArgs({ options: { dsh: { type: 'string' }, 'dsh-version': { type: 'string' }, 'release-dir': { type: 'string' }, report: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
if (values.help) { console.log('node scripts/test-suite-install.mjs --dsh /absolute/path/to/dsh --dsh-version <exact> --report /path/report.json'); process.exit(0) }
if (!values.dsh || !path.isAbsolute(values.dsh) || !values['dsh-version']) throw new Error('An explicit absolute DSH command and exact expected version are required.')
const report = { status: 'running', startedAt: new Date().toISOString(), runtime: values['dsh-version'], checks: [], evidence: 'real official CLI, package manager, installed tarballs and Web Host', notVerified: ['Electron execution', 'browser rendering and interaction', 'native vendor authentication or model execution', 'release-to-release user-data migration'], fixtureVersions: true }
const temporary = await mkdtemp(path.join(tmpdir(), 'dsh-suite-install-'))
const packDir = path.join(temporary, 'packs'), home = path.join(temporary, 'home'), osHome = path.join(temporary, 'os-home')
await Promise.all([mkdir(packDir), mkdir(home), mkdir(osHome)])
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
Object.assign(env, { HOME: osHome, USERPROFILE: osHome, APPDATA: path.join(osHome, 'appdata'), LOCALAPPDATA: path.join(osHome, 'localappdata'), TMPDIR: temporary, TEMP: temporary, TMP: temporary, DSH_HOME: home, DSH_AGENTS_HOME: path.join(home, 'agents'), DSH_TELEMETRY_DISABLED: '1', NPM_CONFIG_USERCONFIG: path.join(temporary, 'empty.npmrc'), NPM_CONFIG_CACHE: path.join(temporary, 'npm-cache'), CI: 'true' })
Object.assign(env, { NPM_CONFIG_GLOBALCONFIG: path.join(temporary, 'empty-global.npmrc'), NPM_CONFIG_IGNORE_SCRIPTS: 'true' })
await writeFile(env.NPM_CONFIG_USERCONFIG, '')
await writeFile(env.NPM_CONFIG_GLOBALCONFIG, '')
let registry, app
const componentLookups = []

function signalTree(child, signal) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    // This harness owns only this newly spawned process tree.
    spawnSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: false })
  } else {
    try { process.kill(-child.pid, signal) } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
}
function startChild(command, args, options) {
  const child = spawn(command, args, { detached: process.platform !== 'win32', shell: false, ...options })
  child.closed = new Promise(resolve => child.once('close', resolve))
  return child
}
async function terminate(child) {
  signalTree(child, 'SIGTERM')
  let timer
  const closed = await Promise.race([child.closed.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 5000) })])
  clearTimeout(timer)
  // A leader can exit while a descendant closes its stdio and ignores TERM.
  // Reap any surviving members of this owned process group before cleanup.
  signalTree(child, 'SIGKILL')
  if (!closed) await child.closed
}
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = startChild(command, args, { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...options })
    let out = '', err = '', settled = false, failure
    const timer = setTimeout(() => { failure = new Error(`Timed out: ${path.basename(command)} ${args[0] ?? ''}`); void terminate(child).catch(reject) }, 180000)
    const collect = stream => bytes => { if (stream === 'out') out += bytes; else err += bytes; if (out.length + err.length > 4 * 1024 * 1024 && !failure) { failure = new Error('Command output exceeded bound'); void terminate(child).catch(reject) } }
    child.stdout.on('data', collect('out')); child.stderr.on('data', collect('err'))
    child.once('error', error => { settled = true; clearTimeout(timer); reject(error) })
    child.once('close', (code, signal) => { clearTimeout(timer); if (settled) return; if (failure) reject(failure); else resolve({ code, signal, out, err }) })
  })
}
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
async function pack(directory) {
  const result = await run(npmCommand, ['pack', '--ignore-scripts', '--json', '--pack-destination', packDir], { cwd: directory })
  assert.equal(result.code, 0, result.err)
  const info = JSON.parse(result.out)[0], file = path.join(packDir, info.filename), bytes = await readFile(file)
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  if (components.includes(manifest.name)) assert.ok(info.files.some(item => item.path === 'lib/client.js'), `${manifest.name} packed client missing`)
  return { manifest, file, bytes, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` }
}
async function releasePackage(name) {
  const source = JSON.parse(await readFile(path.join(root, 'packages', name, 'package.json'), 'utf8'))
  const file = path.resolve(values['release-dir'], `${name}-${source.version}.tgz`)
  const stage = path.join(temporary, `release-${name}`)
  await mkdir(stage)
  const extracted = await run('tar', ['-xzf', file, '--strip-components=1', '-C', stage])
  assert.equal(extracted.code, 0, extracted.err)
  const manifest = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8'))
  assert.equal(manifest.name, name); assert.equal(manifest.version, source.version)
  const bytes = await readFile(file)
  return { manifest, file, stage, bytes, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` }
}
async function startRegistry(packages) {
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') { response.writeHead(405).end(); return }
      const pathname = new URL(request.url, 'http://localhost').pathname
      const artifact = packages.find(item => pathname === `/tarballs/${path.basename(item.file)}`)
      if (artifact) { response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(artifact.bytes); return }
      const name = decodeURIComponent(pathname.slice(1)), matches = packages.filter(item => item.manifest.name === name)
      if (components.includes(name)) componentLookups.push(name)
      if (matches.length) {
        const versions = Object.fromEntries(matches.map(item => [item.manifest.version, { ...item.manifest, dist: { tarball: `${registry.url}/tarballs/${path.basename(item.file)}`, integrity: item.integrity } }]))
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ name, 'dist-tags': { latest: matches.at(-1).manifest.version }, versions, time: Object.fromEntries(matches.map(item => [item.manifest.version, '2020-01-01T00:00:00.000Z'])) })); return
      }
      // Public package GET proxy only: no input origin, credentials, auth header,
      // cookie, or response Set-Cookie is forwarded. Native vendor calls are absent.
      if (!request.url.startsWith('/') || request.url.startsWith('//')) throw new Error('Invalid registry path')
      const upstream = await fetch(new URL(`https://registry.npmjs.org${request.url}`), { headers: { accept: 'application/vnd.npm.install-v1+json' }, redirect: 'error', signal: AbortSignal.timeout(60000) })
      if (upstream.ok && upstream.headers.get('content-type')?.includes('json')) {
        const metadata = await upstream.json()
        // Keep pnpm's requests inside this credential-free proxy too. Preserve
        // package integrity and bytes; only public npm tarball origins change.
        for (const version of Object.values(metadata.versions ?? {})) {
          if (typeof version.dist?.tarball === 'string') {
            const source = new URL(version.dist.tarball)
            if (source.origin !== 'https://registry.npmjs.org' || source.username || source.password) throw new Error('Unexpected dependency tarball origin')
            version.dist.tarball = `${registry.url}${source.pathname}${source.search}`
          }
        }
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(metadata)); return
      }
      response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream' })
      if (upstream.body) for await (const chunk of upstream.body) response.write(chunk)
      response.end()
    } catch { if (response.headersSent) response.destroy(); else response.writeHead(502).end('Public registry lookup failed') }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}
async function plugin(args, expected = 0) {
  const result = await run(values.dsh, ['plugin', '--profile', 'web', ...args, ...(args[0] === 'remove' ? [] : [`--registry=${registry.url}`, '--ignore-scripts', '--fetch-retries=0', '--fetch-timeout=60000']), '--config.auto-install-peers=false', '--config.minimum-release-age=0', `--store-dir=${path.join(temporary, 'pnpm-store')}`])
  if (expected === 0 && result.code !== 0) {
    const diagnostic = /diagnostics: ([^\r\n]+)/.exec(result.err)?.[1]
    let detail = ''
    if (diagnostic && path.resolve(diagnostic).startsWith(temporary + path.sep)) {
      detail = await readFile(diagnostic, 'utf8').catch(() => '')
    }
    assert.equal(result.code, 0, result.err + result.out + '\nOperation log:\n' + detail.slice(-16000))
  }
  else if (expected !== 0) {
    assert.equal(result.code, 1, 'Expected official incompatible-version refusal, not a crash or signal.')
    assert.match(result.err + result.out, /dsh-x-suite/)
    assert.match(result.err + result.out, /engines\.dsh/)
    assert.match(result.err + result.out, /99\.0\.0/)
    assert.match(result.err + result.out, /incompatible|not compatible|requires|unmet/i)
  }
  return result
}
async function start() {
  const child = startChild(values.dsh, ['web', '--no-open', '--port', '0'], { env, cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = '', timer
  const stop = () => terminate(child)
  try {
    const url = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Official Web startup timed out.')), 60000)
      child.once('error', reject); child.once('exit', code => reject(new Error(`Official Web exited before ready: ${code}; ${logs.replace(/token=[A-Za-z0-9_-]+/g, 'token=[redacted]').slice(-12000)}`)))
      const receive = chunk => { logs += chunk; if (logs.length > 2 * 1024 * 1024) reject(new Error('Startup log exceeded bound.')); const match = logs.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/); if (match) resolve(match[0]) }
      child.stdout.on('data', receive); child.stderr.on('data', receive)
    })
    clearTimeout(timer)
    const login = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) }), cookie = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
    assert.ok([302, 303].includes(login.status) && cookie, 'Authenticated startup handshake required.')
    const base = new URL(url).origin
    const request = async payload => {
      const result = await fetch(`${base}/api/suite-test-probe`, { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) })
      assert.equal(result.status, 200, `Probe HTTP ${result.status}; ${logs.replace(/token=[A-Za-z0-9_-]+/g, 'token=[redacted]').slice(-8000)}`); return result.json()
    }
    const snapshot = () => request({ action: 'snapshot' })
    const change = async payload => { const result = await request(payload); assert.equal(result.error, undefined, JSON.stringify(result)); assert.ok(['applied', 'unchanged'].includes(result.application), JSON.stringify(result)); return snapshot() }
    return { stop, snapshot, change }
  } catch (error) { clearTimeout(timer); await stop(); throw error }
}
function counts(snapshot, expected) {
  assert.equal(snapshot.error, undefined, JSON.stringify(snapshot))
  for (const name of components) {
    assert.equal(snapshot.entries.filter(row => row.name === name && row.active).length, expected[name] ?? 0, `Host activation count: ${name}`)
    assert.equal(snapshot.plugins.filter(row => row.moduleName === name && row.enabled && row.fiberPhase === 'active').length, expected[name] ?? 0, `Official active fiber count: ${name}`)
    assert.equal(snapshot.clients.filter(row => row.id === name).length, expected[name] ?? 0, `Client module count: ${name}`)
  }
}
function check(name) { report.checks.push({ name, status: 'passed' }); console.log(`PASS ${name}`) }

try {
  const { runtime, suite } = validateSuite()
  const suiteVersion = suite.version
  const core = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(suiteVersion)
  assert.ok(core, 'Suite fixture generation requires an exact SemVer.')
  const [upgradeVersion, disabledUpgradeVersion, incompatibleVersion] = [1n, 2n, 3n].map(offset => `${core[1]}.${core[2]}.${BigInt(core[3]) + offset}`)
  assert.equal(values['dsh-version'], runtime, 'Unqualified runtime: no compatibility exemption or manifest rewrite is allowed.')
  const version = await run(values.dsh, ['--version']); assert.equal(version.code, 0, version.err); assert.equal(version.out.trim(), runtime)
  const packageManager = JSON.parse(await readFile(path.join(root, 'compatibility/policy.json'), 'utf8')).packageManager
  assert.equal(packageManager.name, 'pnpm')
  const pm = await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--version'])
  assert.equal(pm.code, 0, pm.err); assert.equal(pm.out.trim(), packageManager.version, 'Use the exact qualified pnpm version on PATH.')
  report.packageManager = { name: 'pnpm', version: pm.out.trim() }
  const packages = []
  for (const name of [...components, suiteName]) packages.push(values['release-dir'] ? await releasePackage(name) : await pack(path.join(root, 'packages', name)))
  for (const [version, engine] of [[upgradeVersion, runtime], [disabledUpgradeVersion, runtime], [incompatibleVersion, '99.0.0']]) {
    const stage = path.join(temporary, `suite-${version}`); await cp(values['release-dir'] ? packages.find(item => item.manifest.name === suiteName).stage : path.join(root, 'packages', suiteName), stage, { recursive: true })
    const manifest = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8')); manifest.version = version; manifest.engines.dsh = engine
    await writeFile(path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2)); packages.push(await pack(stage))
  }
  report.artifacts = packages.map(item => ({ name: item.manifest.name, version: item.manifest.version, integrity: item.integrity, fixture: item.manifest.name === suiteName && item.manifest.version !== suiteVersion }))
  registry = await startRegistry(packages)
  // Official rollback performs its own pnpm install; keep the same isolated
  // registry and peer policy for that operation as for explicit commands.
  Object.assign(env, { NPM_CONFIG_REGISTRY: registry.url, NPM_CONFIG_AUTO_INSTALL_PEERS: 'false', NPM_CONFIG_MINIMUM_RELEASE_AGE: '0', NPM_CONFIG_FETCH_RETRIES: '0', NPM_CONFIG_FETCH_TIMEOUT: '60000', NPM_CONFIG_STORE_DIR: path.join(temporary, 'pnpm-store') })
  const probe = path.join(temporary, 'probe'); await mkdir(probe)
  await writeFile(path.join(probe, 'package.json'), JSON.stringify({ name: 'dsh-x-suite-test-probe', version: '0.0.0-test', type: 'module', main: 'index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  await writeFile(path.join(probe, 'cordis.patch.yml'), '- insert:\n    - id: dsh-x-suite-test-probe\n      name: dsh-x-suite-test-probe\n')
  await writeFile(path.join(probe, 'index.js'), `export const inject=['loader','connection','pluginManager','clientModules'];
export function apply(ctx){ctx.effect(()=>ctx.connection.fetch.register({path:'/api/suite-test-probe',methods:['POST'],requestBody:'buffered',fetch:async request=>{try{const p=await request.json();let value;if(p.action==='snapshot')value={entries:[...ctx.loader.entries()].filter(e=>e.options.name.startsWith('dsh-x-')).map(e=>({id:e.id,name:e.options.name,active:Boolean(e.fiber&&!e.disabled)})),clients:ctx.clientModules.graph().entries.filter(e=>e.id.startsWith('dsh-x-')),plugins:(await ctx.pluginManager.listPlugins()).filter(e=>e.moduleName.startsWith('dsh-x-'))};else if(p.action==='bundle'&&['dsh-x-suite','dsh-x-code','dsh-x-agents'].includes(p.name)&&typeof p.enabled==='boolean')value=await ctx.pluginManager.setBundleEnabled(p.name,p.enabled);else if(p.action==='plugin'&&typeof p.id==='string'&&typeof p.enabled==='boolean') {const rows=await ctx.pluginManager.listPlugins();if(!rows.some(e=>e.entryId===p.id&&['dsh-x-code','dsh-x-agents'].includes(e.moduleName)))throw Error('Unknown fixture entry');value=await ctx.pluginManager.setPluginEnabled(p.id,p.enabled)}else throw Error('Unknown fixture action');return Response.json(value)}catch(e){return Response.json({error:String(e)})}}}),'suite fixture probe')}
`)
  const artifact = version => packages.find(item => item.manifest.name === suiteName && item.manifest.version === version).file
  await plugin(['add', artifact(suiteVersion), `link:${probe}`]); app = await start()
  if (values['release-dir']) {
    assert.deepEqual(componentLookups, [], 'Release suite must install without fetching unpublished Code or Agents packages.')
    check('release tarball installs bundled Code + Agents without registry lookups')
  }
  let snapshot = await app.snapshot(); counts(snapshot, { 'dsh-x-code': 1, 'dsh-x-agents': 1 }); check('packed suite installs and boots Code + Agents once')
  let code = snapshot.plugins.find(row => row.moduleName === 'dsh-x-code'); assert.equal(code.readOnlyReason, undefined)
  snapshot = await app.change({ action: 'plugin', id: code.entryId, enabled: false }); counts(snapshot, { 'dsh-x-agents': 1 })
  snapshot = await app.change({ action: 'plugin', id: code.entryId, enabled: true }); counts(snapshot, { 'dsh-x-code': 1, 'dsh-x-agents': 1 }); check('official per-plugin disable and re-enable')
  snapshot = await app.change({ action: 'bundle', name: suiteName, enabled: false }); counts(snapshot, {})
  snapshot = await app.change({ action: 'bundle', name: suiteName, enabled: true }); counts(snapshot, { 'dsh-x-code': 1, 'dsh-x-agents': 1 }); check('official suite disable and re-enable')
  await app.stop(); app = null
  // Use the same exact registry provenance as the suite dependencies. Mixing
  // a registry copy and another file/link identity is a different resolution
  // case and can require removal/restart in the official package manager.
  await plugin(['add', ...components.map(name => `${name}@${packages.find(item => item.manifest.name === name).manifest.version}`)]); app = await start()
  snapshot = await app.snapshot(); counts(snapshot, { 'dsh-x-code': 1, 'dsh-x-agents': 1 })
  assert.equal(snapshot.plugins.filter(row => components.includes(row.moduleName)).length, components.length)
  assert.ok(snapshot.plugins.filter(row => components.includes(row.moduleName)).every(row => row.readOnlyReason === 'unaddressable'))
  for (const name of components) await app.change({ action: 'bundle', name, enabled: false })
  snapshot = await app.snapshot(); counts(snapshot, { 'dsh-x-code': 1, 'dsh-x-agents': 1 }); assert.ok(snapshot.plugins.filter(row => components.includes(row.moduleName)).every(row => row.readOnlyReason === undefined)); check('mixed standalone/suite has no duplicate activation; removing selection conflict restores control')
  await app.stop(); app = null
  await plugin(['add', artifact(upgradeVersion)]); app = await start(); counts(await app.snapshot(), { 'dsh-x-code': 1, 'dsh-x-agents': 1 }); check('real CLI replacement with version-bumped suite fixture')
  await app.change({ action: 'bundle', name: suiteName, enabled: false }); await app.stop(); app = null
  await plugin(['add', artifact(disabledUpgradeVersion)]); app = await start(); counts(await app.snapshot(), {}); check('replacement preserves disabled suite selection')
  snapshot = await app.change({ action: 'bundle', name: 'dsh-x-code', enabled: true }); counts(snapshot, { 'dsh-x-code': 1 }); check('Code activates independently without Agents')
  await app.stop(); app = null
  const before = await readFile(path.join(home, 'profiles/web/package.json'), 'utf8'); await plugin(['add', `${suiteName}@${incompatibleVersion}`], 1); assert.equal(await readFile(path.join(home, 'profiles/web/package.json'), 'utf8'), before); check('official incompatible-version refusal preserves manifest')
  await plugin(['remove', suiteName]); app = await start(); counts(await app.snapshot(), { 'dsh-x-code': 1 }); check('suite removal retains independently selected Code')
  await app.stop(); app = null
  // Invert the layer order in the same isolated profile through official API.
  await plugin(['add', artifact(suiteVersion)]); app = await start(); snapshot = await app.snapshot(); counts(snapshot, { 'dsh-x-code': 1, 'dsh-x-agents': 1 }); check('standalone-before-suite order has no duplicate activation')
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.error = String(error).replace(/token=[A-Za-z0-9_-]+/g, 'token=[redacted]'); process.exitCode = 1
  console.error(report.error)
} finally {
  report.completedAt = new Date().toISOString()
  const cleanupErrors = []
  try { await app?.stop() } catch (error) { cleanupErrors.push(String(error)) }
  try {
    if (registry) { registry.server.closeAllConnections(); await new Promise((resolve, reject) => registry.server.close(error => error ? reject(error) : resolve())) }
  } catch (error) { cleanupErrors.push(String(error)) }
  if (cleanupErrors.length) { report.status = 'failed'; report.cleanupErrors = cleanupErrors; process.exitCode = 1 }
  try {
    if (values.report) { await mkdir(path.dirname(path.resolve(values.report)), { recursive: true }); await writeFile(values.report, JSON.stringify(report, null, 2) + '\n') }
    console.log(JSON.stringify({ status: report.status, runtime: report.runtime, passed: report.checks.length, notVerified: report.notVerified }))
  } finally { await rm(temporary, { recursive: true, force: true }) }
}
