# dsh-x

DSH-X 是运行在官方 DeepSeek Harness 上的开发者插件套件。对用户提供组合体验，对开发者保留独立包；它不维护自己的内核 fork，也不另做一套 Electron 壳。

- 默认开发组合：`dsh-x-suite`，精确依赖 Code + Agents。启用入口不自动初始化原生账号、准备模型目录或执行任务。
- 可选独立功能：Chat、Plan、Stocks、Browser。Code 浏览和默认 DSH 模型审查不依赖 Agents；原生修复才需要它。Browser 的真实 Electron 验证单独记录，Web 测试不替代 Desktop 验证。
- 第一条交付路径：GitHub Release 的预构建插件包 + 官方 Plugins 管理器。套件随包携带 Code、Agents，不依赖它们已发布到 npm；安装及发布方法见 [插件发行](packaging/plugins.md)。源码存在不表示已有成功发布的 Release。
- 桌面发行使用官方源码编译的原样 Desktop，加上获用户授权的 DSH-X 外层安装器和插件初始化层，详见 [桌面发行](packaging/README.md)。只有最终 DMG/EXE 的实际安装报告通过，才能称为已验证的桌面交付。

套件安装、冲突检查及可独立使用边界见 [Developer Suite](packages/dsh-x-suite/README.md)。上游版本检查与尚未激活的调度条件见 [兼容策略](compatibility/README.md)。真实桌面验证流程见 [Desktop Browser proof](docs/desktop-browser-proof.md)。

这个 git 只放我们自己的代码。官方内核不在这里，也不做成子模块。

内核只在两个时刻出现：

- **打包**：Actions 按 `kernel_ref` 检出官方仓库，跑官方 Desktop 打包命令。要跟最新内核，改的是这次流水线的 ref，不是本仓库里的一份拷贝。
- **运行**：本机如果要改插件并看到它加载，旁边放一份内核克隆，`kernel.local.json` 指过去。Desktop 启动后，用 `link:` 加载 `packages/` 里的包。

不跑、不打包的时候，本仓库不需要内核目录。

## 本仓库

```text
dsh-x/
  packages/<包名>/              插件源码。一个目录一个包，目录名等于包名
                                 suite、code、agents、plan、stock、chat、browser
    src/                        TypeScript 源码；src/client/ 是浏览器侧源码
    lib/                        构建产物（交付包入库）：宿主 JS、.d.ts、client.js
    test/                       TypeScript 测试，直接跑 src
    tsconfig.json               类型检查（含测试，不产出）
    tsconfig.build.json         宿主构建（tsc 产出 lib/，排除 src/client）
  .github/workflows/            打包时检出内核、产出安装包
  packaging/                    平台、签名、插件为什么还不进安装包
  kernel.local.example.json     本机运行时的路径样例
  scripts/                      本机 link、验证脚本与共享构建 build-package.mjs
  package.json                  私有根，不声明 packageManager
  pnpm-workspace.yaml           只收录 packages/*，并声明 workspace 设置
```

| 目录 | 什么时候用到内核 |
|---|---|
| `packages/` | 不用。这里只是我们的源码 |
| `.github/workflows/` | 打包。检出 `kernel_ref`，不把内核提交进这个 git |
| `scripts/` | 本机运行。官方 npm CLI 链接/验证脚本；源码内核路径可保留在 kernel.local.json |

`kernel.local.json` 从样例复制，已在 `.gitignore` 里。它只描述本机路径，不负责更新内核。

## 不在这个 git 里

| 位置 | 是什么 |
|---|---|
| 官方 `deepseek-ai/deepseek-harness` | 内核。流水线临时检出，或本机另放一份克隆 |
| `~/.dsh-x` | 运行数据：密钥、desktop profile、用户指令、Electron 数据 |

home 不用默认的 `~/.dsh`。用户级指令在 `~/.dsh-x/agents/`，由 `DSH_AGENTS_HOME` 指向那里。

```text
~/.dsh-x/
  .credentials.yaml
  profiles/desktop/             link: 记在这里，不记在内核仓库里
  agents/AGENTS.md
  agents/skills/
  plans/<会话>/               dsh-x-plan 写下的计划、批准副本和验收结论
  electron-user-data/
  logs/
```

## 更新与安装包

官方 Desktop 的壳和内核是同一精确版本、同一签名更新单元；插件随官方提供的运行时启动，不能在 Desktop 内用 npm 单独替换内核。独立 npm CLI 使用官方 npm 发布的 CLI 包更新，与 Desktop 包依赖图分离。`dsh plugin update` 更新的是 profile 插件，并非 Desktop 内核。

