import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  dsh: { type: 'string', default: 'dsh' },
  profile: { type: 'string', default: 'web' },
  home: { type: 'string', default: path.join(homedir(), '.dsh-x') },
  'store-dir': { type: 'string' },
  'cache-dir': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
}})
if (values.help) {
  console.log('node scripts/link-plugins.mjs [--dsh /path/to/dsh] [--profile web] [--home /isolated/home] [--store-dir /path] [--cache-dir /path]')
  process.exit(0)
}
if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(values.profile) || values.profile === 'desktop') {
  throw new Error('使用普通 profile 名称，例如 web。desktop 必须使用官方 Desktop 自带的 CLI，此脚本不操作它。')
}
const root = fileURLToPath(new URL('..', import.meta.url))
const packages = ['dsh-x-plan', 'dsh-x-stock', 'dsh-x-chat'].map(name => path.join(root, 'packages', name))
for (const directory of packages) {
  if (!existsSync(path.join(directory, 'package.json'))) throw new Error(`缺少插件：${directory}`)
}
const extra = ['store-dir', 'cache-dir'].flatMap(key => values[key] ? [`--${key}`, path.resolve(values[key])] : [])
const result = spawnSync(values.dsh, ['plugin', '--profile', values.profile, 'add', ...extra, ...packages.map(p => `link:${p}`)], {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, DSH_HOME: path.resolve(values.home) },
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`已链接三个插件；使用同一个 DSH_HOME 启动 ${values.profile}。`)
