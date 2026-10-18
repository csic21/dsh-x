# DSH-X 桌面发行

`.github/workflows/desktop-package.yml` 在 GitHub Actions 中检出官方源码、编译官方 Desktop，再由本仓库的原生启动器和安装脚本组装 DSH-X DMG / EXE。外层安装器已获用户授权；官方内核源码、可执行文件和 `app.asar` 保持原样。独立插件包另见 [插件发行](plugins.md)。

当前精确目标为官方 `0.2.1-rc.2`、提交 `687f282e8625c6b8d11ff58211a90524be2e4317`。源码 SHA、npm 完整性和 CLI 兼容证据位于 `compatibility/policy.json` 与 `compatibility/evidence/rc2-suite-2026-10-18.json`。Desktop 验收以最终安装包附带的 `desktop-install-report.json` 为准，不能用 CLI 测试代替。

## 构建与组装

Actions 中手动运行 **Package desktop**，选择待发源码分支：

- `kernel_repository` 必须是 `deepseek-ai/deepseek-harness`。
- `kernel_ref` 选精确的已审查官方提交；脚本拒绝与兼容策略不符的源码或版本。
- `build_only=true` 只编译官方安装包，保留 `official-macos-arm64`、`official-windows-x64` artifact。
- `reuse_build` 可填写上述构建的 run ID；组装器核对内核提交、版本和安装包 SHA-256 后复用，避免反复编译内核。
- `distribution_target` 选择两平台或单独一平台。复用 ID 留空且 `build_only=false` 时，会先编译再组装。
- 发布前用仓库 Git 写权限创建并推送轻量标签 `desktop-v<版本>`，指向验收 run 的 `head_sha`；Actions 跨提交创建标签可能被 GitHub 权限限制。
- `release_from_run` 填写两平台均验收成功的组装 run ID，仅发布该次安装包，不重复编译。发布前再次校验标签提交、来源、随包插件激活报告与安装包 SHA-256，生成该标签的 prerelease。

macOS 使用 Apple Silicon runner 与官方 `package:desktop:mac:arm64:unsigned`；Windows 使用 x64 runner 与 `package:desktop:win:x64:unsigned`。Linux 不生成 Desktop 安装包，macOS Intel 尚未加入本矩阵。依赖固定到锁文件及官方 pnpm 版本。

外层 macOS DMG 包含 `DSH-X.app` 与安装说明，其中原样嵌套官方应用。外层启动器用 C 编译，单独 ad-hoc 签名，不重签内嵌应用。Windows 安装器通过固定版本 NSIS 生成，含原样官方应用文件和 C# 启动器，使用当前用户安装范围，不要求管理员权限。已运行的安装目录会阻止覆盖；不强制停止用户应用。Windows 卸载只移除自有文件，保留用户数据。

## 首次启动与插件

用户从 DMG 将 `DSH-X.app` 拖到 Applications，或运行 EXE。始终使用 **DSH-X** 入口启动。

首次运行会打开官方应用初始化独立 profile。窗口出现后，用户必须完全退出（macOS：Command+Q；Windows：托盘菜单退出）。安装器随后调用内嵌官方 Desktop CLI 分别安装 Code、Agents、Chat、Plan、Stocks、Browser、Update，再重新打开应用。桌面版直接选择七个独立 bundle，不使用嵌套 suite；Web 插件套件仍保留独立发行路径。初次安装仍需联网下载第三方依赖，不需要用户手动安装 tgz。

用户数据根为 `~/.dsh-x/desktop-preview`，不导入原有官方账号、profile 或凭据。插件 tarball 在该目录内按发行身份保留，避免替换应用目录后破坏 profile 锁文件的本地安装来源。安装后仍由官方 Plugins 页面管理插件；同一发行版再次启动不会重新启用用户停用或移除的组件。失败不会写成功标记，不承诺失败自动回滚；诊断记录在该独立目录的 `distribution-install.log`。

## 产物与验证

成功组装的 artifact 名为 `dsh-x-macos-arm64` / `dsh-x-windows-x64`，包含：

- DMG 或 EXE；
- `distribution.json`：内核提交、内核版本、插件提交、包版本与校验值；
- `SHA256SUMS` 与 `INSTALL.txt`；
- `desktop-install-report.json`：最终容器的实际安装与插件加载结果。

验证会从最终 DMG 重新提取应用，或静默安装最终 EXE 到临时目录，然后使用真实 Electron 初始化 profile、经官方 CLI 安装打包的插件，并检查真实 Host 中随包插件与客户端模块各加载一次。test-only probe 仅装入临时 profile，不进入发行文件。供应商登录、真实模型执行、所有 UI 操作和真实历史数据迁移另行验收。

两平台最终验收已通过：[run 39112220220](https://github.com/csic21/dsh-x/actions/runs/39112220220)，安装包来源提交 `090a372d83345063aa25db671a8d1f20d3d3c8c4`；报告保存在 `compatibility/evidence/rc2-desktop-*-2026-10-18.json`。此结论限于当时包内的六个独立插件；新增 Update 插件后必须重新跑两平台安装与激活验收，不能沿用该结论。嵌套 suite 的 Windows Desktop 激活未通过，不能套用 CLI / Web 验收结果。

## 更新器与内核边界

`dsh-x-update` 随 Desktop 一起安装，从公开 GitHub Releases 读取 `desktop-v*` 和 `plugins-v*`，并明确区分两条路径：

- **插件更新**：`build-manifest.json` 的 `runtime` 必须等于当前内核。下载的 tgz 经 SHA-256 / SHA-512 校验后写入 `~/.dsh-x/desktop-preview/updates/pending-plugins.json`，下次启动由 `bootstrap.mjs` 在应用启动前调用官方 CLI 应用。
- **应用更新**：新的 `desktop-v*` 版本或不同的 `kernelVersion` 都只能走整包更新。下载 DMG/EXE 并按发布清单的 SHA-256 校验；退出应用后由分离的 helper 替换应用并重启。应用更新是更新内核的唯一路径。
- **不混用通道**：检查使用 `releases.atom`，不需要 GitHub API token；下载只接受 `github.com/<repo>/releases/download/...`。官方 Electron 更新通道仍保持关闭，`distribution.json` 的 `autoUpdate` 仍为 `false`。
- **未签名警告**：当前预览包没有 Developer ID、公证或 Windows 代码签名。自动应用更新只验证发布清单中的 SHA-256，不验证签名；在补齐签名、公证和真实旧版→新版升级验证前，不能把这条路径称为可信自更新。

状态、下载暂存和 helper 日志都在 `~/.dsh-x/desktop-preview/updates/`；用户数据不随应用替换而删除。

## 签名与后续自更新

这阶段生成未签名预览包：macOS 无 Developer ID、公证，Windows 无发行代码签名。Mac 外层 ad-hoc 签名只用于本地完整性，不是可信发行签名。文件名显式带 `preview`，不能当作正式自更新包。

官方 Electron 自更新源仍未连接：macOS 未签名路径关闭更新，Windows 使用保留的 `.invalid` 策略地址。DSH-X 更新器是独立的 GitHub Releases 客户端，不复用官方更新通道。后续仍需要独立发行身份、签名、公证和旧版到新版的真实升级验证；不能把官方 production 更新源直接当成我们的更新源。

内嵌应用仍显示官方品牌，协议唤起与全局 `dsh` 命令尚未作为 DSH-X 独立入口验收。用户应通过 DSH-X 启动器进入独立 profile。官方说明：[打包](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/desktop/packaging/README.zh.md)、[更新发布](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/desktop/publishing/README.zh.md)。
