# 常见问题

## 安装被拒绝：`Plugin ... is incompatible with dsh ...`

这是**官方**的兼容检查，说明插件的 peer 范围不覆盖当前运行时。处理顺序：

1. `dsh --version` 看当前版本。
2. `npm view @deepseek-ai/dsh dist-tags` 看最新标签。
3. 二选一：把运行时升到插件支持的版本，或换一个匹配你运行时的插件版本。

不要手动改 profile 里的 `package.json` 绕过检查，也不要给自己发“版本豁免”来跳过——那只会在加载阶段变成更难查的失败。

## Discover 里看不到插件

1. 确认已经添加索引 `https://csic21.github.io/dsh-x/market-index.json`。
2. 点 Discover 的刷新按钮；索引有缓存，`plugins-v*` 新 tag 后需要重新读取。
3. 打开索引 URL 看是否返回 JSON；Pages 部署需要几分钟。
4. 如果索引能打开但没有任何可安装版本，通常是 `engines.dsh` 与当前运行时不匹配。

索引被重定向或需要登录时，官方会拒绝读取；请使用返回 200 的最终 URL。

## 显示 Update available，但没有升级按钮

官方对**第三方**插件没有一键升级，只显示状态。升级方式是卸载后安装新版本：

```sh
dsh plugin --profile web remove dsh-x-code
# 然后在 Discover 里安装新条目
```

Official 条目才有一键 Update；DSH-X 走自定义索引，因此保持“卸载再装”。

## 装完了但界面没变化

插件 Host 代码要重启或重载后才生效：

1. 重启应用（桌面版需完全退出，不是最小化）。
2. 打开 Plugins 页面确认对应 bundle 是启用状态。
3. 如果 bundle 已启用但仍无界面，检查是否是可选 UI 位置没有挂载（例如 Stock 的底条在 `shell.bottom` 有冲突注册者时会主动退让）。

## 管理页面显示 `unaddressable`

同一个组件有多个来源（例如手动装了 Git 目标，又保留了一份本地 `link:`）。同版本不会双启，但不能单独管理。解决：只保留一个来源，另一个停用或移除。

## 桌面版里 `dsh plugin --profile desktop` 报错

```text
error: profile "desktop" is managed exclusively by the Electron application
```

`desktop` profile 归 Electron 应用所有。请用桌面版自带的 CLI 或它的 Plugins 页面安装，详见[桌面版](/guide/desktop)。

## 找不到 pnpm

`dsh plugin` 是 pnpm 的转发器。确保 PATH 上有 pnpm，版本与官方内核要求一致（本仓库使用 `11.28.5`）。`dsh` 安装插件时会在 profile 目录里运行 pnpm。

## Git 安装很慢或失败

市场索引的安装源是 `git+https://github.com/csic21/dsh-x.git#<commit>&path:/packages/...`。第一次安装会拉取仓库，速度取决于网络与 GitHub 可达性。

- 确认能访问 GitHub；私有网络需要自行配置 Git 凭据。
- 不要手改 commit 或包路径；以 Discover 条目显示的参数为准。
- 安装失败时官方会恢复 profile 的 `package.json` 与 lockfile，并保留 `.plugin-manager/logs` 供排查。

## 想看安装到底做了什么

官方插件管理器把每次操作的日志放在 profile 下：

```text
~/.dsh/profiles/<profile>/.plugin-manager/logs/operation-*/pnpm.log
```

安装失败时 CLI 会直接打印诊断文件路径。先看 pnpm 输出，再看是不是版本、网络或磁盘问题。

## 想彻底重置某个插件的状态

插件只写自己的 profile 级目录，删掉即可回到“从未用过”的状态：

```sh
rm -rf ~/.dsh/profiles/web/.dsh-x-code
rm -rf ~/.dsh/profiles/web/.dsh-x-finance
```

不要删除或改写官方 `sessions/`；那不是插件的数据。

## 为什么仓库里没有桌面安装包

桌面应用、安装器与 DMG/EXE 发行属于独立应用仓库。本仓库只发插件与市场索引，并保证它们能被官方 Desktop 或官方 npm CLI 加载。

## 升级后行为异常

1. 确认没有同时保留两个来源或两个版本。
2. 确认运行时版本仍被 peer 范围覆盖。
3. 清理对应插件的 profile 级状态后重试。
4. 仍复现时，带上 `dsh --version`、插件版本和 `.plugin-manager` 日志提 issue。
