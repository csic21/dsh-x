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

macOS 使用 Apple Silicon runner 与官方 `package:desktop:mac:arm64:unsigned`；Windows 使用 x64 runner 与 `package:desktop:win:x64:unsigned`。Linux 不生成 Desktop 安装包，macOS Intel 尚未加入本矩阵。依赖固定到锁文件及官方 pnpm 版本。

外层 macOS DMG 包含 `DSH-X.app` 与安装说明，其中原样嵌套官方应用。外层启动器用 C 编译，单独 ad-hoc 签名，不重签内嵌应用。Windows 安装器通过固定版本 NSIS 生成，含原样官方应用文件和 C# 启动器，使用当前用户安装范围，不要求管理员权限。已运行的安装目录会阻止覆盖；不强制停止用户应用。Windows 卸载只移除自有文件，保留用户数据。

## 首次启动与插件

用户从 DMG 将 `DSH-X.app` 拖到 Applications，或运行 EXE。始终使用 **DSH-X** 入口启动。

首次运行会打开官方应用初始化独立 profile。窗口出现后，用户必须完全退出（macOS：Command+Q；Windows：托盘菜单退出）。安装器随后调用内嵌官方 Desktop CLI 安装 suite、Chat、Plan、Stocks、Browser，再重新打开应用；suite 已携带 Code、Agents。初次安装仍需联网下载第三方依赖，不需要用户手动安装 tgz。

用户数据根为 `~/.dsh-x/desktop-preview`，不导入原有官方账号、profile 或凭据。插件 tarball 在该目录内按发行身份保留，避免替换应用目录后破坏 profile 锁文件的本地安装来源。安装后仍由官方 Plugins 页面管理插件；同一发行版再次启动不会重新启用用户停用或移除的组件。失败不会写成功标记，不承诺失败自动回滚；诊断记录在该独立目录的 `distribution-install.log`。

## 产物与验证

成功组装的 artifact 名为 `dsh-x-macos-arm64` / `dsh-x-windows-x64`，包含：

- DMG 或 EXE；
- `distribution.json`：内核提交、内核版本、插件提交、包版本与校验值；
- `SHA256SUMS` 与 `INSTALL.txt`；
- `desktop-install-report.json`：最终容器的实际安装与插件加载结果。

验证会从最终 DMG 重新提取应用，或静默安装最终 EXE 到临时目录，然后使用真实 Electron 初始化 profile、经官方 CLI 安装打包的插件，并检查真实 Host 中六个插件与六个客户端模块各加载一次。test-only probe 仅装入临时 profile，不进入发行文件。供应商登录、真实模型执行、所有 UI 操作和真实历史数据迁移另行验收。

## 签名与后续自更新

这阶段生成未签名预览包：macOS 无 Developer ID、公证，Windows 无发行代码签名。Mac 外层 ad-hoc 签名只用于本地完整性，不是可信发行签名。文件名显式带 `preview`，不能当作正式自更新包。

未连接自更新源。官方 Mac 未签名路径关闭更新；Windows 使用保留的 `.invalid` 策略地址，不能提供真实更新决策。后续需要我们的 HTTPS 更新源、独立更新身份、发行签名和旧版到新版的真实升级验证。不能把官方 production 更新源直接当成我们的更新源。

内嵌应用仍显示官方品牌，协议唤起与全局 `dsh` 命令尚未作为 DSH-X 独立入口验收。用户应通过 DSH-X 启动器进入独立 profile。官方说明：[打包](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/desktop/packaging/README.zh.md)、[更新发布](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/desktop/publishing/README.zh.md)。
