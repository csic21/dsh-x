# dsh-x-delegate

把一个自包含任务委派给本机已经安装的外部编码代理。官方 `subagent_codex` 把 Codex 二进制钉在 `@openai/codex@0.153.4`，也不能选择模型。这个插件不携带那份约 275 MB 的载荷，而是调用你自己的 CLI。

| 工具 | 后端 | 进程 |
| --- | --- | --- |
| `delegate_grok` | Grok，Agent Client Protocol | `grok agent stdio` |
| `delegate_opencode` | OpenCode，Agent Client Protocol | `opencode acp --standalone` |
| `delegate_codex` | Codex，`exec --json` | `PATH` 上的 `codex`，或配置里的绝对路径 |

Provider 名是 `grok`、`opencode`、`delegate-codex`。`delegate-codex` 故意不叫 `codex`，这样和官方 Codex bundle 同时启用不会撞名。

每次调用都可以传 `model`。Grok / OpenCode 还会接受 `permission`（`deny`、`read-only`、`allow`，默认 `read-only`）。Codex 接受 `sandbox`（`read-only`、`workspace-write`、`danger-full-access`）。

认证沿用各 CLI 自己的 home：`~/.grok`、`~/.local/share/opencode`、`~/.codex`。插件不复制凭据。子进程环境是官方 subprocess seam 清洗过的父环境，`HOME` 和 `PATH` 会保留。

## 配置

`cordis.patch.yml` 给出默认三家。关掉 Codex：

```yaml
- id: dsh-x-delegate
  config:
    codex: false
```

把 Codex 指到固定二进制，并给 OpenCode 一个默认模型：

```yaml
- id: dsh-x-delegate
  config:
    codex:
      command: /opt/homebrew/bin/codex
      model: gpt-5.4
    acp:
      - providerName: opencode
        command: opencode
        args: [acp, --standalone]
        permission: read-only
        config:
          model: opencode/deepseek-v4.1-flash-free
```

`command: bundled` 只在本包旁确实安装了 Codex 载荷时可用；默认是 `codex`，也就是 `PATH` 解析。
