# dsh-x

DSH-X 是运行在官方 DeepSeek Harness 上的插件库。它只包含插件源码、本机链接/验证脚本和插件 tgz 发布流水线；官方内核不进入这个 git，桌面应用、安装器、bootstrap 和 DMG/EXE 发行也不在这个仓库。

- 默认组合：`dsh-x-suite`，精确依赖 Code + Agents。启用入口不自动初始化原生账号、准备模型目录或执行任务。
- 可选独立功能：Chat、Plan、Stocks、Browser、Update。
- 插件通过官方 Plugins 页面或官方 `dsh plugin` 安装，运行在官方提供的 profile 中。
- 第一条交付路径：GitHub Release 的预构建插件 tgz + 官方 Plugins 管理器。套件随包携带 Code、Agents，不依赖它们已发布到 npm；安装及发布方法见 [插件发行](packaging/plugins.md)。源码存在不表示已有成功发布的 Release。

> 桌面应用已与插件库分割。本仓库不再生成 DMG/EXE、不携带启动器，也不包含应用更新 helper。桌面发行如果需要，应放在独立的应用仓库；本仓库只保证插件能被官方 Desktop 或官方 npm CLI 加载。

## 文档

在线文档：<https://csic21.github.io/dsh-x/>。源码在 `docs/`（独立 npm 工程，不参与插件 workspace），由 `.github/workflows/docs-pages.yml` 发布到 GitHub Pages。

