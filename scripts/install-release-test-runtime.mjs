// Install the exact qualified official npm CLI into a disposable directory.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readJson, root } from './suite-support.mjs'

const directory = process.argv[2]
if (!directory || !path.isAbsolute(directory)) throw new Error('Pass a new absolute runtime directory.')
const policy = readJson(path.join(root, 'compatibility/policy.json'))
const { version, integrity } = policy.baseline
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid pinned official version')
await mkdir(directory, { recursive: false })
const response = await fetch(`https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${version}.tgz`, { redirect: 'error', signal: AbortSignal.timeout(60000) })
if (!response.ok) throw new Error(`Official package download failed: ${response.status}`)
const bytes = Buffer.from(await response.arrayBuffer())
if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== integrity) throw new Error('Official CLI integrity mismatch')
const archive = path.join(directory, 'official-dsh.tgz')
await writeFile(archive, bytes)
await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'dsh-release-test-runtime', private: true }))
const result = spawnSync('npm', ['install', '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund', '--save-exact', archive], { cwd: directory, stdio: 'inherit', env: { ...process.env, npm_config_cache: path.join(directory, 'cache') } })
if (result.error || result.status !== 0) throw new Error('Official test runtime installation failed')
const installed = readJson(path.join(directory, 'node_modules/@deepseek-ai/dsh/package.json'))
if (installed.version !== version || installed.name !== policy.package) throw new Error('Wrong test runtime installed')
