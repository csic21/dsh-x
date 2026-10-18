# GitHub 插件发行

插件版通过 `.github/workflows/plugin-release.yml` 发布，与 Desktop 打包分开。推送 `plugins-v<套件版本>` tag 后，流水线安装锁定依赖、检查类型、运行全量测试，构建八个包（七个插件包与套件包），再用精确版本、SHA-512 校验过的官方 CLI 验证实际套件安装包。所有检查通过才创建 GitHub 预发布版本；失败不会发布，已有 Release 不会被覆盖。

## 安装

在仓库 Releases 页面下载 `dsh-x-suite-<版本>.tgz` 和 `INSTALL.md`。仓库为公开仓库，Release 无需登录即可下载。套件包含 Code、Agents 的预构建文件，第三方依赖仍需联网下载；不需要这些插件已发布到 npm。其他插件按需单独下载对应 tgz。

安装前确认官方 DSH 版本与 Release 的 `build-manifest.json` 中 `runtime` 一致。通过官方 Plugins 页面安装本地文件，或使用官方 CLI：

```sh
dsh --version
dsh plugin --profile web add /绝对路径/dsh-x-suite-0.1.3.tgz --config.auto-install-peers=false
```

Desktop 先启动一次以初始化 profile，然后完全退出；使用 Desktop 自带的 dsh，将 profile 改为 `desktop`。npm CLI 不能替换 Desktop 的内核或依赖图。已有独立 Code、Agents 时，先在官方 Plugins 页面停用它们，再启用套件。安装后检查插件状态，并按官方提示重启。

升级前退出应用，安装目标版本文件，再按提示重启；卸载使用 `dsh plugin --profile web remove dsh-x-suite`。检查仍独立启用的组件。不承诺失败自动回滚。

下载后用 `SHA256SUMS` 核对包文件。macOS / Linux 使用 `shasum -a 256 -c SHA256SUMS`；Windows 使用 `Get-FileHash <文件> -Algorithm SHA256` 与清单对照。校验整份清单需要下载全部八个 tgz。

## 如何发布

发布前同步工作目录并检查待发源码。所有包版本必须与 suite 版本相同，兼容版本仍须通过现有准入，不得为发布放宽。tag 必须指向包含本流水线及完整源码的提交：

```sh
git tag plugins-v0.1.3 <待发布提交>
git push origin plugins-v0.1.3
```

推送 tag 会自动发布，不能用于试跑。Release 始终标记为插件预览版，不成为 Desktop 更新通道的 latest。仓库为公开仓库；首次发布不需要 npm token。

本地生成及验证（输出目录必须不存在，PATH 上的 pnpm 须与 `compatibility/policy.json` 一致）：

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
node scripts/package-plugin-release.mjs --output /tmp/dsh-plugin-release --tag plugins-v0.1.3
node scripts/install-release-test-runtime.mjs /tmp/dsh-release-runtime
node scripts/test-suite-install.mjs \
  --dsh /tmp/dsh-release-runtime/node_modules/.bin/dsh \
  --dsh-version 0.2.1-rc.2 --release-dir /tmp/dsh-plugin-release \
  --report /tmp/dsh-plugin-release/suite-install-report.json
```

发布脚本先打包独立插件，再只在临时目录中将 Code、Agents 加入 suite 的 `bundledDependencies`。它们的第三方依赖提升到 suite 根依赖，留给用户的平台解析，避免携带构建机器的原生二进制。源码 package.json 保留适合未来 npm 发布的精确组件依赖；不能直接拿普通 `npm pack packages/dsh-x-suite` 的结果替代 GitHub 套件产物。参考 [npm bundleDependencies](https://docs.npmjs.com/cli/configuring-npm/package-json/#bundledependencies)。

## 验证边界

Release 附带源码提交、兼容内核版本、包版本、SHA-256 / SHA-512 和真实 CLI 安装报告。套件测试包括安装启动、单项/整套启停、独立组件混装、测试版本替换、移除及兼容拒绝；测试还断言首次安装无需查询 Code、Agents 的 registry 元数据。升级测试使用明确标记的 fixture 版本，不代表真实历史版本数据迁移。

全量测试通过不表示每个可选插件的 Desktop 交互已在所有平台验证。真实供应商登录、原生模型调用以及 Electron 交互按现有证明单独记录；之前免费模型请求被服务商拒绝，Google 证明未完成。安装包不包含官方 Desktop、官方内核、用户配置或凭据。
