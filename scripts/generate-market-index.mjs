// Generate the plugin market index served from GitHub Pages.
//
// A `plugins-v*` tag publishes one commit. Each package contributes its own
// package.json version, pinned to the earliest tag that contains that version.
// An unchanged package therefore keeps its old version and its old commit.
// The install target is a commit-pinned Git directory, so no npm publication
// is needed and users add a single index URL in Plugins → Discover.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { PLUGIN_PACKAGES, compareSemver, parseReleaseTag } from './plugin-versions.mjs'

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
  'dsh-x-finance': {
    title: { en: 'Finance', zh: '金融' },
    description: { en: 'A-share watchlist and market board plus a gold panel with cross-market spreads and range moves.', zh: 'A 股自选与市场全景，外加黄金面板：跨市场报价、沪伦价差与区间变化。' },
    category: 'data',
    icon: 'icons/dsh-x-finance.svg',
  },
  'dsh-x-browser': {
    title: { en: 'AI Browser', zh: 'AI 浏览器' },
    description: { en: 'Experimental browser tools: an embedded Desktop tab or an external Chrome driven over CDP, with per-turn grants.', zh: '实验性浏览器工具：Desktop 内嵌 tab，或经 CDP 驱动外部 Chrome；按轮授权。' },
    category: 'web',
    icon: 'icons/dsh-x-browser.svg',
  },
  'dsh-x-delegate': {
    title: { en: 'Delegate', zh: '委派' },
    description: { en: 'Delegate one task to a local Codex, Grok, or OpenCode CLI, with a per-call model.', zh: '把一个任务委派给本机的 Codex、Grok 或 OpenCode，并可按次选择模型。' },
    category: 'development',
    icon: 'icons/dsh-x-delegate.svg',
  },
  'dsh-x-pet': {
    title: { en: 'Desktop Pet', zh: '桌宠' },
    description: { en: 'A Codex-compatible desktop pet in the frame, reading the same local pets from ~/.codex/pets.', zh: '窗口里的 Codex 兼容桌宠，读取 ~/.codex/pets 里的同一批本机桌宠。' },
    category: 'fun',
    icon: 'icons/dsh-x-pet.svg',
  },
  'dsh-x-ui': {
    title: { en: 'Glass UI', zh: '玻璃界面' },
    description: { en: 'Turns the interface into liquid glass: translucent panels, a living backdrop, and real blur on floating surfaces.', zh: '把整个界面换成 liquid glass：半透明面板、流动底色，浮层上真正的模糊。' },
    category: 'fun',
    icon: 'icons/dsh-x-ui.svg',
  },
}

for (const name of PLUGIN_PACKAGES) {
  if (!packages[name]) throw new Error(`missing market display metadata for ${name}`)
}

const tags = git('for-each-ref', '--sort=creatordate', '--format=%(refname:short)%09%(objectname)%09%(creatordate:unix)', 'refs/tags/plugins-v*')
  .split('\n').filter(Boolean).map(line => parseReleaseTag(line, minimum)).filter(Boolean)

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
  try { return JSON.parse(execFileSync('git', ['show', `${commit}:packages/${name}/package.json`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) }
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
  const list = [...versions.get(name).values()].sort((a, b) => compareSemver(b.version, a.version))
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
  description: { en: 'Code review, external coding agents, A-share quotes and an experimental embedded browser for DeepSeek Harness.', zh: 'DeepSeek Harness 的代码审查、外部编码代理、A 股行情与实验性内嵌浏览器。' },
  metadata: {
    categories: {
      development: { title: { en: 'Development', zh: '开发' } },
      data: { title: { en: 'Data', zh: '数据' } },
      web: { title: { en: 'Web', zh: 'Web' } },
      fun: { title: { en: 'Fun', zh: '趣味' } },
    },
    labels: {},
    sortKeys: {},
  },
  plugins,
}

mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(index, null, 2) + '\n')
console.log(`Wrote ${plugins.length} plugin(s), ${plugins.reduce((total, plugin) => total + plugin.versions.length, 0)} version(s) to ${path.relative(root, output)}.`)
