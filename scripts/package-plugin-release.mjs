// Produce prebuilt GitHub assets without npm credentials or kernel changes.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { root, readJson, validateSuite, components, suiteName } from './suite-support.mjs'

const { values } = parseArgs({ options: { output: { type: 'string' }, tag: { type: 'string' } } })
if (!values.output) throw new Error('Pass --output <empty output directory>.')
const output = path.resolve(values.output)
const { suite, runtime } = validateSuite()
const tag = `plugins-v${suite.version}`
if (values.tag && values.tag !== tag) throw new Error(`Release tag must be ${tag}.`)
await mkdir(output, { recursive: false })
const temporary = await mkdtemp(path.join(tmpdir(), 'dsh-plugin-release-'))
const names = [...components, 'dsh-x-chat', 'dsh-x-plan', 'dsh-x-stock', 'dsh-x-browser']
const artifacts = []
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, npm_config_cache: path.join(temporary, 'cache') } })
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr ?? `${command} failed`)
  return result.stdout
}
function pack(directory) {
  return JSON.parse(run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], directory))[0]
}
async function record(info, bundled = []) {
  const bytes = await readFile(path.join(output, info.filename))
  artifacts.push({ name: info.name, version: info.version, file: info.filename, sha256: createHash('sha256').update(bytes).digest('hex'), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, bundled })
}
try {
  for (const name of names) {
    const directory = path.join(root, 'packages', name)
    const manifest = readJson(path.join(directory, 'package.json'))
    if (manifest.name !== name || manifest.version !== suite.version || manifest.engines?.dsh !== runtime) throw new Error(`Unqualified release package: ${name}`)
    const info = pack(directory)
    for (const file of ['lib/index.js', 'lib/index.d.ts', 'lib/client.js', 'cordis.patch.yml']) {
      if (!info.files.some(entry => entry.path === file)) throw new Error(`${name} missing ${file}`)
    }
    await record(info)
  }
  // npm's bundledDependencies carries our exact component bytes. Hoist their
  // public dependencies so pnpm resolves platform-specific SDKs on the user's
  // machine, rather than embedding the release runner's native binaries.
  const stage = path.join(temporary, 'suite')
  await mkdir(stage)
  const original = pack(path.join(root, 'packages', suiteName))
  run('tar', ['-xzf', path.join(output, original.filename), '--strip-components=1', '-C', stage])
  const manifest = readJson(path.join(stage, 'package.json'))
  manifest.bundledDependencies = [...components]
  for (const name of components) {
    const target = path.join(stage, 'node_modules', name)
    await mkdir(target, { recursive: true })
    const component = artifacts.find(item => item.name === name)
    run('tar', ['-xzf', path.join(output, component.file), '--strip-components=1', '-C', target])
    const dependency = readJson(path.join(target, 'package.json'))
    for (const [key, version] of Object.entries(dependency.dependencies ?? {})) {
      if (manifest.dependencies[key] && manifest.dependencies[key] !== version) throw new Error(`Conflicting dependency ${key}`)
      manifest.dependencies[key] = version
    }
  }
  await writeFile(path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  const info = pack(stage)
  for (const name of components) {
    if (!info.files.some(entry => entry.path === `node_modules/${name}/lib/index.js`)) throw new Error(`Suite did not bundle ${name}`)
  }
  await record(info, [...components])
  const commit = run('git', ['rev-parse', 'HEAD']).trim()
  await writeFile(path.join(output, 'build-manifest.json'), JSON.stringify({ tag, commit, runtime, packageManager: readJson(path.join(root, 'compatibility/policy.json')).packageManager, artifacts }, null, 2) + '\n')
  await writeFile(path.join(output, 'SHA256SUMS'), artifacts.map(item => `${item.sha256}  ${item.file}\n`).join(''))
  await writeFile(path.join(output, 'INSTALL.md'), `# DSH-X ${suite.version} 插件预览版\n\n兼容官方 DSH：\`${runtime}\`。这是插件包，需要已有官方 DSH；不包含桌面安装程序。\n\n下载 \`dsh-x-suite-${suite.version}.tgz\`。私有仓库请在已登录的 GitHub 页面下载，不要将私有附件 URL 直接交给包管理器。套件已包含 Code、Agents；仍需联网从 npm 下载第三方依赖。\n\n先确认运行时版本，再在官方 Plugins 页面安装本地套件文件，或运行：\n\n\`\`\`sh\ndsh --version\ndsh plugin --profile web add /绝对路径/dsh-x-suite-${suite.version}.tgz --config.auto-install-peers=false\n\`\`\`\n\nDesktop 先启动一次后完全退出，使用 Desktop 自带的 dsh，将 profile 改为 desktop；npm CLI 不替换 Desktop 内核。已有独立 Code / Agents 时，先在 Plugins 页面停用它们，再启用套件。安装后检查插件状态，按官方提示重启。\n\n可选 Chat、Plan、Stocks、Browser 分别下载对应 tgz，通过同样的官方安装入口安装。卸载套件使用 \`dsh plugin --profile web remove dsh-x-suite\`；保留独立组件时检查其启用状态。升级先退出应用，安装目标版本文件，再按官方提示重启；不承诺失败自动回滚。\n\nmacOS / Linux 用 \`shasum -a 256 -c SHA256SUMS\` 验证下载文件；Windows PowerShell 用 \`Get-FileHash 文件名 -Algorithm SHA256\` 与 SHA256SUMS 对照。\n\n限制：原生 Agents 的供应商登录、真实模型调用及所有平台的 Electron 交互不属于本次插件安装验证。此前免费模型请求被服务商拒绝，Google 证明未完成；不能把本版本当作完整原生流程已通过验证。\n`)
  console.log(JSON.stringify({ tag, output, artifacts: artifacts.length, runtime }))
} finally {
  await rm(temporary, { recursive: true, force: true })
}
