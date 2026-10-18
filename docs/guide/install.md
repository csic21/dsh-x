# 快速开始

把 DSH-X 插件装进一个官方 DSH 运行时，分三步：确认内核版本、准备安装资产、用官方入口安装。

## 1. 确认官方内核

插件不是独立应用，必须先有一个官方 DSH 运行时。两种形态：

| 形态 | 怎么获得 | profile |
| --- | --- | --- |
| 桌面应用 | 从官方渠道安装并**先启动一次**，让它初始化 profile | `desktop`（由 Electron 独占） |
| npm CLI | 见下 | `web`（默认） |

用 npm 安装官方 CLI 时，注意 npm 上的标签分布：

```sh
npm view @deepseek-ai/dsh dist-tags
# latest = 0.2.0-rc.2
# next   = 0.2.1-rc.2
```

```sh
npm install --prefix ~/.local/dsh-runtime @deepseek-ai/dsh@next
~/.local/dsh-runtime/node_modules/.bin/dsh --version
```

::: warning 版本决定成败
本仓库的完整验证跑在 **0.2.1-rc.2** 上；`0.2.0-rc.2` 只验证到"安装 + 启动"。两个版本都能装，但证据强度不同，见[版本与兼容](/guide/compatibility)。
:::

`dsh plugin` 会把参数转发给 **pnpm**，所以 PATH 上要有 pnpm（本仓库当前使用 `11.28.5`）。

## 2. 准备插件资产

从 [Releases](https://github.com/csic21/dsh-x/releases) 下载整份资产到同一个目录。不要只下某一个 tgz 就去跑一键脚本——脚本需要目录里的 `build-manifest.json` 和多个 tgz。

Release 里通常有：

```text
dsh-x-suite-0.1.3.tgz          # 默认组合：Code + Agents
dsh-x-code-0.1.3.tgz
dsh-x-agents-0.1.3.tgz
dsh-x-plan-0.1.3.tgz
dsh-x-stock-0.1.3.tgz
dsh-x-chat-0.1.3.tgz
dsh-x-update-0.1.3.tgz
dsh-x-browser-0.1.3.tgz        # 实验性，默认不装
install-plugins.mjs            # 随包附带的安装脚本
SHA256SUMS / build-manifest.json / INSTALL.md
```

先校验完整性，再安装：

```sh
cd ~/Downloads/dsh-x-0.1.3
shasum -a 256 -c SHA256SUMS          # Windows: Get-FileHash 对照 SHA256SUMS
```

## 3. 安装

### 方式 A：一键脚本（推荐）

```sh
cd ~/Downloads/dsh-x-0.1.3
dsh --version                        # 先看一眼运行时
node install-plugins.mjs             # 默认 suite + plan + stock + chat + update
```

常用参数：

| 参数 | 作用 |
| --- | --- |
| `--dry-run` | 只打印将要执行的官方命令 |
| `--plugins dsh-x-suite,dsh-x-plan` | 指定安装集合（browser 需显式加入） |
| `--profile web` | 目标 profile，默认 `web` |
| `--home /path/to/dsh-home` | 官方 home，默认 `$DSH_HOME` 或 `~/.dsh` |
| `--dsh /path/to/dsh` | 官方 CLI 路径 |

脚本只做三件事：解析 tgz、调用官方 `dsh plugin add`、确认这些包确实被选中为 bundle。运行时是否兼容**由官方 CLI 判定**，脚本不自己放宽。

### 方式 B：手动 CLI

```sh
dsh plugin --profile web add ./dsh-x-suite-0.1.3.tgz --config.auto-install-peers=false
```

需要其他插件时继续追加，或一次给多个：

```sh
dsh plugin --profile web add ./dsh-x-plan-0.1.3.tgz ./dsh-x-stock-0.1.3.tgz --config.auto-install-peers=false
```

### 方式 C：官方 Plugins 页面

在 DSH 的 Plugins 页面里选择本地 tgz 安装。GUI 同样会走官方的兼容检查，被拒绝时页面会给出原因。

## 4. 验证

- 安装脚本成功时会打印 `Installed and selected: ...`，并对每个包检查是否被选为 bundle。
- GUI：打开 Plugins 页面，确认对应 bundle 处于启用状态。
- 需要重启时按官方提示重启；插件 Host 代码只有在重启或重载后才生效。

## 升级与卸载

升级：先退出应用，下载目标版本资产，按上面的方式重新安装，然后重启。不同版本不要混装（尤其套件与独立 Code/Agents）。

卸载：

```sh
dsh plugin --profile web remove dsh-x-suite
```

套件和独立组件的启用状态要分别检查——停用套件不会自动清理你另外单独启用的 Code / Agents。
