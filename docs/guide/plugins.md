# 插件一览

三个插件，全部通过官方 Plugins 页面或 `dsh plugin` 安装。没有默认套件，也没有必须一起安装的组合。

| 包 | 作用 | 默认安装 | 状态 |
| --- | --- | --- | --- |
| `dsh-x-code` | 代码工作区：文件树、源码/差异、快照审查与 findings | 按需 | 可用 |
| `dsh-x-stock` | A 股自选（含名称搜索）、市场全景、独立详情页、底部固定栏；另含只读报价工具 | 按需 | 可用，行情源需显式开启 |
| `dsh-x-browser` | 受控浏览器操作与权限边界 | 不装（实验性） | 实验性，Electron 行为不在本仓库验证 |
| `dsh-x-delegate` | 把一个任务委派给本机 Codex、Grok 或 OpenCode | 按需 | 可用；真实 CLI 回合不在仓库内验证 |
| `dsh-x-pet` | 窗口里的 Codex 兼容桌宠 | 按需 | 可用；打包应用表现不在仓库内验证 |

## dsh-x-code

给当前工作区一个可审查的代码视图：

- 文件树、源码、差异；工作区 / 暂存区 / 区间三种快照。
- 只读浏览不需要任何外部 Agent。
- 审查使用**当前会话配置的 DSH 模型**：官方审批会说明 provider、model、路径、字节数和可能的模型费用；只发送所选源码快照，不提供工具、会话历史或测试执行。
- findings 必须引用所选源码的精确行和字面证据，否则整次审查失败，不会退化成“没有问题”。
- 复审同一批文件会建立新的证据；旧 findings 保留为历史。
- 审查面板的 **对话** 标签直接嵌入官方 Conversation（`conversation.content` 工厂，`embedded` 变体），用的是当前会话同一个草稿、同一个输入框和同一份记录：图片、`/` 命令、`@` 引用、附件和运行状态都跟主对话一致，插件不再自己维护第二份记录或轮询接口。
- 不再包含原生 Agent 审查或修复。要修问题，直接在对话里让主模型修改，然后回来复审。

## dsh-x-stock

个人向的 A 股自选体验：

- **自选与固定分开**：自选清单只在股票页显示、可滚动，加入自选不会让股票出现在底部；点「固定」的股票才进入底栏，最多 8 只。取消固定不移除自选。自选表单可按名称片段、拼音首字母或代码搜索 A 股、ETF、LOF 与 REIT，选中后自动回填交易所与代码。
- 底栏整条用**一次批量请求**按约 5 秒刷新（休市或报价超过三分钟没更新自动降到 60 秒，源关闭时停止，窗口隐藏或离线暂停）；macOS 用 `⌥⇧S`、Windows 与 Linux 用 `Alt+Shift+S` 可随时隐藏/显示底栏。一条都没固定、或用户隐藏了底栏时，插件不占用 `shell.bottom` 插槽。
- 「市场 / 自选」切换：主要指数、5,000+ 只 A 股的涨跌家数、31 个申万一级与 124 个二级行业热力图、本地情绪摘要、涨跌幅与成交额前列；点行业可下钻成交额前 200 只成分股。
- **全插件只有一个 A 股行情来源**：市场全景、自选详情和底栏都用同一个可替换 provider，也都受同一个「免费源」开关控制（状态写入当前 profile 的 `.dsh-x-stock`，无需改配置或重启）；也可用 `marketSource` 强制开启，强制时开关不可关闭。名称搜索与该开关共用，关闭时不发任何请求，只显示开启入口。旧的 `freeSource` 作为弃用别名仍然可用。
- 可选开启本机免密钥源（`qt.gtimg.cn` / 腾讯公开榜单，非官方、无授权，仅个人本机使用，是轮询而非推送，不承诺实时或可再分发）。市场情绪指数由插件计算，不是供应商或交易所官方指标。
- 另有 Finnhub 单股票报价工具，需要凭据，覆盖范围取决于其套餐。
- 使用自有的 main / sidebar 插槽；`shell.bottom` 有固定股票且未被隐藏、且无其他注册者时才显示，冲突时退让。

## dsh-x-delegate

把一个自包含任务交给本机已经登录的外部编码代理，不携带官方钉死的 Codex 0.153.4 载荷：

- `delegate_grok`：`grok agent stdio`（Agent Client Protocol）。
- `delegate_opencode`：`opencode acp --standalone`。`--standalone` 避免并发委派挤在同一个后台服务上。
- `delegate_codex`：`PATH` 上的 `codex exec --json`。Provider 名是 `delegate-codex`，可以和官方 `subagent_codex` 同时启用。
- 每次调用可传 `model`。Grok / OpenCode 还可传 `permission`（默认 `read-only`）；Codex 可传 `sandbox`。
- 认证沿用各 CLI 自己的 home。插件不复制凭据，也不继承当前会话。

## dsh-x-browser

实验性，默认不安装，只能用于 Desktop：

- 在官方右侧栏增加 AI Browser tab，使用 Electron `webview` 与官方 lease，不接管内置浏览器的私有 tab。
- 提供 `dsh_x_browser_tabs` 和 `dsh_x_browser_action`；模型观察与操作受按轮授权、逐动作审批和接管约束。
- 不使用模型提供的 JavaScript、CSS 选择器、CDP 或原始 IPC。
- Web 端只显示不支持提示；仓库内只有 Web 侧单元与集成测试，Electron / 打包应用行为需要单独验证。

## dsh-x-pet

一只与 Codex 同规格的桌宠，浮在窗口右下角：

- **同一套精灵表规格**：1536 宽、192×208 一格；v1 为 1536×1872（9 行），v2 为 1536×2288（11 行，多出 16 个视线方向）。按图片高度自动判断版本，不合规格的文件不显示。
- **同一批本机桌宠**：只读 `${CODEX_HOME:-~/.codex}/pets/<名字>/`，清单 `pet.json` 的字段与 Codex 相同（`id`、`displayName`、`description`、`spritesheetPath`）。在 Codex 里做出来的桌宠，这里就是同一只。
- **同一套动作与时序**：idle / running-right / running-left / waving / jumping / failed / waiting / running / review 九行，逐帧时长与 Codex 相同；空闲呼吸放慢 6 倍，一次性动作连播三遍后落回 idle；悬停切到 jumping，v2 精灵表空闲时会用 16 个方向看向指针。
- **跟随会话状态**：会话在跑 → running；在等审批或提问 → waiting；一轮结束还没看 → review；其余 → idle。
- **可拖动、可切换、可隐藏**：位置按当前 profile 保存；选择器列出内置桌宠与本机桌宠，缩略图就是它自己的 idle 第一帧。
- 模型可用 `dsh_x_pet` 工具列出、切换、移动或隐藏桌宠；该工具只改外观。
- 内置桌宠由 `scripts/pet-atlas.py` 程序化生成，是本仓库的原创美术；不包含任何第三方素材。

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
