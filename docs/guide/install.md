# 快速开始

把 DSH-X 插件装进一个官方 DSH 运行时，分三步：确认内核版本、添加市场索引、用官方入口安装。

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
# next   = 0.2.1-rc.3
```

```sh
npm install --prefix ~/.local/dsh-runtime @deepseek-ai/dsh@next
~/.local/dsh-runtime/node_modules/.bin/dsh --version
```

::: warning 版本决定成败
本仓库的完整验证跑在 **0.2.1-rc.3** 上；`0.2.1-rc.2` 是上一基线，`0.2.0-rc.2` 只做过安装与启动冒烟。三个版本都能装，但证据强度不同，见[版本与兼容](/guide/compatibility)。
:::

`dsh plugin` 会把参数转发给 **pnpm**，所以 PATH 上要有 pnpm（本仓库使用 `11.28.5`）。

## 2. 添加市场索引

打开 **Plugins → Discover → Index sources**，添加：

```text
https://csic21.github.io/dsh-x/market-index.json
```

Discover 会读取索引、按每个版本的 `engines.dsh` 计算兼容性（官方判定：有 `engines.dsh` 就只看它），并把可安装的版本列出来。索引来自 GitHub Pages；刷新页面或点 Discover 的刷新按钮即可重新读取。

## 3. 安装

在 Discover 里选择 Code、Stocks 或 AI Browser，按官方确认流程安装。安装源是 commit 钉死的 Git 目录，不需要 npm 发布。

也可以手动调用官方 CLI。commit 与包路径直接复制 Discover 条目里的安装参数，不要自己猜：

```sh
dsh --version
dsh plugin --profile web add \
  "git+https://github.com/csic21/dsh-x.git#<40位commit>&path:/packages/dsh-x-code" \
  --config.auto-install-peers=false
```

Desktop 的 `desktop` profile 由 Electron 独占：先启动一次 Desktop，完全退出，再用 Desktop 自带的 Plugins 页面或其 CLI 安装；详见[桌面版](/guide/desktop)。

## 4. 验证

- Discover 或 Installed 页面显示对应 bundle 已安装并启用。
- 需要重启时按官方提示重启；插件 Host 代码只有在重启或重载后才生效。
- Code 打开后会先显示当前会话的工作区；Stocks 需要先配置行情源；AI Browser 只在 Desktop 出现。

## 更新与卸载

发布新 `plugins-v*` tag 后，Pages 会重新生成索引。Discover 显示 **Update available** 时，官方对第三方插件的升级方式是**卸载后安装新版本**：

```sh
dsh plugin --profile web remove dsh-x-code
# 然后在 Discover 里安装新版本
```

不同版本不要混装。卸载：

```sh
dsh plugin --profile web remove dsh-x-code
```

Code 与 Finance 的 profile 级状态分别在 `.dsh-x-code`、`.dsh-x-finance`（旧的 `.dsh-x-stock` 会在首次启动时被继承），卸载不会自动删除；需要重置时见[常见问题](/guide/troubleshooting)。
