# dsh-x

这个 git 只放我们自己的代码。官方内核不在这里，也不做成子模块。

内核只在两个时刻出现：

- **打包**：Actions 按 `kernel_ref` 检出官方仓库，跑官方 Desktop 打包命令。要跟最新内核，改的是这次流水线的 ref，不是本仓库里的一份拷贝。
- **运行**：本机如果要改插件并看到它加载，旁边放一份内核克隆，`kernel.local.json` 指过去。Desktop 启动后，用 `link:` 加载 `packages/` 里的包。

不跑、不打包的时候，本仓库不需要内核目录。

## 本仓库

```text
dsh-x/
  packages/<包名>/              插件源码。一个目录一个包，目录名等于包名
                                 现有 dsh-x-agents、dsh-x-plan、dsh-x-stock、dsh-x-chat
  .github/workflows/            打包时检出内核、产出安装包
  packaging/                    平台、签名、插件为什么还不进安装包
  kernel.local.example.json     本机运行时的路径样例
  scripts/                      本机 link 与 Web 冒烟验证脚本
  package.json                  私有根，不声明 packageManager
  pnpm-workspace.yaml           只收录 packages/*
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

## 安装包

打包规则在 `packaging/README.md`。官方 Desktop 能出的是 macOS arm64、macOS x64、Windows x64。Linux 没有这条打包路径。

`.github/workflows/desktop-package.yml` 手动运行，打未签名的 macOS arm64 和 Windows x64。`link:` 的本机路径不会打进安装包。

## 新增插件与可复现测试

- `packages/dsh-x-stock/`：独立股票详情页 + 底部自选条；手动固定 A 股代码、排序、移除、收起，点底条打开同一股票。行情 provider 可替换；当前未接 A 股源时明确显示未配置，不生成价格、走势或分析。另保留 Finnhub 单股票报价工具，需凭据、覆盖取决于其套餐。
- `packages/dsh-x-chat/`：通过已配置的官方 LLM 提供方进行一次独立问答；显式传 provider/model，不执行工具或自动读取文件。
- `dsh-x-plan`：补上计划状态读取失败时阻断工具、异常 ACP 消息防御、响应大小限制和子进程 stdin EPIPE 防护。

股票 UI 使用自有 main/sidebar 插槽；仅在 shell.bottom 无其他注册者时显示底条，冲突时退让。聊天目前是模型可调用工具，没有独立聊天窗口。真实行情、历史走势与分析结果仍需获授权数据源，未配置不代表实时服务可用。

安装与链接：见 `scripts/README.md`。核验版本、通过项目与未覆盖项目：见 `TEST_REPORT.md`。

## 语言与界面

三个插件跟随 DSH 官方「设置 → 语言」，内置中文与英文，不增加插件自己的语言设置。切换后股票页/自选条、三个插件的工具卡、提示与错误，以及 plan 的原生审批理由立即更新。数字、百分比与日期使用当前语言的 `Intl` 格式；证券代码、证券名称、自定义别名、路径与模型原文保持不变。

实现使用官方 `ctx.locale`、slot 的 `locale`/`t`、`tool.call.toolview`、`output.presentationMeta` 和审批 `displayReason`。新增语言包由官方 fallback 链选择文案，缺省回退英文。Host 的模型指令、工具协议文案、启动诊断和旧历史原始记录不按浏览器语言重写；它们与用户界面文案分开。

根目录 `npm test` 会先构建三个客户端包，再跑全部单元、DOM 与官方运行时集成测试；无需真实模型或行情凭据。

## Agents 原生工作台

`packages/dsh-x-agents` 接入 Codex app-server、OpenCode HTTP/SSE、Claude 官方 Agent SDK 与 Grok 官方 ACP 原生任务。输入区入口与右栏用于准备明确委派、查看活动、继续原生会话及请求停止；授权仍走官方 DSH 卡片。Claude/Grok 首次初始化在用户批准后进行；连接检查只读取版本，账号有效性与付费模型调用尚未验证。完整能力、隔离与账号限制见 [Agents README](packages/dsh-x-agents/README.md)，实测边界见 [验证记录](packages/dsh-x-agents/VALIDATION.md)。
