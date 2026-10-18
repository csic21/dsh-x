// Assemble a separate installer around pristine official artifacts. No kernel
// checkout, application archive, or official executable is edited.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, copyFile, mkdir, readFile, readdir, writeFile, access, symlink, chmod } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import { root, readJson } from './suite-support.mjs'
import { digest } from './desktop-distribution/bootstrap.mjs'

const { values } = parseArgs({ options: { runtime: { type: 'string' }, plugins: { type: 'string' }, output: { type: 'string' } } })
for (const key of ['runtime', 'plugins', 'output']) assert(values[key], `Missing --${key}`)
const runtime = path.resolve(values.runtime), plugins = path.resolve(values.plugins), output = path.resolve(values.output)
const source = path.join(root, 'scripts/desktop-distribution')
const official = readJson(path.join(runtime, 'official-runtime.json'))
const policy = readJson(path.join(root, 'compatibility/policy.json'))
const packages = readJson(path.join(plugins, 'build-manifest.json'))
assert.equal(official.schema, 1)
assert.equal(official.kernelSha, policy.baseline.inspectedSourceCommit)
assert.equal(official.version, policy.baseline.version)
assert.equal(official.repository, 'deepseek-ai/deepseek-harness')
assert.equal(official.target, process.env.DESKTOP_TARGET)
assert.equal(packages.runtime, official.version)
assert.equal(await digest(path.join(runtime, path.basename(official.file))), official.sha256, 'Official installer hash mismatch')
const version = packages.artifacts.find(item => item.name === 'dsh-x-suite').version
await mkdir(output, { recursive: false })
const work = output + '-stage'
await mkdir(work, { recursive: false })
function run(command, args) {
  console.log(`desktop distribution: ${path.basename(command)}`)
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.error?.message ?? result.status})`)
}
async function find(directory, predicate) {
  const hits = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) hits.push(...await find(file, predicate))
    else if (predicate(entry.name)) hits.push(file)
  }
  return hits
}
const mac = official.target === 'macos-arm64'
assert.equal(process.platform, mac ? 'darwin' : 'win32')
const app = mac ? path.join(work, 'DSH-X.app') : path.join(work, 'DSH-X')
const distributionRoot = mac ? path.join(app, 'Contents/Resources') : app
await mkdir(path.join(distributionRoot, 'runtime'), { recursive: true })
if (mac) {
  const mount = path.join(work, 'official-volume')
  await mkdir(mount)
  run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, path.join(runtime, official.file)])
  try {
    const applications = (await readdir(mount)).filter(name => name.endsWith('.app'))
    assert.equal(applications.length, 1)
    run('/usr/bin/ditto', [path.join(mount, applications[0]), path.join(distributionRoot, 'runtime', 'DeepSeek Harness.app')])
  } finally { run('/usr/bin/hdiutil', ['detach', mount]) }
} else {
  const sevenZip = path.join(process.env.ProgramFiles, '7-Zip/7z.exe')
  const extracted = path.join(work, 'official-extracted')
  run(sevenZip, ['x', path.join(runtime, official.file), `-o${extracted}`, '-y'])
  const payloads = await find(extracted, name => /^app.*\.7z$/i.test(name))
  assert.equal(payloads.length, 1, 'Expected exactly one official NSIS application payload')
  run(sevenZip, ['x', payloads[0], `-o${path.join(distributionRoot, 'runtime')}`, '-y'])
}
const applicationResources = mac ? 'runtime/DeepSeek Harness.app/Contents/Resources' : 'runtime/resources'
const executable = mac ? 'runtime/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' : 'runtime/DeepSeek Harness.exe'
const archive = `${applicationResources}/app.asar`
const node = `${applicationResources}/runtime/primary-runtime/dependencies/node/bin/${mac ? 'node' : 'node.exe'}`
for (const file of [executable, archive, node]) await access(path.join(distributionRoot, file))
await copyFile(path.join(source, 'bootstrap.mjs'), path.join(distributionRoot, 'bootstrap.mjs'))
for (const file of ['dialog.ps1', 'check-running.ps1']) await copyFile(path.join(source, file), path.join(distributionRoot, file))
await mkdir(path.join(distributionRoot, 'packs'))
// Desktop carries every tarball already, so install independent bundles. This
// avoids the nested suite's extra loader lifecycle and keeps each row owned by
// one directly selected bundle on both platforms.
const selected = ['dsh-x-code', 'dsh-x-agents', 'dsh-x-chat', 'dsh-x-plan', 'dsh-x-stock', 'dsh-x-browser', 'dsh-x-update']
const bundled = []
for (const name of selected) {
  const artifact = packages.artifacts.find(item => item.name === name)
  assert(artifact && artifact.version === version)
  assert.equal(await digest(path.join(plugins, artifact.file)), artifact.sha256)
  await copyFile(path.join(plugins, artifact.file), path.join(distributionRoot, 'packs', artifact.file))
  bundled.push({ name, version: artifact.version, file: `packs/${artifact.file}`, sha256: artifact.sha256 })
}
const id = `dsh-x-${version}-${createHash('sha256').update(JSON.stringify(bundled)).digest('hex').slice(0, 12)}`
const manifest = { schema: 1, id, version, target: official.target, kernelRepository: official.repository, kernelSha: official.kernelSha, kernelVersion: official.version, pluginCommit: packages.commit, officialInstallerSha256: official.sha256, unsigned: true, autoUpdate: false, executable, archive, archiveSha256: await digest(path.join(distributionRoot, archive)), cli: `${applicationResources}/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js`, plugins: bundled }
await writeFile(path.join(distributionRoot, 'distribution.json'), JSON.stringify(manifest, null, 2) + '\n')
const instructions = `DSH-X ${version} Desktop Preview\n\nOfficial kernel: ${official.version} (${official.kernelSha})\nPlugins: Code, Agents, Chat, Plan, Stocks, Browser, Update\n\n请始终通过 DSH-X 入口启动。首次运行会打开原样官方应用完成原生配置初始化，请完全退出该窗口；安装器随后通过官方 CLI 安装插件并重新打开。初次安装需要联网下载第三方依赖，无需手动安装 tgz。\n\n数据位于官方默认的 ~/.dsh，会话、账号和配置与原生安装共用；插件会出现在官方 Plugins 页面。后续可在该页面停用、移除插件；同一发行版启动时不会重新启用它们。卸载应用会保留用户数据。\n\n这是未签名预览包，macOS 未公证、Windows 未做代码签名；包含 DSH-X 更新器，但自动应用更新只校验发布清单的 SHA-256，不验证代码签名。当前仍显示官方内嵌应用品牌，外部协议和全局 dsh 命令集成尚未作为 DSH-X 入口验收。真实供应商模型与账号认证不属于安装验证。\n`
await writeFile(path.join(distributionRoot, 'INSTALL.txt'), instructions)
let file
if (mac) {
  await mkdir(path.join(app, 'Contents/MacOS'))
  const launcher = path.join(app, 'Contents/MacOS/DSH-X')
  run('/usr/bin/clang', ['-arch', 'arm64', '-Os', '-o', launcher, path.join(source, 'launcher-mac.c')])
  await chmod(launcher, 0o755)
  await writeFile(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.csic21.dshx.preview.launcher</string><key>CFBundleName</key><string>DSH-X</string><key>CFBundleDisplayName</key><string>DSH-X</string><key>CFBundleExecutable</key><string>DSH-X</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>${version}</string></dict></plist>`)
  // Seal only the new outer launcher; keep the official nested app untouched.
  run('/usr/bin/codesign', ['--force', '--sign', '-', app])
  run('/usr/bin/codesign', ['--verify', '--strict', app])
  const image = path.join(work, 'image')
  await mkdir(image)
  run('/usr/bin/ditto', [app, path.join(image, 'DSH-X.app')])
  await copyFile(path.join(distributionRoot, 'INSTALL.txt'), path.join(image, 'INSTALL.txt'))
  await symlink('/Applications', path.join(image, 'Applications'))
  file = `DSH-X-${version}-mac-arm64-preview.dmg`
  run('/usr/bin/hdiutil', ['create', '-volname', `DSH-X ${version}`, '-srcfolder', image, '-format', 'ULMO', '-ov', path.join(output, file)])
} else {
  const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe')
  run(compiler, ['/nologo', '/target:winexe', '/platform:x64', '/reference:System.Windows.Forms.dll', `/out:${path.join(app, 'DSH-X.exe')}`, path.join(source, 'launcher-windows.cs')])
  const nsis = path.join(process.env['ProgramFiles(x86)'], 'NSIS/makensis.exe')
  file = `DSH-X-${version}-win-x64-preview.exe`
  run(nsis, [`/DSOURCE=${app}`, `/DOUTPUT=${path.join(output, file)}`, `/DVERSION=${version}`, path.join(source, 'installer.nsi')])
}
await copyFile(path.join(distributionRoot, 'distribution.json'), path.join(output, 'distribution.json'))
await writeFile(path.join(output, 'INSTALL.txt'), instructions)
await writeFile(path.join(output, 'SHA256SUMS'), `${await digest(path.join(output, file))}  ${file}\n`)
await writeFile(path.join(work, 'staged-root.json'), JSON.stringify({ root: distributionRoot, installer: path.join(output, file), version, target: official.target }))
console.log(JSON.stringify({ file, output, root: distributionRoot, kernel: official.kernelSha, plugins: bundled.map(item => item.name) }))
