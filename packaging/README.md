# 桌面打包

安装包由官方内核的 Desktop 打包命令产生。本仓库不另写一套 Electron 壳，也不包含内核源码。GitHub Actions 在运行时检出 `kernel_ref`，在那份临时目录里打包，产物留成 artifact。要跟最新内核，改这次运行的 ref。

## 平台

官方当前的发布目标是三个，Linux 不是 Desktop 的发布目标。

| 目标 | 官方命令 | 本仓库的 Action |
|---|---|---|
| macOS Apple Silicon | `pnpm run package:desktop:mac:arm64:unsigned` | `macos-14` |
| macOS Intel | `pnpm run package:desktop:mac:x64:unsigned` | 先不做。需要 Intel 机器，或在 Apple Silicon 上用 Rosetta。GitHub 托管的 macOS runner 是 arm64，这条还没验证 |
| Windows x64 | `pnpm run package:desktop:win:x64:unsigned` | `windows-2022` |
| Linux | 无 | 不生成安装包 |

macOS arm64 必须在 Apple Silicon 上打包。Windows x64 必须在 Windows x64 上打包。不能在 Linux runner 上交叉编译出官方安装包。

## 签名

这条 Action 只打未签名的内部包。

- macOS 未签名命令不读 `.env.macos`，不做 Developer ID 签名，也不做公证。下载后 Gatekeeper 会拦，需要在系统设置里放行。
- Windows 未签名命令会读 `apps/desktop/.env.windows`，要求应用 ID 和强制更新策略里的 HTTPS 来源。不需要 EV 证书。SmartScreen 会对未签名安装包报警。
- 公证和 Windows EV 签名是另一条流水线，用本机或自托管 runner 上的证书。上游自己的打包 workflow 也是自托管机器，不在 GitHub 托管 runner 上签名。

## 插件还不会进安装包

开发时插件用 `link:` 指到本机目录。这个路径在别人的电脑上不存在，也不能写进安装包。

官方安装包把内置 bundle 放在应用自己的 `app.asar/dsh` 里。外部插件装在用户 home 的 `profiles/desktop`。上游没有一个可以让我们把 `packages/` 塞进安装包的固定入口。

所以现在的 Action 只打包指定提交上的官方 Desktop，并在 artifact 里放一份 `build-manifest.json`，记下内核提交和本仓库提交。等插件要随安装包分发时，再加一步把插件文件放进安装包，并在第一次启动时用 Desktop 自己的命令装进 profile。那一步不能用 `link:`。

## 怎么跑

Actions 里手动运行 **Package desktop**。`kernel_ref` 填 `deepseek-ai/deepseek-harness` 的分支、tag 或提交。没有 push 触发，避免每次提交都去编三个小时。

Windows 任务还要在仓库变量里准备：

- `DSH_DESKTOP_APP_ID`
- `DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN`，必须是 `https://` 开头

缺了 Windows 任务会在写 `.env.windows` 之前停下。macOS arm64 不需要这两项。

产物在 Actions 的 artifact 里，保留 14 天。这不是 GitHub Release。以后要挂到 Release，单独加发布 workflow，不要和打包混在一起。
