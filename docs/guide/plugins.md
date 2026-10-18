# 插件一览

三个插件，全部通过官方 Plugins 页面或 `dsh plugin` 安装。没有默认套件，也没有必须一起安装的组合。

| 包 | 作用 | 默认安装 | 状态 |
| --- | --- | --- | --- |
| `dsh-x-code` | 代码工作区：文件树、源码/差异、快照审查与 findings | 按需 | 可用 |
| `dsh-x-stock` | A 股自选（含名称搜索）、市场全景、独立详情页、底部自选条；另含只读报价工具 | 按需 | 可用，行情源与市场源需显式配置 |
| `dsh-x-browser` | 受控浏览器操作与权限边界 | 不装（实验性） | 实验性，Electron 行为不在本仓库验证 |

## dsh-x-code

给当前工作区一个可审查的代码视图：

- 文件树、源码、差异；工作区 / 暂存区 / 区间三种快照。
- 只读浏览不需要任何外部 Agent。
- 审查使用**当前会话配置的 DSH 模型**：官方审批会说明 provider、model、路径、字节数和可能的模型费用；只发送所选源码快照，不提供工具、会话历史或测试执行。
- findings 必须引用所选源码的精确行和字面证据，否则整次审查失败，不会退化成“没有问题”。
- 复审同一批文件会建立新的证据；旧 findings 保留为历史。
- 不再包含原生 Agent 审查或修复。要修问题，直接在对话里让主模型修改，然后回来复审。

## dsh-x-stock

个人向的 A 股自选体验：

- 手动固定代码、排序、移除、收起；点底部条打开同一支股票。自选表单可按名称片段、拼音首字母或代码搜索 A 股、ETF、LOF 与 REIT，选中后自动回填交易所与代码。
- 新增「市场 / 自选」切换：主要指数、5,000+ 只 A 股的涨跌家数、31 个申万一级与 124 个二级行业热力图、本地情绪摘要、涨跌幅与成交额前列；点行业可下钻成交额前 200 只成分股。
- 行情 provider 可替换；默认不接任何 A 股源，界面明确显示未配置。市场全景默认关闭，可在市场页用「免费源」开关开启（状态写入当前 profile 的 `.dsh-x-stock`，无需改配置或重启）；也可用 `marketSource` 强制开启，强制时开关不可关闭。名称搜索与该开关共用，关闭时不发任何请求，只显示开启入口。
- 可选开启本机免密钥源（`qt.gtimg.cn` / 腾讯公开榜单，非官方、无授权，仅个人本机使用，不承诺实时或可再分发）。市场情绪指数由插件计算，不是供应商或交易所官方指标。
- 另有 Finnhub 单股票报价工具，需要凭据，覆盖范围取决于其套餐。
- 使用自有的 main / sidebar 插槽；仅当 `shell.bottom` 无其他注册者时显示底条，冲突时退让。

## dsh-x-browser

实验性，默认不安装，只能用于 Desktop：

- 在官方右侧栏增加 AI Browser tab，使用 Electron `webview` 与官方 lease，不接管内置浏览器的私有 tab。
- 提供 `dsh_x_browser_tabs` 和 `dsh_x_browser_action`；模型观察与操作受按轮授权、逐动作审批和接管约束。
- 不使用模型提供的 JavaScript、CSS 选择器、CDP 或原始 IPC。
- Web 端只显示不支持提示；仓库内只有 Web 侧单元与集成测试，Electron / 打包应用行为需要单独验证。

## 状态与语言

- Stock、Code 跟随 DSH 官方「设置 → 语言」，内置中文与英文；数字、百分比、日期用当前语言的 `Intl` 格式。
- 证券代码、证券名称、自定义别名、路径与模型原文保持原样，不做翻译。
- Host 侧的模型指令与工具协议文案不随浏览器语言重写。

## 数据放在哪

| 数据 | 位置 |
| --- | --- |
| 凭据、profile、会话、官方 storages | 官方 `~/.dsh`（或官方 `$DSH_HOME`） |
| 插件 profile 级状态 | 官方 profile 目录下的 `.dsh-x-code`、`.dsh-x-stock` |
| Desktop 浏览器数据 | 官方 Electron userData，插件不重定向 |

不存在 `~/.dsh-x` 之类的第二个 home；本仓库也不会把官方 `sessions/` 搬走或重建索引。

## 用 Codex 规划、DeepSeek 执行

原来的 `dsh-x-plan` 已移除；同样的分工可以用官方组件组合出来：

1. 在 **Plugins** 启用官方 **Codex subagent** bundle。它会全局注册 `subagent_codex`，并把 Codex 作为一次性子任务运行。
2. 给官方 `plan-mode` 的 `section` 加一段引导，让主模型在 plan mode 里先委派规划：

   ```yaml
   - id: plan-mode
     config:
       section: |
         In plan mode, delegate repository exploration and plan drafting to
         subagent_codex. Then present the returned plan through exit_plan_mode.
         Do not execute the task before the user approves.
   ```

3. 输入 `/plan`，主会话（DeepSeek）调用 `subagent_codex` 生成计划，再用 `exit_plan_mode` 提交给你审阅；批准后由主会话执行。

注意：Codex provider 是一次性、无人值守的外部运行，只回传最终答案；它不提供 DSH 的只读强制、计划哈希、文件范围绑定或跨家族验收。需要严格只读时，请配置 Codex 自己的 native sandbox，或在执行前用 Git 差异人工核对。不要把它当成 `dsh-x-plan` 的等价治理层。
