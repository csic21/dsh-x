# 官方 DSH 更新与扩展兼容性

官方 DSH 与 DSH-X 扩展独立更新。这里负责发现上游、保留精确证据和发出失败信号，不负责自动修改插件、升级用户安装、推送、合并或发布。

## 当前状态与启用条件

- 配置的已验证基线是 `@deepseek-ai/dsh@0.2.1-rc.2`；审查过的官方源码快照提交（`inspectedSourceCommit`）与 npm SHA-512 位于 `policy.json`；该快照提交不是 npm tarball 构建来源的证明。基线不会随 npm 的 `latest` 标签漂移。
- `.github/workflows/upstream-compatibility.yml` 每日检查一次（05:19 UTC），也支持手动运行。定时任务默认只找稳定版；预发布版必须在这一次手动运行中明确勾选 `allow_prerelease`。
- **GitHub 只运行默认分支上的定时 workflow。** 只把这个文件提交到当前私有工作分支，并不代表监控已启用。需要按仓库审批流程把 workflow 放到默认分支、启用 Actions，并确认第一次真实运行和报告。手动运行同样受 GitHub 的 workflow 可见性与仓库设置限制。
- 本地单元测试、静态 YAML 检查或本地旧运行时测试，不能代替一次真实候选 CI。未实际执行的阶段必须保持 `not-run` / `needs-qualification`。

## 加载准入与发布资格是两件事

官方在 composition 边界只读插件 `peerDependencies` 中 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 的范围，判定时使用 semver 的 `includePrerelease`；它**不读 `engines.dsh`**。本仓库因此分开两个概念：

| 概念 | 声明位置 | 当前值 | 含义 |
| --- | --- | --- | --- |
| 加载准入 | `policy.json` → `supportedPeerRange`，各包 DSH peer 必须逐字一致 | `^0.2.0-rc.2 \|\| ^0.2.1-rc.2` | 官方 CLI 允许安装、Host 允许加载的运行时范围；`test/peer-ranges.test.js` 守住一致性 |
| 发布资格 | 各包 `engines.dsh` | `0.2.1-rc.2`（精确） | 本次发布用哪个运行时做完整矩阵验证；`test-suite-install.mjs` 只接受它 |

联合范围而不是单个 `^0.2.0-rc.2`：原生 semver 对预发布版本有一条 tuple 规则，单个 `^0.2.0-rc.2` 在**默认**语义下只会选中 0.2.0-rc.2，pnpm 会把 workspace 的开发解析降级；写成联合后默认与 `includePrerelease` 两种语义都准入两个基线，解析仍取较高的 0.2.1-rc.2。

精确 pin 的 peer 会让用户在 npm `latest`（0.2.0-rc.2）上**安装即被拒**：官方会报 `Plugin … is incompatible with dsh 0.2.0-rc.2`。范围放宽后，这两个基线都能装；`additionalBaselines` 记录声明的额外基线，以及它们实际验证到什么程度。

`additionalBaselines` 当前只有 npm `latest` = `0.2.0-rc.2`，状态 `peer-admission-smoke`，证据来自 `scripts/check-peer-admission.mjs`：用固定完整性下载的真实运行时，通过官方 CLI 安装真实 tgz、选中为 bundle、启动官方 Web Host 并调用插件 RPC。它**不**覆盖 Electron、原生供应商登录、真实模型调用，也不覆盖依赖安装脚本；完整矩阵仍只在基线运行时上跑。

## 两条独立证据链

1. **发布发现与准入**：只从官方 npm registry 的 `@deepseek-ai/dsh` 元数据选择精确 SemVer。忽略可变 `latest` 标签；稳定版默认按 SemVer 排序。记录版本、发布日期、固定官方 tarball URL、SHA-512 及 registry 声明的 `gitHead`（若有，独立记录为 `registryGitHead`，不假定等于源码快照）；基线还必须匹配已提交的完整性值。没有稳定版时只运行基线控制组。更旧的稳定版不会被误报为新更新。
2. **真正运行的检查**：校验实际 tarball 字节，安装这个本地 tarball，核对安装锁与 CLI 输出的精确版本，读取真实 Web profile 配置，再启动官方 Web 进程并请求经过认证的 HTML。这不是用旧依赖的测试 fixture 冒充候选运行时。

所有 `packages/dsh-x-*` 的清单都参与精确 `engines.dsh` 准入，包括目录存在时的可选 Browser。必需清单缺失也会失败。范围、通配符、漏填版本或其他精确版本都不会放行。候选与基线不同、但插件仍固定在基线时：

