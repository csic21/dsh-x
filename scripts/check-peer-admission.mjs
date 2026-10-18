// Prove that a real official runtime admits these plugin builds across the
// declared peer range: install the packed tarballs through the official CLI,
// then boot the official Web Host and exercise a plugin RPC.
//
// This is the admission gate for baselines that are not the qualified release
// runtime (see compatibility/policy.json → additionalBaselines). It does not
// replace scripts/test-suite-install.mjs, which owns the full qualification
// matrix for the baseline runtime.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const { values } = parseArgs({ options: {
  dsh: { type: 'string' },
  'dsh-version': { type: 'string' },
  'release-dir': { type: 'string' },
  report: { type: 'string' },
  plugins: { type: 'string', default: 'dsh-x-stock,dsh-x-plan,dsh-x-chat,dsh-x-agents,dsh-x-code,dsh-x-update' },
  keep: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} })
if (values.help) {
  console.log('node scripts/check-peer-admission.mjs --dsh /abs/path/to/dsh --dsh-version <exact> [--release-dir /abs/dir] [--plugins a,b] [--report /abs/report.json] [--keep]')
  process.exit(0)
}
if (!values.dsh || !path.isAbsolute(values.dsh)) throw new Error('Pass an absolute --dsh path.')
if (!values['dsh-version'] || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(values['dsh-version'])) throw new Error('Pass the exact expected --dsh-version.')
const root = fileURLToPath(new URL('..', import.meta.url))
const names = values.plugins.split(',').map(name => name.trim()).filter(Boolean)
if (names.length === 0) throw new Error('No plugins selected.')
// scripts/smoke-web.mjs proves the Host loaded a plugin by calling the stock
// read-only RPC, so the stock bundle must be part of the installed set.
if (!names.includes('dsh-x-stock')) throw new Error('Include dsh-x-stock in --plugins: the startup smoke exercises its RPC.')

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, ...options })
  if (result.error) throw result.error
  return { code: result.status, out: result.stdout ?? '', err: result.stderr ?? '' }
}

const version = run(values.dsh, ['--version'])
if (version.code !== 0) throw new Error(`Official CLI failed: ${version.err}`)
if (version.out.trim() !== values['dsh-version']) throw new Error(`Runtime mismatch: ${values.dsh} reports ${version.out.trim()}, expected ${values['dsh-version']}.`)

const temporary = await mkdtemp(path.join(tmpdir(), 'dsh-peer-admission-'))
const home = path.join(temporary, 'home')
const packs = path.join(temporary, 'packs')
await mkdir(home, { recursive: true })
await mkdir(packs, { recursive: true })

async function tarballs() {
  const found = []
  if (values['release-dir']) {
    const directory = path.resolve(values['release-dir'])
    const files = await readdir(directory)
    for (const name of names) {
      const matches = files.filter(file => file.startsWith(`${name}-`) && file.endsWith('.tgz'))
      if (matches.length !== 1) throw new Error(`Expected exactly one ${name} tarball in ${directory}, found ${matches.length}.`)
      found.push(path.join(directory, matches[0]))
    }
    return found
  }
  for (const name of names) {
    const directory = path.join(root, 'packages', name)
    const packed = run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packs, directory], { env: { ...process.env, npm_config_cache: path.join(temporary, 'npm-cache') } })
    if (packed.code !== 0) throw new Error(`npm pack ${name} failed: ${packed.err}`)
    const info = JSON.parse(packed.out)[0]
    found.push(path.join(packs, info.filename))
  }
  return found
}

let report
try {
  const files = await tarballs()
  const install = run(values.dsh, ['plugin', '--profile', 'web', 'add', ...files, '--config.auto-install-peers=false', '--ignore-scripts', `--store-dir=${path.join(temporary, 'store')}`, `--cache-dir=${path.join(temporary, 'cache')}`], { env: { ...process.env, DSH_HOME: home }, timeout: 600000 })
  if (install.code !== 0) throw new Error(`Official installation rejected the plugins on ${values['dsh-version']}:\n${install.out}\n${install.err}`)

  const manifest = JSON.parse(await readFile(path.join(home, 'profiles/web/package.json'), 'utf8'))
  const selected = manifest.dsh?.profile?.bundles ?? []
  for (const name of names) if (!selected.includes(name)) throw new Error(`${name} was installed but not selected as a bundle.`)

  const smoke = run(process.execPath, [path.join(root, 'scripts/smoke-web.mjs'), '--dsh', values.dsh, '--home', home], { timeout: 300000 })
  if (smoke.code !== 0) throw new Error(`Web Host smoke failed on ${values['dsh-version']}:\n${smoke.out}\n${smoke.err}`)
  const result = JSON.parse(smoke.out.trim().split('\n').at(-1))
  if (result.stockRpcStatus !== 200 || result.errorsInStartupLog !== false) throw new Error(`Unexpected smoke result: ${JSON.stringify(result)}`)

  const plugins = []
  for (const file of files) {
    const bytes = await readFile(file)
    plugins.push({ file: path.basename(file), sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  for (const name of names) {
    const entry = JSON.parse(await readFile(path.join(root, 'packages', name, 'package.json'), 'utf8'))
    const record = plugins.find(item => item.file.startsWith(`${name}-`))
    record.version = entry.version
    record.declaredPeers = Object.fromEntries(Object.entries(entry.peerDependencies ?? {}).filter(([key]) => key.startsWith('@deepseek-ai/dsh')))
  }
  report = { status: 'passed', runtime: values['dsh-version'], dsh: values.dsh, plugins, smoke: result, notVerified: ['Electron execution', 'native vendor authentication or model execution', 'dependency build scripts (installed with --ignore-scripts)'] }
} catch (error) {
  report = { status: 'failed', runtime: values['dsh-version'], error: error.message, workspace: temporary }
  throw error
} finally {
  if (report?.status === 'failed') {
    console.error(`Diagnostics kept at ${temporary}`)
  } else if (!values.keep) {
    await rm(temporary, { recursive: true, force: true })
  } else {
    console.log(`Workspace kept at ${temporary}`)
  }
  if (values.report) {
    await mkdir(path.dirname(path.resolve(values.report)), { recursive: true })
    await writeFile(path.resolve(values.report), JSON.stringify(report, null, 2) + '\n')
  }
}
console.log(JSON.stringify({ status: report.status, runtime: report.runtime, plugins: (report.plugins ?? []).map(plugin => `${plugin.file} ${plugin.sha256.slice(0, 12)}`) }))
