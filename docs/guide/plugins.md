# 插件一览

八个包，一个默认入口：`dsh-x-suite`（挂在 `main` 上的组合）精确携带 `dsh-x-code` 与 `dsh-x-agents`。其余插件按需安装。

| 包 | 作用 | 默认安装 | 状态 |
| --- | --- | --- | --- |
| `dsh-x-suite` | 组合包，挂载 Code + Agents | ✅ | 稳定入口 |
| `dsh-x-code` | 代码工作区：文件树、源码/差异、快照审查、问题修复 | ✅（随套件） | 可用 |
| `dsh-x-agents` | Codex / OpenCode / Claude / Grok 原生任务的准备、审批、状态与停止 | ✅（随套件） | 可用，原生登录与真实调用未验证 |
| `dsh-x-plan` | 计划状态、批准副本、交叉验收；计划文件在官方 home 的 `plans/` | ✅ | 可用 |
| `dsh-x-stock` | A 股自选、独立详情页、底部自选条；另含只读报价工具 | ✅ | 可用，行情源需自行配置 |
| `dsh-x-chat` | 通过已配置的官方模型提供方做一次独立问答 | ✅ | 可用 |
| `dsh-x-update` | 只检查公开 Release 并给出链接，不下载不安装 | ✅ | 可用 |
| `dsh-x-browser` | 受控浏览器操作与权限边界 | ❌（实验性） | 实验性，Electron 行为不在本仓库验证 |

## dsh-x-suite

默认入口。它不是一个功能插件，而是把 Code 与 Agents 作为**同版本组件**一起交付：

- 两个组件通过 `bundledDependencies` 装进套件 tgz，第三方依赖仍需联网解析。
- 套件 patch 用与独立包**相同**的 entry id 插入组件行，因此同版本下独立安装与套件不会重复激活。
- 只包含 Code + Agents。Plan、Stock、Chat、Update 保持独立。

## dsh-x-code

给当前工作区一个可审查的代码视图：

- 文件树、源码、差异；工作区 / 暂存区 / 区间三种快照。
- 只读浏览与默认 DSH 模型审查**不需要** Agents。
- 选中问题后的自动修复需要 Agents 参与（复用其原生执行与审批）。
- 有明确的路径、凭据文件名、二进制与体积边界；越界会拒绝而不是截断。

## dsh-x-agents

把原生编码代理接进 DSH 的审批流：

- Codex app-server、OpenCode HTTP/SSE、Claude 官方 Agent SDK、Grok 官方 ACP。
- 输入区入口与右栏用于准备委派、查看活动、继续会话、请求停止。
- 授权仍走官方 DSH 审批卡片；首次初始化（登录、模型目录）在用户批准后进行。
- **未验证**：账号有效性、真实付费模型调用。连接检查只读取版本信息。

## dsh-x-plan

把"计划 → 批准 → 执行 → 交叉验收"固化成流程：

- 计划状态、批准副本与验收结论都落盘在官方 home 的 `plans/<session-id>/`。
- 验收命令通过官方工具运行时执行，失败会保留证据而不是静默通过。
- 规划与验收可使用外部 ACP 运行时；这层适配后续会向 Agents 收敛。

## dsh-x-stock

个人向的 A 股自选体验：

- 手动固定代码、排序、移除、收起；点底部条打开同一支股票。
- 行情 provider 可替换；**默认不接任何 A 股源**，界面明确显示未配置。
- 可选开启本机免密钥源 `qt.gtimg.cn`（非官方、无授权，仅个人本机使用，不承诺实时或可再分发）。
- 另有 Finnhub 单股票报价工具，需要凭据，覆盖范围取决于其套餐。
- 使用自有的 main / sidebar 插槽；仅当 `shell.bottom` 无其他注册者时显示底条，冲突时退让。

## dsh-x-chat

一次独立问答：显式传 provider / model，不执行工具、不自动读取文件。它不是独立聊天窗口，而是模型可调用的工具。

## dsh-x-update

只读检查器：读取公开 GitHub Releases 与当前 profile 版本，报告是否有兼容更新，并给出链接。

- 不下载安装包、不修改 profile、不写 `$DSH_HOME/updates`。
- 安装与升级仍由官方 Plugins 页面完成。

## dsh-x-browser

实验性，默认不安装。

- 面向桌面应用内嵌浏览器：受控导航、元素操作、授权与接管边界。
- 仓库内只有 Web 侧单元与集成测试；Electron / 打包应用行为需要单独的应用侧验证，当前不在本仓库。
- 想试用需要显式指定：`--plugins ...,dsh-x-browser`。

## 状态与语言

- Stock、Chat、Plan 跟随 DSH 官方「设置 → 语言」，内置中文与英文；数字、百分比、日期用当前语言的 `Intl` 格式。
- 证券代码、证券名称、自定义别名、路径与模型原文保持原样，不做翻译。
- Host 侧的模型指令与工具协议文案不随浏览器语言重写。

## 数据放在哪

| 数据 | 位置 |
| --- | --- |
| 凭据、profile、会话、官方 storages | 官方 `~/.dsh`（或官方 `$DSH_HOME`） |
| 插件 profile 级状态 | 官方 profile 目录下的 `.dsh-x-agents`、`.dsh-x-code`、`.dsh-x-stock` |
| Plan 计划档案 | 官方 home 的 `plans/<session-id>/` |
| Desktop 浏览器数据 | 官方 Electron userData，插件不重定向 |

不存在 `~/.dsh-x` 之类的第二个 home；本仓库也不会把官方 `sessions/` 搬走或重建索引。