- [快速开始](https://csic21.github.io/dsh-x/guide/install)：装内核、装插件、验证
- [插件一览](https://csic21.github.io/dsh-x/guide/plugins)：八个包各自能做什么
- [版本与兼容](https://csic21.github.io/dsh-x/guide/compatibility)：peer 范围与两个基线的证据边界
- [常见问题](https://csic21.github.io/dsh-x/guide/troubleshooting)：安装被拒、装完没反应

## 本仓库

```text
dsh-x/
  packages/<包名>/              插件源码。一个目录一个包，目录名等于包名
                                 suite、code、agents、plan、stock、chat、browser、update
    src/                        TypeScript 源码；src/client/ 是浏览器侧源码
    lib/                        构建产物（交付包入库）：宿主 JS、.d.ts、client.js
    test/                       TypeScript 测试，直接跑 src
    tsconfig.json               类型检查（含测试，不产出）
    tsconfig.build.json         宿主构建（tsc 产出 lib/，排除 src/client）
  compatibility/                官方版本准入与插件兼容检查
  docs/                         文档站点（VitePress，前端教程与开发指南）
  packaging/plugins.md          插件 tgz 的发布与安装
  scripts/                      本机 link、验证脚本与插件打包
  test/                         跨包与官方运行时集成测试
  kernel.local.example.json     本机调试官方内核时的路径样例
  package.json                  私有根，不声明 packageManager
  pnpm-workspace.yaml           只收录 packages/*，并声明 workspace 设置
```

本仓库不需要内核目录。只有在本机改插件、要加载官方内核时，才在旁边放一份官方克隆，把路径写进本机的 `kernel.local.json`（从样例复制，不提交）。打包和发布插件 tgz 不依赖本机内核。

## 官方默认位置与存储边界

插件完全使用官方默认位置，不建立自己的用户目录：

| 位置 | 用途 |
|---|---|
| `~/.dsh` 或官方 `$DSH_HOME` | 官方 home：凭据、profile、会话、官方 storages、用户指令 |
| 官方 `profileContext.dir` | 当前 profile 的 `package.json`、`node_modules`、`cordis.patch.yml`；插件的 profile 级状态放在这里 |
| 官方 Electron userData | Desktop 自己的浏览器数据；插件不重定向 |

- 不创建 `~/.dsh-x` 或其他独立 home。
- 不设置、不改写 `DSH_HOME` / `DSH_AGENTS_HOME` 来把官方数据引到别处。
- 不搬动、重写、归档或重新索引官方 `sessions/`；会话位置与格式完全由官方内核决定。
- `dsh-x-update` 只读公开 Release 索引和 profile 版本，不下载安装包，不写 `$DSH_HOME/updates`、`installer-packages` 或待应用清单。
- `dsh-x-plan` 的计划文件放在官方 home 的 `plans/<session-id>/`；这是插件的计划档案，不是官方会话的替代位置。
- Agents、Code、Stocks 的 profile 级状态分别放在官方 profile 下的 `.dsh-x-agents`、`.dsh-x-code`、`.dsh-x-stock`。它们不写官方 `sessions/`，也不含凭据。

## 安装与更新

版本口径分两层：

- **加载准入**——插件对官方 `@deepseek-ai/dsh*` 的 peer 范围（当前 `^0.2.0-rc.2 || ^0.2.1-rc.2`）决定官方 CLI 允不允许安装、Host 允不允许加载。官方只读 peer，不读 `engines.dsh`。写成联合范围而不是单个 `^0.2.0-rc.2`，是为了让 pnpm 的默认解析仍落在 0.2.1-rc.2：原生 semver 的预发布规则会把单个 `^0.2.0-rc.2` 解析成更低的 0.2.0-rc.2。
- **发布资格**——各包 `engines.dsh` 精确等于跑过完整套件矩阵的基线（`0.2.1-rc.2`）。

因此 npm `latest`（`0.2.0-rc.2`）和 `next`（`0.2.1-rc.2`）都能装；但只有基线跑了完整矩阵，`latest` 只证明了安装与 Web 启动。细节与证据范围见 [兼容说明](compatibility/README.md)。

把整份 Release 资产下载到同一个目录后，用随包附带的 `install-plugins.mjs` 一条命令装齐常用组合（suite + plan + stock + chat + update）：

```sh
cd ~/Downloads/dsh-x-0.1.3
dsh --version
node install-plugins.mjs
```

也可以走官方 Plugins 页面，或逐条使用官方 CLI：

```sh
dsh plugin --profile web add /绝对路径/dsh-x-suite-0.1.3.tgz --config.auto-install-peers=false
```

Desktop 先启动一次初始化 profile，然后完全退出；使用 Desktop 自带的 dsh，把 profile 改为 `desktop`。npm CLI 不能替换 Desktop 内核或依赖图。

`dsh-x-update` 只检查新的 `plugins-v*` 版本并给出 Release 链接；安装和升级仍由官方 Plugins 页面完成。应用/内核更新不属于本仓库，也不由插件执行。

## 新增插件与可复现测试

- `packages/dsh-x-code/`：独立 Code 工作区，文件树/源码/差异浏览、显式所选快照审查、结构化问题、经 Agents 修复与重新审查。默认使用 DSH 当前模型且不开放工具；审批前明确文件范围与可能费用。浏览与默认审查无需启用 Agents，修复需要 Agents。详见该包 README 与 VALIDATION。
- `packages/dsh-x-agents/`：接入 Codex app-server、OpenCode HTTP/SSE、Claude 官方 Agent SDK 与 Grok 官方 ACP 原生任务。输入区入口与右栏用于准备明确委派、查看活动、继续原生会话及请求停止；授权仍走官方 DSH 卡片。Claude/Grok 首次初始化在用户批准后进行；连接检查只读取版本，账号有效性与付费模型调用尚未验证。
- `packages/dsh-x-stock/`：独立股票详情页 + 底部自选条；手动固定 A 股代码、排序、移除、收起，点底条打开同一股票。行情 provider 可替换；默认不接 A 股源并明确显示未配置，不生成价格、走势或分析。可选开启本机免密钥源 `qt.gtimg.cn`（非官方、无授权，仅个人本机使用）。另保留 Finnhub 单股票报价工具，需凭据、覆盖取决于其套餐。
- `packages/dsh-x-chat/`：通过已配置的官方 LLM 提供方进行一次独立问答；显式传 provider/model，不执行工具或自动读取文件。
- `packages/dsh-x-plan/`：计划状态、批准副本和验收；计划文件在官方 home 的 `plans/`。
- `packages/dsh-x-browser/`：**实验性**，受控浏览器操作与权限边界；预留 Desktop 内嵌浏览器能力，Electron 行为不在本仓库验证，也不在默认安装集合里。
- `packages/dsh-x-update/`：只检查公开插件发布并给出 Release 链接；不下载、不安装、不写额外目录。

股票 UI 使用自有 main/sidebar 插槽；仅在 shell.bottom 无其他注册者时显示底条，冲突时退让。聊天目前是模型可调用工具，没有独立聊天窗口。真实行情、历史走势与分析结果仍需获授权数据源；本机免密钥源只是个人查看的可选补充，不承诺实时或可再分发。

安装与链接：见 `scripts/README.md`。核验版本、通过项目与未覆盖项目：见 `TEST_REPORT.md`。套件安装、冲突检查及可独立使用边界见 [Developer Suite](packages/dsh-x-suite/README.md)。上游版本检查与尚未激活的调度条件见 [兼容策略](compatibility/README.md)。

## 语言与界面

Stock、Chat、Plan 跟随 DSH 官方「设置 → 语言」，内置中文与英文，不增加插件自己的语言设置。切换后股票页/自选条、三个插件的工具卡、提示与错误，以及 plan 的原生审批理由立即更新。数字、百分比与日期使用当前语言的 `Intl` 格式；证券代码、证券名称、自定义别名、路径与模型原文保持不变。

实现使用官方 `ctx.locale`、slot 的 `locale`/`t`、`tool.call.toolview`、`output.presentationMeta` 和审批 `displayReason`。新增语言包由官方 fallback 链选择文案，缺省回退英文。Host 的模型指令、工具协议文案、启动诊断和旧历史原始记录不按浏览器语言重写；它们与用户界面文案分开。

根目录 `pnpm test` 会先构建各客户端包，再跑全部单元、DOM 与官方运行时集成测试；无需真实模型或行情凭据。
