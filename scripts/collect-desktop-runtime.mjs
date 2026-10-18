import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, mkdir, readdir, copyFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { root, readJson } from './suite-support.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { kernel: { type: 'string' }, output: { type: 'string' } } })
const kernel = path.resolve(values.kernel)
const git = (...args) => execFileSync('git', args, { cwd: kernel, encoding: 'utf8' }).trim()
const policy = readJson(path.join(root, 'compatibility/policy.json'))
const sha = git('rev-parse', 'HEAD')
assert.equal(sha, policy.baseline.inspectedSourceCommit, 'Kernel must match the exact qualified official source')
assert.equal(readJson(path.join(kernel, 'package.json')).version, policy.baseline.version)
assert.equal(git('diff', '--name-only', 'HEAD'), '', 'Official tracked source must remain unchanged')
assert.match(git('remote', 'get-url', 'origin'), /(?:github\.com[:/])deepseek-ai\/deepseek-harness(?:\.git)?$/)
if (process.env.KERNEL_REPOSITORY) assert.equal(process.env.KERNEL_REPOSITORY, 'deepseek-ai/deepseek-harness')
if (positionals[0] === 'check') { console.log(JSON.stringify({ kernelSha: sha, version: policy.baseline.version })); process.exit(0) }
assert.equal(positionals[0], 'collect')
const target = process.env.DESKTOP_TARGET
assert(['macos-arm64', 'windows-x64'].includes(target))
const directory = path.join(kernel, 'apps/desktop/.desktop-build/targets', target === 'macos-arm64' ? 'mac-arm64' : 'win-x64', 'unsigned-artifacts')
const extension = target === 'macos-arm64' ? '.dmg' : '.exe'
const files = (await readdir(directory)).filter(file => file.endsWith(extension))
assert.equal(files.length, 1, 'Expected exactly one official installer')
const output = path.resolve(values.output)
await mkdir(output, { recursive: false })
const file = files[0], bytes = await readFile(path.join(directory, file))
await copyFile(path.join(directory, file), path.join(output, file))
await writeFile(path.join(output, 'official-runtime.json'), JSON.stringify({ schema: 1, target, version: policy.baseline.version, kernelSha: sha, repository: 'deepseek-ai/deepseek-harness', file, sha256: createHash('sha256').update(bytes).digest('hex'), unsigned: true, pluginsIncluded: false }, null, 2) + '\n')
console.log(JSON.stringify({ output, file, kernelSha: sha }))