Desktop 当前支持安装包固定的 `nightly` / `latest` 更新通道；`latest` 拒绝预发布版本，切换通道需要手动安装另一通道的包，没有已验证的应用内切换按钮。自动检查不会自动下载或安装。普通最新正式版与主动选择的预发布版都要先经过兼容验证；未验证版本不会自动放宽 `engines.dsh`、替换本地内核或发布 DSH-X。

检查工作流只产出精确版本和测试证据；Web Host / 协议 fixture 通过不代表 Electron、真实原生账号或真实模型调用已验证。当前精确准入仍为 `0.2.1-rc.2`，后续版本需要明确验证后更新声明。

官方依据：[Desktop 更新边界](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/apps/desktop/README.md)、[安装包通道规则](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/apps/desktop/packaging/README.md)、[插件兼容检查](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/boot/plugin-manager/README.md)。

打包规则在 `packaging/README.md`。官方 Desktop 能出的是 macOS arm64、macOS x64、Windows x64。Linux 没有这条打包路径。

`.github/workflows/desktop-package.yml` 的打包矩阵手动运行，打未签名的 macOS arm64 和 Windows x64；当前工作分支的 Browser 相关推送另触发限定范围的 Windows 证明任务。`link:` 的本机路径不会打进安装包。

## 新增插件与可复现测试

- `packages/dsh-x-code/`：独立 Code 工作区，文件树/源码/差异浏览、显式所选快照审查、结构化问题、经 Agents 修复与重新审查。默认使用 DSH 当前模型且不开放工具；审批前明确文件范围与可能费用。浏览与默认审查无需启用 Agents，修复需要 Agents。详见该包 README 与 VALIDATION。

- `packages/dsh-x-stock/`：独立股票详情页 + 底部自选条；手动固定 A 股代码、排序、移除、收起，点底条打开同一股票。行情 provider 可替换；当前未接 A 股源时明确显示未配置，不生成价格、走势或分析。另保留 Finnhub 单股票报价工具，需凭据、覆盖取决于其套餐。
- `packages/dsh-x-chat/`：通过已配置的官方 LLM 提供方进行一次独立问答；显式传 provider/model，不执行工具或自动读取文件。
- `dsh-x-plan`：补上计划状态读取失败时阻断工具、异常 ACP 消息防御、响应大小限制和子进程 stdin EPIPE 防护。

股票 UI 使用自有 main/sidebar 插槽；仅在 shell.bottom 无其他注册者时显示底条，冲突时退让。聊天目前是模型可调用工具，没有独立聊天窗口。真实行情、历史走势与分析结果仍需获授权数据源，未配置不代表实时服务可用。

安装与链接：见 `scripts/README.md`。核验版本、通过项目与未覆盖项目：见 `TEST_REPORT.md`。

## 语言与界面

Stock、Chat、Plan 跟随 DSH 官方「设置 → 语言」，内置中文与英文，不增加插件自己的语言设置。切换后股票页/自选条、三个插件的工具卡、提示与错误，以及 plan 的原生审批理由立即更新。数字、百分比与日期使用当前语言的 `Intl` 格式；证券代码、证券名称、自定义别名、路径与模型原文保持不变。

实现使用官方 `ctx.locale`、slot 的 `locale`/`t`、`tool.call.toolview`、`output.presentationMeta` 和审批 `displayReason`。新增语言包由官方 fallback 链选择文案，缺省回退英文。Host 的模型指令、工具协议文案、启动诊断和旧历史原始记录不按浏览器语言重写；它们与用户界面文案分开。

根目录 `pnpm test` 会先构建各客户端包，再跑全部单元、DOM 与官方运行时集成测试；无需真实模型或行情凭据。

## Agents 原生工作台

`packages/dsh-x-agents` 接入 Codex app-server、OpenCode HTTP/SSE、Claude 官方 Agent SDK 与 Grok 官方 ACP 原生任务。输入区入口与右栏用于准备明确委派、查看活动、继续原生会话及请求停止；授权仍走官方 DSH 卡片。Claude/Grok 首次初始化在用户批准后进行；连接检查只读取版本，账号有效性与付费模型调用尚未验证。完整能力、隔离与账号限制见 [Agents README](packages/dsh-x-agents/README.md)，实测边界见 [验证记录](packages/dsh-x-agents/VALIDATION.md)。
