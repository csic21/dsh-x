#!/usr/bin/env node
// Discovery never executes registry code. Qualification is intended ONLY for
// the disposable, credential-free container in upstream-compatibility.yml.
import { createHash, timingSafeEqual } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const OFFICIAL_PACKAGE = '@deepseek-ai/dsh'
export const REGISTRY = 'https://registry.npmjs.org'
const REPOSITORY = 'https://github.com/deepseek-ai/deepseek-harness'
const MAX_METADATA_BYTES = 32 * 1024 * 1024
const MAX_TARBALL_BYTES = 64 * 1024 * 1024
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

export function parseVersion(input) {
  if (typeof input !== 'string' || input.length > 128) throw new Error('An exact published SemVer version is required.')
  const match = VERSION.exec(input)
  if (!match || match[4]?.split('.').some(part => /^0\d+$/.test(part))) throw new Error(`Invalid exact version: ${JSON.stringify(input)}`)
  return { value: input, core: match.slice(1, 4).map(BigInt), prerelease: match[4]?.split('.') ?? [], build: match[5] ?? '' }
}

export function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right)
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1
  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i], y = b.prerelease[i]
    if (x === y) continue
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y)
    if (xn && yn) return BigInt(x) > BigInt(y) ? 1 : -1
    if (xn !== yn) return xn ? -1 : 1
    return x > y ? 1 : -1
  }
  return 0
}

export function validateIntegrity(value) {
  if (typeof value !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(value)) throw new Error('A single canonical SHA-512 npm integrity pin is required.')
  const bytes = Buffer.from(value.slice(7), 'base64')
  if (bytes.length !== 64 || bytes.toString('base64') !== value.slice(7)) throw new Error('Invalid SHA-512 integrity pin.')
  return value
}

export function verifyIntegrity(bytes, integrity) {
  validateIntegrity(integrity)
  if (!timingSafeEqual(createHash('sha512').update(bytes).digest(), Buffer.from(integrity.slice(7), 'base64'))) throw new Error('Tarball integrity mismatch; refusing to install.')
  return true
}

export function validateDescriptor(value) {
  if (!value || value.name !== OFFICIAL_PACKAGE) throw new Error('Unexpected upstream package identity.')
  parseVersion(value.version)
  validateIntegrity(value.integrity)
  const url = new URL(value.tarball)
  if (url.origin !== REGISTRY || url.username || url.password || url.search || url.hash ||
      decodeURIComponent(url.pathname) !== `/@deepseek-ai/dsh/-/dsh-${value.version}.tgz`) throw new Error('Upstream tarball must be the exact official npm registry package URL.')
  return value
}

export function releaseDescriptor(metadata, version, pinnedIntegrity) {
  parseVersion(version)
  const pkg = metadata?.versions?.[version]
  if (!pkg || pkg.version !== version || pkg.name !== OFFICIAL_PACKAGE) throw new Error(`Exact official release is not published: ${version}`)
  const repository = (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url)?.replace(/^git\+/, '').replace(/\.git$/, '')
  if (repository !== REPOSITORY) throw new Error(`Unexpected upstream repository for ${version}.`)
  const descriptor = validateDescriptor({ name: pkg.name, version, integrity: pkg.dist?.integrity, tarball: pkg.dist?.tarball, publishedAt: metadata.time?.[version] ?? null, registryGitHead: typeof pkg.gitHead === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(pkg.gitHead) ? pkg.gitHead : null })
  if (pinnedIntegrity && descriptor.integrity !== pinnedIntegrity) throw new Error(`Registry integrity changed for pinned baseline ${version}.`)
  return descriptor
}

