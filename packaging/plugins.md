# GitHub 插件发行

插件版通过 `.github/workflows/plugin-release.yml` 发布。本仓库只产出插件 tgz，不构建 Desktop、不生成 DMG/EXE，也不提供应用更新 helper；桌面应用如需发行，由独立应用仓库负责。推送 `plugins-v<套件版本>` tag 后，流水线安装锁定依赖、检查类型、运行全量测试，构建八个包（七个插件包与套件包），然后过两道门：**admission** 用两个固定完整性运行时（`next` = 0.2.1-rc.2、`latest` = 0.2.0-rc.2）各装一次真实 tgz、启动官方 Web Host 并调用插件 RPC；**qualification** 在基线运行时上跑完整套件矩阵。两道都通过才创建 GitHub 预发布版本；失败不会发布，已有 Release 不会被覆盖。

定时任务每日用默认分支重跑同一流水线，但从不发布；手动 `workflow_dispatch` 可以演练发布（默认只跑快路径，勾选 `full_qualification` 才跑完整矩阵）。

## 安装

在仓库 Releases 页面把整份 Release 资产下载到同一个目录（公开仓库，附件无需登录）。套件包含 Code、Agents 的预构建文件，第三方依赖仍需联网下载；不需要这些插件已发布到 npm。

推荐用 Release 附带的 `install-plugins.mjs` 一条命令装齐常用组合：

```sh
cd ~/Downloads/dsh-x-0.1.3
dsh --version             # 0.2.0-rc.2 或 0.2.1-rc.2
node install-plugins.mjs  # 默认 suite + plan + stock + chat + update
```

`--plugins` 换集合，`--profile` / `--home` / `--dsh` 指定目标，`--dry-run` 只打印命令。脚本只做编排：读 `build-manifest.json` 的 `runtime`（不一致只警告，是否兼容由官方 CLI 判定）、调用官方 `dsh plugin --profile web add`、装完再确认这些包确实被选中为 bundle。它不创建自己的 home，也不改官方会话与凭据；browser 是实验性包，需显式 `--plugins` 才装。仓库 checkout 里同一份脚本位于 `scripts/install-plugins.mjs`。

也可以手工用官方 Plugins 页面安装本地文件，或逐条调用官方 CLI：

```sh
dsh plugin --profile web add /绝对路径/dsh-x-suite-0.1.3.tgz --config.auto-install-peers=false
```

版本口径分两层：`build-manifest.json` 的 `runtime` 是跑过完整矩阵的基线（`engines.dsh` 也钉在它上面）；插件对官方 `@deepseek-ai/dsh-*` 的 peer 范围是加载准入（当前 `^0.2.0-rc.2 || ^0.2.1-rc.2`），所以 npm `latest` 的 0.2.0-rc.2 也能安装启动，但只有基线运行时经过完整套件矩阵。原因与证据范围见 [兼容说明](../compatibility/README.md)。

Desktop 先启动一次以初始化 profile，然后完全退出；使用 Desktop 自带的 dsh，将 profile 改为 `desktop`。npm CLI 不能替换 Desktop 的内核或依赖图。已有独立 Code、Agents 时，先在官方 Plugins 页面停用它们，再启用套件。安装后检查插件状态，并按官方提示重启。

升级前退出应用，安装目标版本文件，再按提示重启；卸载使用 `dsh plugin --profile web remove dsh-x-suite`。检查仍独立启用的组件。不承诺失败自动回滚。

下载后用 `SHA256SUMS` 核对包文件。macOS / Linux 使用 `shasum -a 256 -c SHA256SUMS`；Windows 使用 `Get-FileHash <文件> -Algorithm SHA256` 与清单对照。校验整份清单需要下载全部八个 tgz。

## 如何发布

发布前同步工作目录并检查待发源码。所有包版本必须与 suite 版本相同，兼容版本仍须通过现有准入，不得为发布放宽。tag 必须指向包含本流水线及完整源码的提交：

```sh
git tag plugins-v0.1.3 <待发布提交>
git push origin plugins-v0.1.3
```

推送 tag 会自动发布；要演练整条流水线而不建 tag，用 Actions 里的 `workflow_dispatch`（默认快路径，勾选 `full_qualification` 才跑完整矩阵），它永远不会创建 Release。Release 始终标记为插件预览版；仓库为公开仓库，首次发布不需要 npm token。桌面应用更新通道由独立应用仓库维护，本仓库的 tag 不参与。

本地生成及验证（输出目录必须不存在，PATH 上的 pnpm 须与 `compatibility/policy.json` 一致）：

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
node scripts/package-plugin-release.mjs --output /tmp/dsh-plugin-release --tag plugins-v0.1.3
node scripts/install-release-test-runtime.mjs /tmp/dsh-release-runtime --baseline next
node scripts/test-suite-install.mjs \
  --dsh /tmp/dsh-release-runtime/node_modules/.bin/dsh \
  --dsh-version 0.2.1-rc.2 --release-dir /tmp/dsh-plugin-release \
  --report /tmp/dsh-plugin-release/suite-install-report.json
# 第二个基线：只证明安装与启动准入，不代替完整矩阵
node scripts/install-release-test-runtime.mjs /tmp/dsh-latest-runtime --baseline latest
node scripts/check-peer-admission.mjs \
  --dsh /tmp/dsh-latest-runtime/node_modules/.bin/dsh \
  --dsh-version 0.2.0-rc.2 --release-dir /tmp/dsh-plugin-release \
  --report /tmp/admission-latest.json
```

发布脚本先打包独立插件，再只在临时目录中将 Code、Agents 加入 suite 的 `bundledDependencies`。它们的第三方依赖提升到 suite 根依赖，留给用户的平台解析，避免携带构建机器的原生二进制。源码 package.json 保留适合未来 npm 发布的精确组件依赖；不能直接拿普通 `npm pack packages/dsh-x-suite` 的结果替代 GitHub 套件产物。参考 [npm bundleDependencies](https://docs.npmjs.com/cli/configuring-npm/package-json/#bundledependencies)。

## 验证边界

Release 附带源码提交、兼容内核版本、包版本、SHA-256 / SHA-512、真实 CLI 安装报告，以及两个基线的 admission 报告。套件测试包括安装启动、单项/整套启停、独立组件混装、测试版本替换、移除及兼容拒绝；测试还断言首次安装无需查询 Code、Agents 的 registry 元数据。升级测试使用明确标记的 fixture 版本，不代表真实历史版本数据迁移。

两个基线的证据不对等：`0.2.1-rc.2` 跑完整矩阵；`0.2.0-rc.2`（npm `latest`）只跑安装、bundle 选中、Web 启动与插件 RPC，覆盖的是 peer 准入，不覆盖依赖安装脚本、Electron 与真实模型调用。`dsh-x-browser` 是实验包，默认不在 `install-plugins.mjs` 的安装集合里，也不构成 Desktop 能力证明。

全量测试通过不表示每个可选插件的 Desktop 交互已在所有平台验证。真实供应商登录、原生模型调用以及 Electron 交互由独立应用仓库或后续证明单独记录；之前免费模型请求被服务商拒绝，Google 证明未完成。安装包不包含官方 Desktop、官方内核、用户配置或凭据。
