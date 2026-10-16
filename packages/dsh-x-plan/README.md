# dsh-x-plan

规划、执行、验收分成三步。

1. `dsh_x_plan` 启动 Codex、Claude 或 Grok 的 ACP 命令，只读地写计划，保存到 `$DSH_HOME/plans/<会话>/plan-<轮次>.md`。`DSH_HOME` 没设置时用 `~/.dsh-x`。
2. 用户看过计划后，DeepSeek 调用 `dsh_x_approve_plan`。审批卡要用户点允许，插件才把当时的文件复制成 `plan-<轮次>.approved.md`。批准前，写文件、跑命令、`run_code` 这类工具会被拒绝。
3. DeepSeek 只按 approved 文件执行。然后 `dsh_x_review` 用另一个模型家族对照批准的计划、`git diff HEAD` 和计划里的验收命令。失败只返回缺口。同一份计划失败两次后停止，交给用户。

规划者和验收者默认错开：codex → claude，claude → grok，grok → codex。验收者不能和规划者是同一家族。

## 和官方接口的关系

插件按[打包与安装插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)做成组合包：`dsh.bundle.patch` 指向 `cordis.patch.yml`，入口导出 `name`、`inject` 和 `apply`。工具用 `@deepseek-ai/dsh-tools` 的 `defineTool` 注册。写限制走 `tools/pre-execute`。会话 id 用工具执行上下文里的 `exec.agent.id`。工作目录用 `ctx.workingDirectory.ensure`。子进程用 `ctx.subprocess`，沿用官方的环境清理，不把 API key 传给外部 CLI。

没有写 `engines.dsh`。装进哪个 DSH 版本，由你当时启动的内核决定。

ACP 调用和官方 `@deepseek-ai/dsh-subagent-acp` 一样：新进程、`initialize`、`session/new`、`session/prompt`，正文只取 `agent_message_chunk`。客户端不声明文件系统和终端能力。`session/request_permission` 一律取消。Codex 额外设置 `INITIAL_AGENT_MODE=read-only`。Claude 会尝试会话模式 `plan`。

## 命令

| 家族 | 本机命令 | 没有该命令时 |
|---|---|---|
| codex | `codex-acp` | `npx -y @agentclientprotocol/codex-acp` |
| claude | `claude-agent-acp` | `npx -y @agentclientprotocol/claude-agent-acp` |
| grok | `grok --no-auto-update agent stdio` | `npx -y @xai-official/grok --no-auto-update agent stdio` |

`DSH_X_ACP_CODEX`、`DSH_X_ACP_CLAUDE`、`DSH_X_ACP_GROK` 可以换成别的可执行文件，参数仍用上表那一组。登录留在各自 CLI 里。插件看到只有 API key 的登录方式时会停下来，要求先在 CLI 登录。

## 计划文件

```text
~/.dsh-x/plans/<session-id>/
  plan-1.md
  plan-1.json
  plan-1.approved.md
  plan-1.discarded
  review-1-1.md
  review-1-1.json
```

用户可以在批准前改 `plan-<轮次>.md`。批准复制的是当时的文件。验收命令写在计划最后的 `dsh-x-acceptance` 代码块里，一行一条。验收结论写在 `dsh-x-verdict` 代码块里，只能是 `pass` 或 `fail`。

DeepSeek 自己的聊天记录仍在 `$DSH_HOME/sessions`。这里只多放计划、批准副本和验收结论。

## 安装

profile 起来之后：

```sh
dsh plugin --profile <name> add link:/绝对路径/packages/dsh-x-plan
```

Desktop 的 `desktop` profile 不接受这条公开命令。那条路径要用 Desktop 自带的 CLI，本仓库的启动脚本还没写。

组合包还不会打进安装包。`link:` 只在本机开发时用。
