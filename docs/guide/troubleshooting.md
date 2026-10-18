# 常见问题

## 安装被拒绝：`Plugin ... is incompatible with dsh ...`

这是**官方**的兼容检查，说明插件的 peer 范围不覆盖当前运行时。处理顺序：

1. `dsh --version` 看当前版本。
2. `npm view @deepseek-ai/dsh dist-tags` 看最新标签。
3. 二选一：把运行时升到插件支持的版本，或换一个匹配你运行时的插件版本。

不要手动改 profile 里的 `package.json` 绕过检查，也不要给自己发"版本豁免"来跳过——那只会在加载阶段变成更难查的失败。

## 装完了但界面没变化

插件 Host 代码要重启或重载后才生效：

1. 重启应用（桌面版需完全退出，不是最小化）。
2. 打开 Plugins 页面确认对应 bundle 是启用状态。
3. 如果 bundle 已启用但仍无界面，检查是否是可选 UI 位置没有挂载（例如 Stock 的底条在 `shell.bottom` 有冲突注册者时会主动退让）。

## 管理页面显示 `unaddressable`

同一个组件有多个来源（例如既装了独立 `dsh-x-code`，又装了包含它的 `dsh-x-suite`）。同版本不会双启，但不能单独管理。解决：只保留一个来源，另一个停用或移除。

## 桌面版里 `dsh plugin --profile desktop` 报错

```text
error: profile "desktop" is managed exclusively by the Electron application
```

`desktop` profile 归 Electron 应用所有。请用桌面版自带的 CLI 或它的 Plugins 页面安装，详见[桌面版](/guide/desktop)。

## 找不到 pnpm

`dsh plugin` 是 pnpm 的转发器。确保 PATH 上有 pnpm，版本与官方内核要求一致（本仓库当前使用 `11.28.5`）。`dsh` 安装插件时会在 profile 目录里运行 pnpm。

## 校验失败：`SHA256SUMS` 对不上

说明下载不完整或被改动。重新下载对应文件。注意整份清单需要**所有** tgz 都在同一目录；只想要一个包时，单独算它的哈希对照清单里的那一行。

## 想看安装到底做了什么

官方插件管理器把每次操作的日志放在 profile 下：

```text
~/.dsh/profiles/<profile>/.plugin-manager/logs/operation-*/pnpm.log
```

安装失败时 CLI 会直接打印诊断文件路径。先看 pnpm 输出，再看是不是版本、网络或磁盘问题。

## 想彻底重置某个插件的状态

插件只写自己的 profile 级目录，删掉即可回到"从未用过"的状态：

```sh
rm -rf ~/.dsh/profiles/web/.dsh-x-code
rm -rf ~/.dsh/profiles/web/.dsh-x-agents
rm -rf ~/.dsh/profiles/web/.dsh-x-stock
```

不要删除或改写官方 `sessions/`；那不是插件的数据。

## 计划文件在哪

`dsh-x-plan` 把计划、批准副本与验收结论写在官方 home：

```text
~/.dsh/plans/<session-id>/
```

它们不是会话的替代位置，也不参与官方会话索引。

## Windows 上要注意什么

- 用 PowerShell 校验哈希：`Get-FileHash 文件名 -Algorithm SHA256`，与 `SHA256SUMS` 对照。
- 路径里有空格时加引号；`dsh` 在 Windows 上通常是 `dsh.cmd`。
- 一键脚本会自行解析 `.cmd` 入口；如果手动调用，注意用 PowerShell 而不是 cmd 的旧式路径写法。

## 为什么仓库里没有桌面安装包

桌面应用、安装器与 DMG/EXE 发行属于独立应用仓库。本仓库只发插件 tgz，并保证它们能被官方 Desktop 或官方 npm CLI 加载。

## 升级后行为异常

1. 确认套件与独立组件没有混装不同版本。
2. 确认运行时版本仍被 peer 范围覆盖。
3. 清理对应插件的 profile 级状态后重试。
4. 仍复现时，带上 `dsh --version`、插件版本和 `.plugin-manager` 日志提 issue。
