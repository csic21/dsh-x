// Publish only artifacts whose producing workflow and actual installed-runtime
// qualifications both succeeded. GitHub Actions moves the bytes directly to
// Releases; no private repository token is embedded in an application.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { root, readJson } from './suite-support.mjs'
import { digest } from './desktop-distribution/bootstrap.mjs'

const { values } = parseArgs({ options: { input: { type: 'string' } } })
assert(values.input)
const runId = process.env.QUALIFIED_RUN, repository = process.env.GH_REPO
assert.match(runId ?? '', /^\d+$/)
assert.equal(repository, 'csic21/dsh-x')
const run = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/actions/runs/${runId}`], { encoding: 'utf8' }))
assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success')
assert.equal(run.path, '.github/workflows/desktop-package.yml')
const policy = readJson(path.join(root, 'compatibility/policy.json'))
const names = ['dsh-x-code', 'dsh-x-agents', 'dsh-x-chat', 'dsh-x-plan', 'dsh-x-stock', 'dsh-x-browser'].sort()
const input = path.resolve(values.input), output = path.join(input, 'assets')
await mkdir(output, { recursive: false })
const sums = [], files = []
let version
for (const [folder, target, extension] of [['macos', 'macos-arm64', '.dmg'], ['windows', 'windows-x64', '.exe']]) {
  const directory = path.join(input, folder)
  const manifest = readJson(path.join(directory, 'distribution.json'))
  const report = readJson(path.join(directory, 'desktop-install-report.json'))
  assert.equal(manifest.schema, 1); assert.equal(manifest.target, target)
  assert.equal(manifest.kernelSha, policy.baseline.inspectedSourceCommit)
  assert.equal(manifest.kernelVersion, policy.baseline.version)
  assert.equal(manifest.pluginCommit, run.head_sha)
  assert.equal(manifest.unsigned, true); assert.equal(manifest.autoUpdate, false)
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  if (version) assert.equal(manifest.version, version)
  version = manifest.version
  assert.deepEqual(manifest.plugins.map(item => item.name).sort(), names)
  assert.equal(report.status, 'passed'); assert.equal(report.target, target)
  assert.equal(report.kernelSha, manifest.kernelSha)
  assert.equal(report.runtime.packaged, true); assert.equal(report.runtime.version, manifest.kernelVersion)
  assert.deepEqual(report.snapshot.entries.map(item => item.name).sort(), names)
  assert(report.snapshot.entries.every(item => item.active))
  assert.deepEqual(report.snapshot.clients.map(item => item.id).sort(), names)
  assert.deepEqual(report.snapshot.plugins.map(item => item.name).sort(), names)
  assert(report.snapshot.plugins.every(item => item.enabled && item.phase === 'active'))
  const installers = (await readdir(directory)).filter(file => file.endsWith(extension))
  assert.equal(installers.length, 1)
  const file = installers[0], checksum = await digest(path.join(directory, file))
  assert.equal((await readFile(path.join(directory, 'SHA256SUMS'), 'utf8')).trim(), `${checksum}  ${file}`)
  await copyFile(path.join(directory, file), path.join(output, file)); files.push(path.join(output, file))
  sums.push(`${checksum}  ${file}\n`)
  for (const [source, destination] of [['distribution.json', `distribution-${target}.json`], ['desktop-install-report.json', `desktop-install-report-${target}.json`]]) {
    await copyFile(path.join(directory, source), path.join(output, destination)); files.push(path.join(output, destination))
  }
}
await writeFile(path.join(output, 'SHA256SUMS'), sums.join('')); files.push(path.join(output, 'SHA256SUMS'))
const notes = `DSH-X ${version} 桌面预览版，包含 Code、Agents、Chat、Plan、Stocks、Browser 六个独立插件。\n\n内核由 workflow 从官方源码直接编译：\`${policy.baseline.version}\`，提交 [\`${policy.baseline.inspectedSourceCommit.slice(0, 8)}\`](https://github.com/deepseek-ai/deepseek-harness/commit/${policy.baseline.inspectedSourceCommit})。官方源码、可执行文件和 app.asar 保持原样，插件通过内嵌官方 CLI 安装。\n\n安装：\n\n- macOS Apple Silicon：下载 DMG，将 DSH-X.app 拖到 Applications，从 DSH-X 启动。\n- Windows x64：下载 EXE，安装后从 DSH-X 快捷方式启动。\n- 首次运行会打开官方应用初始化配置；按提示完全退出一次（macOS Command+Q，Windows 托盘退出），安装器会继续安装插件并重新打开。需要联网下载第三方依赖，无需手动安装 tgz。\n\n数据单独存放在 \`~/.dsh-x/desktop-preview\`，不导入原有官方账号或配置。同一版本启动时不会重新安装用户已停用或移除的插件。\n\n这是未签名预览版：macOS 无 Developer ID / 公证，Windows 无发行代码签名，系统可能提示开发者无法验证。自更新尚未启用。内嵌应用仍显示官方品牌，请通过 DSH-X 入口启动；协议唤起和全局命令尚未作为独立入口验收。\n\n[两平台最终安装验证](${run.html_url}) 已通过：实际从最终 DMG / EXE 安装、由官方 CLI 安装插件、真实 Electron Host 中六个插件与六个客户端模块各激活一次。附件包含来源清单、安装验证报告和 SHA256SUMS。真实供应商登录、模型执行和历史数据迁移不属于本次验收。\n\n校验：macOS 用 \`shasum -a 256 <文件>\`，Windows 用 \`Get-FileHash <文件> -Algorithm SHA256\`，与 SHA256SUMS 中对应条目核对。\n`
await writeFile(path.join(output, 'INSTALL.md'), notes); files.push(path.join(output, 'INSTALL.md'))
const tag = `desktop-v${version}`
const url = execFileSync('gh', ['release', 'create', tag, ...files, '--repo', repository, '--target', run.head_sha, '--prerelease', '--latest=false', '--title', `DSH-X ${version} 桌面预览版`, '--notes-file', path.join(output, 'INSTALL.md')], { encoding: 'utf8' }).trim()
console.log(JSON.stringify({ tag, source: run.head_sha, qualifiedRun: runId, assets: files.length, url }))
