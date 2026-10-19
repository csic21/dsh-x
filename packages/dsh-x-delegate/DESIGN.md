# 设计

`dsh-x-delegate` 是纯 Host 插件。它在 `ctx.subagents` 上注册外部进程后端，再用自己的工具经官方 `startActivation` 启动。这样父会话仍拥有取消、结果投递和子任务目录，工具本身只返回 activation 回执。

## 为什么不依赖官方 ACP 包

`@deepseek-ai/dsh-subagent-acp` 依赖 `@agentclientprotocol/sdk`，而这份 SDK 不在桌面安装的 307 个内核包里。官方客户端也只调用 `initialize`、`session/new`、`session/prompt`、`session/cancel`：

- 不调用 `authenticate`，Grok 在需要显式认证时起不来。
- 不读取 `configOptions`，也不能 `session/set_config_option`，所以模型被代理自己的默认值锁死。
- `permission` 只有 `allow` / `reject`。`reject` 用 ACP 的 `cancelled` 结局，可能中止整个回合，而不是拒绝这一次工具。

本包自己实现换行分隔的 JSON-RPC，不安装 SDK。

## 两套传输

Grok 和 OpenCode 都回答 ACP `protocolVersion: 1`。OpenCode 默认连共享后台服务，所以参数固定带 `--standalone`。

Codex CLI 没有 ACP。它走 `codex exec --json`，事件流是 `thread.started`、`item.completed`（`agent_message`）、`turn.completed` / `turn.failed`。只保留最后一条非空 `agent_message`。提示从 stdin 送入，不放进 argv。

## 每次调用的模型

`startActivation` 的请求没有自由字段，而且管理器在调用 `provider.start` 之前会换成自己的 `AbortSignal`。它转发的是同一个 `prompt` 数组，所以工具把 `model`、`permission`、`sandbox` 绑在这个数组上，provider 读一次就删掉。不走 `agentOptions`，因为那会把外部模型 id 送进 DSH 的 LLM 预检并被拒绝。

## 不做的事

- 不继承父会话。
- 不把图片块转给子进程。ACP 图片能力和 Codex 的 `--image` 都还没接。
- 不在插件里保存 `~/.grok` 或 `~/.codex`。
- 不把官方 `subagent_codex` 卸掉。两者可以并存。
