# ACP 适配器预检与兼容边界

## 安装与身份

插件只解析已经安装的本地程序，不运行 `npx`、包管理器或自动下载。由操作者先从官方来源选择、审计并固定适配器版本及其运行依赖，再完成对应 CLI 的登录。可以通过 `DSH_X_ACP_CODEX`、`DSH_X_ACP_CLAUDE`、`DSH_X_ACP_GROK` 指定本地可执行程序；覆盖路径不会放宽模式要求。

- Codex：`codex-acp`，[官方适配器与安装说明](https://github.com/agentclientprotocol/codex-acp)
- Claude：`claude-agent-acp`，[官方适配器与安装说明](https://github.com/agentclientprotocol/claude-agent-acp)
- Grok：`grok --no-auto-update agent stdio`，[官方 ACP 说明](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md)

本次验证使用本仓库的本地协议 fixtures，以及已锁定的官方 subprocess 包。没有运行真实 Codex、Claude、Grok 模型调用，也没有验证任何真实适配器发布版本。fixture 的 `1.0.0` 不是支持版本声明。生产适配器仍需人工安装和审计；不能把预检成功当作来源、二进制完整性或依赖安全审计。

## 发送任务之前

`preflightAcp(options)` 不发送 `session/prompt`，也不会转发传入的任务正文。它依次执行：

1. ACP v1 初始化；不提供客户端文件系统、终端或交互式登录能力。
2. 要求 `agentInfo.name`、`agentInfo.version` 非空，记录可执行路径、名称、版本。
3. 通过 `session/new` 验证现有 CLI 登录能否建立会话。`authMethods` 只是登录方式目录，不代表必须重新登录。插件不匹配名称猜测 `cached`、`existing`、`login`，也不调用 `authenticate`。需要认证时明确要求先在 CLI 完成登录。
4. 要求会话实际声明指定模式，并要求 `session/set_mode` 成功。缺少模式、拒绝切换、协议不兼容、缺少身份均会阻止任务发送。
5. 关闭输入、终止子进程，并等待官方 subprocess 所拥有的进程范围退出。清理失败会显式报错，不能记作成功。

调用方应先解析规划者和验收者的两个程序，再分别预检；两个都通过后才发送规划任务。实际 `runAcpPrompt` 必须传入对应预检结果的 `expectedAdapter`，再次核对路径、名称、版本并重复模式握手。版本或身份改变时停止，要求重新预检。预检仅证明本次会话可以建立，不能保证后续额度、网络或模型请求一定成功。

参考：[ACP v1 初始化](https://agentclientprotocol.com/protocol/v1/initialization)、[会话建立](https://agentclientprotocol.com/protocol/v1/session-setup)、[会话模式](https://agentclientprotocol.com/protocol/v1/session-modes)。

## 只读模式的含义

所有权限请求都返回取消，模式降级通知会停止调用。客户端没有开放写文件或创建终端的能力。不过 ACP 适配器是本地进程，仍由其自身实现、本地配置、依赖与操作系统权限决定真正能做什么。这些检查不是插件提供的操作系统沙箱。

- Codex 要求 `read-only`。启动时同时设置 `INITIAL_AGENT_MODE=read-only`、`NO_BROWSER=1`、空 `DEFAULT_AUTH_REQUEST`，避免继承自动登录请求；仍必须通过实际会话能力和切换检查。[官方运行参数](https://github.com/agentclientprotocol/codex-acp/blob/main/README.md)
- Claude 要求 `plan`，并拒绝所有权限回调。官方文档描述文件编辑通过权限回调，且 Claude Code 2.1.212 起文件写入型 shell 命令也经过该回调。操作者必须审计适配器实际使用的 SDK/CLI、预设工具、hooks 和子代理配置；仅记录适配器版本不能认证这些依赖。它不是 OS 写保护。[官方权限文档](https://code.claude.com/docs/en/agent-sdk/permissions#plan-mode-plan)
- Grok 要求会话声明并接受 `read-only`；只声明 `plan` 不通过，会报 `DSH_X_PLAN_READONLY_UNAVAILABLE`。这按本次能力判断，没有永久禁用模型家族，也不声称当前 Grok 版本已通过实测。官方说明指出 `plan` 可写自身计划文件，不检查 shell 重定向写入，也不覆盖子代理的写入门禁；内建 `--sandbox read-only` 在部分不支持的环境可能警告后继续，不能据此假定强制只读。[计划模式限制](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/19-plan-mode.md)、[沙箱限制](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/18-sandbox.md)

若需要对不可信适配器、配置或仓库的强隔离，应由部署方提供经过验证的外部只读环境。这里不提供关闭模式校验的生产环境开关。测试通过显式注入本地 fixture 进程与虚构身份完成；不会运行外部模型。