export function discover(metadata, policy, { requestedVersion = '', allowPrerelease = false } = {}) {
  if (policy.package !== OFFICIAL_PACKAGE || policy.registry !== REGISTRY || policy.repository !== REPOSITORY) throw new Error('Unsupported upstream policy source.')
  const baseline = releaseDescriptor(metadata, policy.baseline.version, policy.baseline.integrity)
  let selected
  if (requestedVersion) {
    const parsed = parseVersion(requestedVersion)
    if (parsed.prerelease.length && !allowPrerelease) throw new Error('Prerelease candidates require explicit --allow-prerelease.')
    selected = requestedVersion
  } else {
    const versions = Object.keys(metadata.versions ?? {}).filter(version => {
      try { const parsed = parseVersion(version); return allowPrerelease || !parsed.prerelease.length } catch { return false }
    })
    versions.sort((a, b) => compareVersions(b, a) || b.localeCompare(a))
    selected = versions[0]
  }
  const candidate = selected ? releaseDescriptor(metadata, selected) : null
  const isDistinct = candidate !== null && candidate.version !== baseline.version
  const isNewer = candidate !== null && compareVersions(candidate.version, baseline.version) > 0
  const shouldTestCandidate = isDistinct && (isNewer || Boolean(requestedVersion))
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), source: `${REGISTRY}/@deepseek-ai%2fdsh`,
    channel: allowPrerelease ? 'prereleases-opted-in' : 'stable-only', baseline,
    candidate, candidateIsDistinct: isDistinct, candidateIsNewer: isNewer,
    status: !candidate ? 'no-stable-release' : !isDistinct ? 'baseline-is-newest-eligible' : !isNewer && !requestedVersion ? 'no-newer-eligible-release' : 'candidate-needs-qualification',
    automaticPromotion: false,
    matrix: { include: [{ role: 'baseline', version: baseline.version }, ...(shouldTestCandidate ? [{ role: 'candidate', version: candidate.version }] : [])] },
  }
}

export function checkExactEngines(manifests, version) {
  parseVersion(version)
  if (!manifests.length) throw new Error('No plugin manifests were checked.')
  const mismatches = manifests.filter(manifest => manifest.engines?.dsh !== version).map(manifest => ({ name: manifest.name, declared: manifest.engines?.dsh ?? null, required: version }))
  return { status: mismatches.length ? 'blocked' : 'passed', mode: 'exact-version-only', checkedPackages: manifests.map(manifest => manifest.name), mismatches }
}

export function outcomeFor({ role, admission, runtime, suite, error }) {
  if (error || runtime === 'failed' || suite === 'failed') return { status: 'checks-failed', exitCode: 1, promoted: false }
  if (admission !== 'passed' || runtime !== 'passed' || suite !== 'passed') return { status: 'needs-qualification', exitCode: 2, promoted: false }
  return role === 'baseline'
    ? { status: 'baseline-checks-passed', exitCode: 0, promoted: false }
    : { status: 'candidate-checks-passed-needs-review', exitCode: 2, promoted: false }
}

export function isolatedEnvironment(directory) {
  // An environment allowlist is additional hardening, NOT a substitute for the
  // container boundary: no host process environment or credential mounts.
  return {
    PATH: '/usr/local/bin:/usr/bin:/bin', HOME: path.join(directory, 'home'),
    TMPDIR: path.join(directory, 'tmp'), XDG_CONFIG_HOME: path.join(directory, 'config'),
    XDG_CACHE_HOME: path.join(directory, 'cache'), XDG_DATA_HOME: path.join(directory, 'data'),
    DSH_HOME: path.join(directory, 'dsh-home'), CI: 'true', LANG: 'C.UTF-8',
    npm_config_registry: REGISTRY, npm_config_cache: path.join(directory, 'npm-cache'),
    npm_config_userconfig: path.join(directory, 'empty.npmrc'), npm_config_globalconfig: path.join(directory, 'empty-global.npmrc'),
    npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  }
}