- 可以保留候选官方运行时的安装/启动诊断
- 不会把扩展强行装到不接受它们的运行时
- 不会重写清单、放宽 engines 或设置兼容性豁免
- 结果是失败的 `needs-qualification`，等待针对新版本的实际适配与审核

## Suite 的真实安装检查

精确版本准入通过后，检查器才构建本仓库的扩展，调用：

```sh
node scripts/test-suite-install.mjs \
  --dsh /absolute/path/to/isolated/node_modules/.bin/dsh \
  --dsh-version 0.2.1-rc.2 \
  --report /output/suite-install-report.json
```

检查器要求退出成功且报告明确包含真实的打包安装、官方每插件与整套启停、混合安装无重复、版本替换、状态保留、不兼容版本拒绝、独立使用与卸载验证。仅 exit 0、声明、缺失报告、缺失 harness 或只跑 fixture 都不算通过。报告中版本替换的测试包是明确标记的 fixture，不是发布版本。

Suite harness 使用该次安装的官方 CLI、包管理器、本地产生的真实 tarball 与 Web Host。它的证据范围是开发者套装 Code + Agents；其他可选插件只做 manifest 准入，不会因这份报告被宣称完成了功能验证。以下仍需独立资格验证：

- Electron / macOS / Windows Desktop 实机行为（桌面应用与安装器不在本仓库）
- 浏览器页面渲染、交互与 Browser 的实际原生能力
- 原生供应商登录、真实模型执行与授权流程
- 真正的上游版本迁移及用户数据兼容性

本 workflow 不把仓库中依赖旧版 DSH 的普通集成 fixture 当成新候选验证，也不会声称它们覆盖以上场景。

## 安全边界

- GitHub token 只有 `contents: read`；checkout 禁止持久保存 credentials。
- 发现阶段不下载执行包。执行阶段导出 `git archive`，不会把 `.git`、主机 HOME、Docker socket 或 action/service token 交给候选进程；发现敏感本机配置文件被跟踪时拒绝导出。
- 候选代码只运行在一次性的非 root Docker 容器内：只读根文件系统、移除 capabilities、禁止提权、进程/内存限制、临时 HOME/DSH_HOME/cache。宿主仅挂载无 credentials 的输入与报告目录。容器销毁后不保留用户配置。
- 所有下载包的 lifecycle scripts 都禁用。仓库自身已审查的 `pnpm run build` 是显式构建步骤，不给候选开启 install/postinstall/prepare。pnpm 使用源码快照声明的精确 `11.28.5`，安装在同一临时目录内，不安装到用户 home 或全局目录。
- 网络仅用于公开依赖下载和测试的本地 HTTP，但 Docker 没有强制出站域名防火墙。它不是离线容器，也不是对恶意内核的完整证明。不要把 secrets 加进这个 job 或这些挂载。
- SHA-512 证明这次执行的字节与固定发布描述一致，不等于上游签名验证。根运行时及其本次解析出的传递依赖版本/完整性保存在 `runtime-package-lock.json`；传递依赖范围以后仍可能改变，因此每次运行都保留锁的 SHA-256。
- 不记录 Web 登录引导 token、环境变量或原始启动日志。报告和依赖锁作为 Actions artifacts 保留 30 天；失败也上传已有证据。

## 结果含义

| 状态 | 退出码 | 含义 |
| --- | --- | --- |
| `baseline-checks-passed` | 0 | 当前基线的已列检查通过，不扩展覆盖范围 |
| `needs-qualification` | 2 | 精确准入不通过，或所需阶段没有完成 |
| `candidate-checks-passed-needs-review` | 2 | 候选已列检查通过，仍需人工审核和独立场景验证 |
| `checks-failed` | 1 | 下载、完整性、安装、启动或 harness 出错 |

新候选永远不会自动变成基线，哪怕已列检查通过。更新 engines 与 `policy.json` 必须在单独审查的更改中完成，并附上实际运行证据。官方应用可以独立发布新版；本仓库只在验证完成后宣布相应扩展版本适配。

## 本地检查与只读发现

```sh
node --test test/upstream-compatibility.test.js
node scripts/check-upstream-compatibility.mjs discover --report /tmp/dsh-upstream-discovery.json
node scripts/check-upstream-compatibility.mjs discover \
  --version 0.2.1-rc.2 --allow-prerelease \
  --report /tmp/dsh-upstream-discovery.json
```

发现命令只读取公开元数据，不执行候选包。`qualify` 必须使用 workflow 定义的无凭据 Docker 边界；它会拒绝普通直接运行。环境变量标记只是防误操作，不能替代容器隔离。不要在包含凭据的工作容器中手动伪造该标记。
