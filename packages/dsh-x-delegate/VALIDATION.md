# 验证

包内 `node --test` 覆盖：

- ACP 换行 JSON-RPC：`initialize`、`session/new`、`session/set_config_option`、`session/prompt`，以及对端提前关闭时挂起请求被拒绝。
- 权限三档：`read-only` 放行 `read`，拒绝 `edit`；`deny` 全拒绝；`allow` 选择第一个 allow 选项。
- 消息块按 message id 拼接，答案取最后一条非空消息。
- `codex exec` 参数包含 `--json`、`--cd`、`--sandbox`、`--model`，提示是 `-`（stdin）。折叠器忽略 reasoning，保留最后一条 `agent_message`，并记录 `turn.failed`。
- 同一次调用的选项绑在 prompt 数组上，只能读取一次。官方 activation 会替换工具的 `AbortSignal`，但会转发同一个 prompt 数组。

尚未在本仓库里验证：

- 用真实 Grok / OpenCode / Codex 凭据跑完一回合。OpenCode 的 ACP `session/prompt` 曾在本机返回 `end_turn`；Grok 的 `session/new` 在沙箱外需要写 `~/.grok`。
- Desktop 或 Web profile 里的安装、工具出现在模型列表、以及和官方 `subagent_codex` 同时启用。
- `permission: allow` 时子进程改写工作区。默认是 `read-only`。