export function validateSuiteReport(report, version) {
  if (report?.status !== 'passed' || report.runtime !== version) throw new Error('Suite harness did not qualify this exact runtime.')
  const required = [
    'packed suite installs and boots Code + Agents once',
    'official per-plugin disable and re-enable',
    'official suite disable and re-enable',
    'mixed standalone/suite has no duplicate activation; removing selection conflict restores control',
    'real CLI replacement with version-bumped suite fixture',
    'replacement preserves disabled suite selection',
    'Code activates independently without Agents',
    'official incompatible-version refusal preserves manifest',
    'suite removal retains independently selected Code',
    'standalone-before-suite order has no duplicate activation',
  ]
  for (const name of required) if (!report.checks?.some(check => check.name === name && check.status === 'passed')) throw new Error(`Suite harness missing real check: ${name}`)
  if (!Array.isArray(report.notVerified) || report.fixtureVersions !== true) throw new Error('Suite harness must disclose unverified coverage and fixture versions.')
  for (const name of ['dsh-x-suite', 'dsh-x-code', 'dsh-x-agents']) {
    const artifact = report.artifacts?.find(item => item.name === name && item.fixture === false)
    if (!artifact) throw new Error(`Suite harness missing installed artifact: ${name}`)
    validateIntegrity(artifact.integrity)
  }
  return { status: report.status, evidence: report.evidence, passedChecks: required, notVerified: report.notVerified, fixtureVersions: true }
}

async function fetchBytes(url, maximum) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`Official npm registry returned HTTP ${response.status}.`)
  if (Number(response.headers.get('content-length')) > maximum) { await response.body?.cancel(); throw new Error('Registry response exceeds size limit.') }
  const parts = []; let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > maximum) throw new Error('Registry response exceeds size limit.')
    parts.push(Buffer.from(chunk))
  }
  return Buffer.concat(parts)
}

