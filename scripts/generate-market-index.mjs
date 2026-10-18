// Generate the plugin market index served from GitHub Pages.
//
// Every released `plugins-v*` tag contributes one version per package. The
// install target is a commit-pinned Git directory, so no npm publication is
// needed and users add a single index URL in Plugins → Discover.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({ options: {
  output: { type: 'string', default: 'docs/public/market-index.json' },
  'minimum-version': { type: 'string', default: '0.2.0' },
} })
const output = path.resolve(root, values.output)
const minimum = values['minimum-version']
const repository = 'https://github.com/csic21/dsh-x'
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

const packages = {
  'dsh-x-code': {
    title: { en: 'Code', zh: 'Code' },
    description: { en: 'Read-only source review for the current workspace, using the configured DSH model.', zh: '用当前配置的 DSH 模型审查当前工作区的所选源码。' },
    category: 'development',
    icon: 'icons/dsh-x-code.svg',
  },
  'dsh-x-stock': {
    title: { en: 'Stocks', zh: '股票' },
    description: { en: 'A-share watchlist with name search, quote details and a read-only stock quote tool.', zh: 'A 股自选（含名称搜索）、行情详情与只读报价工具。' },
    category: 'data',
    icon: 'icons/dsh-x-stock.svg',
  },
  'dsh-x-browser': {
    title: { en: 'AI Browser', zh: 'AI 浏览器' },
    description: { en: 'Experimental, opt-in embedded browser with bounded DSH tools and per-turn grants.', zh: '实验性内嵌浏览器，提供受控 DSH 工具与按轮授权。' },
    category: 'web',
    icon: 'icons/dsh-x-browser.svg',
  },
}

const compare = (a, b) => {
  const parse = value => value.split('-')[0].split('.').map(Number)
  const [aMajor, aMinor, aPatch] = parse(a), [bMajor, bMinor, bPatch] = parse(b)
  return aMajor - bMajor || aMinor - bMinor || aPatch - bPatch
}

const tags = git('for-each-ref', '--sort=-creatordate', '--format=%(refname:short)%09%(objectname)%09%(creatordate:unix)', 'refs/tags/plugins-v*')
  .split('\n').filter(Boolean).map(line => {
    const [tag, commit, timestamp] = line.split('\t')
    return { tag, version: tag.slice('plugins-v'.length), commit, timestamp: Number(timestamp) }
  }).filter(item => compare(item.version, minimum) >= 0)

const versions = new Map(Object.keys(packages).map(name => [name, new Map()]))
const add = (name, version, commit, timestamp, manifest) => {
  const known = versions.get(name)
  if (!known || !manifest || known.has(manifest.version ?? version)) return
  known.set(manifest.version ?? version, {
    version: manifest.version ?? version,
    publishTimestamp: timestamp,
    source: { type: 'git', url: `${repository}.git`, commit, path: `packages/${name}` },
    engines: manifest.engines?.dsh ? { dsh: manifest.engines.dsh } : {},
  })
}
const manifestAt = (name, commit) => {
  try { return JSON.parse(execFileSync('git', ['show', `${commit}:packages/${name}/package.json`], { cwd: root, encoding: 'utf8' })) }
  catch { return null }
}

for (const release of tags) {
  for (const name of Object.keys(packages)) add(name, release.version, release.commit, release.timestamp, manifestAt(name, release.commit))
}
// A committed checkout without a matching tag still exposes its current
// version, so the Pages index is usable before the first release of a new
// shape. Uncommitted package changes are skipped: a Git install target would
// otherwise point at a commit that does not contain the advertised version.
const head = git('rev-parse', 'HEAD'), headTimestamp = Number(git('show', '-s', '--format=%ct', 'HEAD'))
for (const name of Object.keys(packages)) {
  const manifestPath = path.join(root, 'packages', name, 'package.json')
  if (!existsSync(manifestPath) || git('status', '--porcelain', '--', `packages/${name}`)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const committed = manifestAt(name, head)
  if (!committed || committed.version !== manifest.version) continue
  add(name, manifest.version, head, headTimestamp, manifest)
}

const plugins = Object.entries(packages).flatMap(([name, display]) => {
  const manifestPath = path.join(root, 'packages', name, 'package.json')
  if (!existsSync(manifestPath)) return []
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const list = [...versions.get(name).values()].sort((a, b) => compare(b.version, a.version))
  if (!list.length) return []
  return [{
    name,
    title: display.title,
    description: display.description,
    icon: display.icon,
    author: 'csic21',
    homepage: 'https://csic21.github.io/dsh-x/guide/plugins',
    repository: { url: repository, directory: `packages/${name}` },
    metadata: { category: display.category, keywords: manifest.keywords ?? [], labels: [], sortKeys: {} },
    versions: list,
  }]
})

const index = {
  format: 1,
  title: { en: 'DSH-X plugins', zh: 'DSH-X 插件' },
  description: { en: 'Code review, A-share quotes and an experimental embedded browser for DeepSeek Harness.', zh: 'DeepSeek Harness 的代码审查、A 股行情与实验性内嵌浏览器。' },
  metadata: {
    categories: {
      development: { title: { en: 'Development', zh: '开发' } },
      data: { title: { en: 'Data', zh: '数据' } },
      web: { title: { en: 'Web', zh: 'Web' } },
    },
    labels: {},
    sortKeys: {},
  },
  plugins,
}

mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(index, null, 2) + '\n')
console.log(`Wrote ${plugins.length} plugin(s), ${plugins.reduce((total, plugin) => total + plugin.versions.length, 0)} version(s) to ${path.relative(root, output)}.`)
