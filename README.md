# dsh-x

DSH-X 是运行在官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上的插件库。仓库只包含插件源码、本机链接/验证脚本和 GitHub Pages 市场索引；官方内核不进入这个 git，桌面应用、安装器、bootstrap 和 DMG/EXE 发行也不在这里。

## 插件

| 包 | 作用 | 状态 |
| --- | --- | --- |
| `dsh-x-code` | 只读源码审查：文件树、源码/差异、快照审查与 findings；审查使用当前配置的 DSH 模型，不执行工具或测试 | 可用 |
| `dsh-x-finance` | A 股自选、市场全景、全球指数、量化分析、热点题材筛选、独立详情页、底部固定栏与黄金面板；另含只读 Finnhub 报价工具 | 可用，行情源需显式开启 |
| `dsh-x-browser` | 实验性浏览器工具：Desktop 内嵌 tab，或经 agent-browser 驱动外部 Chrome（CDP）；按轮授权与接管 | 实验性，默认不装 |
| `dsh-x-delegate` | 把一个任务委派给本机 Codex、Grok 或 OpenCode，并可按次选择模型 | 可用；真实 CLI 回合不在仓库内验证 |
| `dsh-x-pet` | 窗口里的 Codex 兼容桌宠：同一套精灵表与动画时序，读取 `~/.codex/pets` 里的本机桌宠 | 可用；打包应用表现不在仓库内验证 |
| `dsh-x-ui` | 玻璃界面：把面板、侧栏与浮层换成 liquid glass 材质，带流动底色与浮层模糊；其余插件的界面会一起跟随 | 可用；真实浏览器观感不在仓库内验证 |

Code 不再包含原生 Agent 审查或修复。需要修改源码时，直接在对话里让主模型修改，然后回来复审同一批文件；重新审查会建立新的证据，旧 findings 保留为历史。

## 安装

推荐使用官方 Plugins 页面里的市场索引：

1. 打开 **Plugins → Discover → Index sources**，添加
   `https://csic21.github.io/dsh-x/market-index.json`；
2. 在 Discover 里选择 Code、Stocks 或 AI Browser，按官方流程安装。

索引里的每个版本都钉在发布 commit 上，安装源是仓库内的包目录，不依赖 npm 发布。也可以在官方 CLI 里手动安装（commit 与包路径以 Discover 条目为准）：

```sh
dsh --version
dsh plugin --profile web add \
  "git+https://github.com/csic21/dsh-x.git#<40位commit>&path:/packages/dsh-x-code" \
  --config.auto-install-peers=false
```

AI Browser 只面向 Desktop：先启动一次 Desktop 初始化 profile，完全退出，再使用 Desktop 自带的 Plugins 页面或其 CLI。npm 版 CLI 不替换 Desktop 的依赖图。

## 更新

`plugins-v*` tag 会触发 GitHub Pages 重新生成市场索引。五个插件各自升版本；没改的插件不会出现新版本：

- 新版本出现在 Discover 里，状态变为 **Update available**；
- 官方对第三方插件没有一键升级，升级方式是 **卸载后安装新版本**：
  `dsh plugin --profile web remove dsh-x-code`，再安装 Discover 中的新条目。
- 索引会按 `engines.dsh` 计算兼容性；运行时不在范围内时，官方安装入口会拒绝，这是预期行为。

安装、更新和启用都走官方 Plugins 页面或 `dsh plugin`；本仓库不下载、不安装、不写 `$DSH_HOME` 之外的位置。

## 文档

在线文档：<https://csic21.github.io/dsh-x/>

- [快速开始](https://csic21.github.io/dsh-x/guide/install)
- [插件一览](https://csic21.github.io/dsh-x/guide/plugins)
- [版本与兼容](https://csic21.github.io/dsh-x/guide/compatibility)
- [常见问题](https://csic21.github.io/dsh-x/guide/troubleshooting)
- [发布流程](https://csic21.github.io/dsh-x/dev/release)

## 本仓库

```text
dsh-x/
  packages/<包名>/              插件源码。一个目录一个包，目录名等于包名
    src/                        TypeScript 源码；src/client/ 是浏览器侧源码
    lib/                        构建产物（交付包入库）：宿主 JS、.d.ts、client.js
    test/                       TypeScript 测试，直接跑 src
  compatibility/                官方版本准入与兼容检查
  docs/                         文档站点（VitePress）与市场索引
  scripts/                      本机构建、链接、市场索引生成
  test/                         跨包与官方运行时集成测试
  package.json                  私有根，不声明 packageManager
  pnpm-workspace.yaml           只收录 packages/*
```

本仓库不需要内核目录。只有在本机改插件、要加载官方内核时，才在旁边放一份官方克隆，把路径写进本机的 `kernel.local.json`（从样例复制，不提交）。

## 官方默认位置与存储边界

插件完全使用官方默认位置，不建立自己的用户目录：

| 位置 | 用途 |
| --- | --- |
| `~/.dsh` 或官方 `$DSH_HOME` | 官方 home：凭据、profile、会话、官方 storages、用户指令 |
| 官方 `profileContext.dir` | 当前 profile 的 `package.json`、`node_modules`、`cordis.patch.yml`；插件的 profile 级状态放在这里 |
| 官方 Electron userData | Desktop 自己的浏览器数据；插件不重定向 |

- 不创建 `~/.dsh-x` 或其他独立 home。
- 不设置、不改写 `DSH_HOME` / `DSH_AGENTS_HOME` 来把官方数据引到别处。
- 不搬动、重写、归档或重新索引官方 `sessions/`；会话位置与格式完全由官方内核决定。
- Code 的审查记录放在官方 profile 下的 `.dsh-x-code`；Finance 的自选与配置放在 `.dsh-x-finance`（原 `.dsh-x-stock` 会被一次性继承）；Pet 的桌宠选择与位置放在 `.dsh-x-pet`；UI 的材质选择放在 `.dsh-x-ui`。它们不写官方 `sessions/`，也不含凭据。
- Pet 只读 `${CODEX_HOME:-~/.codex}/pets`，以复用用户自己的 Codex 桌宠；它不写 Codex 的目录。

## 版本口径

- **加载准入**：各包 `engines.dsh` 与官方 `@deepseek-ai/dsh*` peer 共用同一个范围（`^0.2.0-rc.2 || ^0.2.1-rc.2`），决定官方 CLI 允不允许安装、Host 允不允许加载。官方先看 `engines.dsh`，有就忽略 peer，所以两者必须一致。
- **发布基线**：`compatibility/policy.json` 的 `baseline` 记录跑过完整测试的运行时（`0.2.1-rc.3`）。
- **市场兼容性**：Discover 用 `engines.dsh` 计算每个版本是否兼容；不兼容的版本不会给出可安装的默认项。

细节与证据范围见 [兼容说明](compatibility/README.md)。

## 开发

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
```

本机链接当前 checkout 到官方 profile：

```sh
node scripts/link-plugins.mjs --profile web --home "$HOME/.dsh"
```

生成市场索引（Pages 工作流会自动执行）：

```sh
node scripts/generate-market-index.mjs --output docs/public/market-index.json
```

发布流程见 [docs/dev/release.md](docs/dev/release.md)；脚本清单见 [scripts/README.md](scripts/README.md)。