function safeMessage(error) {
  return String(error?.message ?? error).replace(/([?&]token=)[^\s&]+/gi, '$1[redacted]').slice(0, 3000)
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, shell: false, encoding: 'utf8', timeout: 12 * 60_000, maxBuffer: 8 * 1024 * 1024 })
  // Avoid persisting child logs, environment, or browser bootstrap tokens.
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} ${args[0]} failed (${result.error?.code ?? result.status ?? result.signal}). ${safeMessage((result.stderr || result.stdout || '').slice(-2000))}`)
  return result.stdout.trim()
}

async function smokeOfficialWeb(dsh, options) {
  const child = spawn(dsh, ['web', '--no-open', '--port', '0'], { ...options, stdio: ['ignore', 'pipe', 'pipe'], shell: false, detached: true })
  let log = '', timer
  const exited = new Promise(resolve => child.once('exit', resolve))
  try {
    const url = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Official web startup timed out after 60 seconds.')), 60_000)
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`Official web exited before ready (${code}).`)))
      const receive = chunk => {
        log += chunk.toString()
        if (log.length > 1024 * 1024) return reject(new Error('Official web startup log exceeded limit.'))
        const found = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)
        if (found) resolve(found[0])
      }
      child.stdout.on('data', receive); child.stderr.on('data', receive)
    })
    clearTimeout(timer)
    const login = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
    const cookie = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
    await login.body?.cancel()
    if (![302, 303].includes(login.status) || !cookie) throw new Error('Official web authentication bootstrap failed.')
    const response = await fetch(new URL('/', url), { headers: { cookie }, redirect: 'error', signal: AbortSignal.timeout(10_000) })
    const html = await response.text()
    if (response.status !== 200 || !/<html\b/i.test(html)) throw new Error('Official web did not serve authenticated HTML.')
    return { status: 'passed', authenticatedHttpStatus: response.status, htmlBytes: Buffer.byteLength(html), scope: 'official-runtime-boot-and-http-only' }
  } finally {
    clearTimeout(timer)
    const kill = signal => { try { process.kill(-child.pid, signal) } catch (error) { if (error.code !== 'ESRCH' && child.pid) throw error } }
    if (child.pid) kill('SIGTERM')
    let cleanupTimer
    await Promise.race([exited, new Promise(resolve => { cleanupTimer = setTimeout(() => { if (child.pid) kill('SIGKILL'); resolve() }, 5000) })])
    clearTimeout(cleanupTimer)
  }
}

async function qualify(discovery, policy, role, reportPath) {
  if (process.env.DSH_UPSTREAM_SANDBOX !== '1' || !existsSync('/.dockerenv')) throw new Error('Qualification must run in the documented disposable, credential-free Docker sandbox.')
  if (!['baseline', 'candidate'].includes(role)) throw new Error('Role must be baseline or candidate.')
  const descriptor = validateDescriptor(discovery[role])
  if (role === 'candidate' && parseVersion(descriptor.version).prerelease.length && discovery.channel !== 'prereleases-opted-in') throw new Error('Prerelease qualification was not explicitly opted into.')
  if (policy.packageManager?.name !== 'pnpm') throw new Error('Only the pinned pnpm package manager is supported.')
  parseVersion(policy.packageManager.version)
  if (role === 'baseline' && (descriptor.version !== policy.baseline.version || descriptor.integrity !== policy.baseline.integrity)) throw new Error('Discovery changed the pinned baseline.')
  if (role === 'candidate' && descriptor.version === policy.baseline.version) throw new Error('Candidate must differ from baseline; use the baseline control job.')
  const report = {
    schemaVersion: 1, role, release: descriptor, baseline: policy.baseline, startedAt: new Date().toISOString(),
    automaticPromotion: false, lifecycleScripts: 'disabled',
    checks: { integrity: 'not-run', packageRuntime: 'not-run', runtimeBoot: 'not-run', suiteInstallBoot: 'not-run' },
    coverage: { browserUi: 'not-run', nativeApis: 'not-run', liveProviders: 'not-run', desktopPlatforms: 'not-run', optionalPlugins: 'manifest-admission-only' },
  }
  const work = await mkdtemp(path.join(os.tmpdir(), 'dsh-upstream-'))
  try {
    const env = isolatedEnvironment(work)
    await Promise.all(Object.values(env).filter(value => typeof value === 'string' && value.startsWith(work) && !value.endsWith('.npmrc')).map(value => mkdir(value, { recursive: true })))
    await writeFile(env.npm_config_userconfig, ''); await writeFile(env.npm_config_globalconfig, '')
    // Required entries may not silently disappear; discover all additional
    // DSH-X packages (including optional Browser) instead of omitting them.
    const entries = await readdir(path.join(ROOT, 'packages'), { withFileTypes: true })
    const directories = [...new Set([...policy.pluginDirectories, ...entries.filter(entry => entry.isDirectory() && entry.name.startsWith('dsh-x-')).map(entry => `packages/${entry.name}`)])]
    const manifests = await Promise.all(directories.map(async directory => JSON.parse(await readFile(path.join(ROOT, directory, 'package.json'), 'utf8'))))
    report.admission = checkExactEngines(manifests, descriptor.version)
    const tarball = await fetchBytes(descriptor.tarball, MAX_TARBALL_BYTES)
    verifyIntegrity(tarball, descriptor.integrity)
    report.checks.integrity = 'passed'
    const archive = path.join(work, 'official-dsh.tgz')
    await writeFile(archive, tarball, { flag: 'wx' })
    const runtime = path.join(work, 'runtime'); await mkdir(runtime)
    await writeFile(path.join(runtime, 'package.json'), JSON.stringify({ name: 'upstream-isolated-check', private: true }))
    run('npm', ['install', '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund', '--save-exact', archive, `pnpm@${policy.packageManager.version}`], { cwd: runtime, env })
    const installed = JSON.parse(await readFile(path.join(runtime, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'))
    if (installed.name !== descriptor.name || installed.version !== descriptor.version) throw new Error('Installed official package does not match the pinned release.')
    const lock = await readFile(path.join(runtime, 'package-lock.json'))
    const installedLock = JSON.parse(lock).packages['node_modules/@deepseek-ai/dsh']
    if (installedLock?.integrity !== descriptor.integrity || installedLock?.version !== descriptor.version) throw new Error('Installed runtime lock does not preserve exact version and integrity.')
    report.runtimeLockSha256 = createHash('sha256').update(lock).digest('hex')
    // No credentials are present in this generated lock. Record all resolved
    // dependency versions/integrities for this run, even if ranges drift later.
    await writeFile(path.join(path.dirname(reportPath), 'runtime-package-lock.json'), lock)
    env.PATH = `${path.join(runtime, 'node_modules/.bin')}:${env.PATH}`
    const dsh = path.join(runtime, 'node_modules/.bin/dsh')
    const versionOutput = run(dsh, ['--version'], { cwd: work, env })
    if (versionOutput !== descriptor.version) throw new Error('Official CLI reported a different runtime version.')
    const config = run(dsh, ['--profile', 'web', '--dump-default-config'], { cwd: work, env })
    if (!config.trim()) throw new Error('Official runtime returned an empty web profile configuration.')
    report.checks.packageRuntime = 'passed'
    report.runtimeWeb = await smokeOfficialWeb(dsh, { cwd: work, env })
    report.checks.runtimeBoot = 'passed'
    if (report.admission.status === 'passed') {
      const harness = path.join(ROOT, 'scripts/test-suite-install.mjs')
      if (existsSync(harness)) {
        run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], { cwd: ROOT, env })
        run('pnpm', ['run', 'build'], { cwd: ROOT, env })
        const suiteReportPath = path.join(path.dirname(reportPath), 'suite-install-report.json')
        run(process.execPath, [harness, '--dsh', dsh, '--dsh-version', descriptor.version, '--report', suiteReportPath], { cwd: ROOT, env })
        report.suiteEvidence = validateSuiteReport(JSON.parse(await readFile(suiteReportPath, 'utf8')), descriptor.version)
        report.checks.suiteInstallBoot = 'passed'
        report.suiteReport = 'suite-install-report.json'
      } else report.checks.suiteInstallBoot = 'harness-missing'
    } else report.checks.suiteInstallBoot = 'blocked-by-exact-engines'
  } catch (error) {
    report.error = safeMessage(error)
  } finally {
    Object.assign(report, outcomeFor({ role, admission: report.admission?.status, runtime: report.checks.runtimeBoot, suite: report.checks.suiteInstallBoot, error: report.error }))
    report.finishedAt = new Date().toISOString()
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    await rm(work, { recursive: true, force: true })
  }
  return report
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    version: { type: 'string' }, 'allow-prerelease': { type: 'boolean', default: false },
    policy: { type: 'string', default: path.join(ROOT, 'compatibility/policy.json') },
    report: { type: 'string' }, discovery: { type: 'string' }, role: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  } })
  if (values.help) {
    console.log('discover --report <json> [--version <exact>] [--allow-prerelease]\nqualify --discovery <json> --role <baseline|candidate> --report <json> (credential-free Docker only)')
    return 0
  }
  if (!values.report || positionals.length !== 1) throw new Error('One command and --report are required; see --help.')
  const reportPath = path.resolve(values.report); await mkdir(path.dirname(reportPath), { recursive: true })
  const policy = JSON.parse(await readFile(values.policy, 'utf8'))
  if (positionals[0] === 'discover') {
    if (values.version) {
      const requested = parseVersion(values.version)
      if (requested.prerelease.length && !values['allow-prerelease']) throw new Error('Prerelease candidates require explicit --allow-prerelease.')
    }
    const metadata = JSON.parse((await fetchBytes(`${REGISTRY}/@deepseek-ai%2fdsh`, MAX_METADATA_BYTES)).toString('utf8'))
    const report = discover(metadata, policy, { requestedVersion: values.version, allowPrerelease: values['allow-prerelease'] })
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify({ status: report.status, baseline: report.baseline.version, candidate: report.candidate?.version ?? null, automaticPromotion: false }))
    return 0
  }
  if (positionals[0] === 'qualify') {
    if (!values.discovery) throw new Error('--discovery is required.')
    const report = await qualify(JSON.parse(await readFile(values.discovery, 'utf8')), policy, values.role, reportPath)
    console.log(JSON.stringify({ role: report.role, version: report.release.version, status: report.status, error: report.error }))
    return report.exitCode
  }
  throw new Error('Unknown command; use discover or qualify.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code }, error => { console.error(safeMessage(error)); process.exitCode = 1 })
}
