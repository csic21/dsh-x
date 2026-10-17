# packages

一个目录一个插件包。目录名等于 `package.json` 的 `name`。

第一个插件是 `packages/dsh-x-plan/`。不要把插件源码放进官方内核仓库。

根上的 `pnpm-workspace.yaml` 用 `packages/*` 收这些目录。本仓库根不声明 `packageManager`，pnpm 版本跟内核仓库走。

现有包：
- `dsh-x-code`：Code 文件树、源码/差异、持久快照审查与显式问题修复；独立开关，默认 DSH 模型审查，修复复用 Agents。
- `dsh-x-agents`：Codex/OpenCode/Claude/Grok 原生执行与审批、状态、模型目录。
- `dsh-x-plan`：外部 ACP 规划、用户批准、交叉验收。
- `dsh-x-stock`：A 股自选管理、独立详情页与冲突退让底条；可替换行情接口，另含 Finnhub 只读报价工具。
- `dsh-x-chat`：原生 LLM 只读独立问答工具。

新插件针对官方 `0.2.1-alpha.5` 验证；预发布 API 变化快，升级内核后应重新运行全部测试。
