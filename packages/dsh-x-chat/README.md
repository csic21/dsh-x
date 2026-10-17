# dsh-x-chat

独立的只读问答插件，提供 `dsh_x_chat`。直接复用官方 `ctx.llm` 和已安装的提供方凭据，不启动外部 CLI，不读取或保存密钥，不修改内核。

## 安装与配置

以本仓库的插件打包流程安装该包，`cordis.patch.yml` 会加载 `dsh-x-chat`。运行环境需要官方 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-llm` **0.2.1-alpha.5** 与 Cordis；Node.js 要求与该内核一致：`^22.19.0 || >=24.0.0`。这里只验证了该官方版本，不承诺其他预发布版本兼容。

在 Harness 中先完成提供方的正常安装和登录。插件不新增认证流程。`provider` 是 Harness 注册的提供方路由 ID，`model` 是该路由支持的模型 ID；不要把 API 地址或密钥填到这两个字段。

可以直接在工具参数里同时传入 `provider`、`model`。也可以在本地插件配置中设置默认值：

```yaml
- id: dsh-x-chat
  name: dsh-x-chat
  config:
    provider: YOUR_REGISTERED_PROVIDER_ID
    model: YOUR_MODEL_ID
    timeoutMs: 60000
    maxOutputTokens: 2048
```

替换已有插件条目的配置，不要重复插入同名插件。示例 ID 是占位符，不是可直接调用的模型。工具中的完整路由对优先于插件默认值；只传其中一个会失败，没有默认值也不会猜测主会话的模型。

## 工具参数

- `prompt`：必填、非空问题，最多 16384 UTF-8 字节。
- `context`：可选参考材料，最多 49152 UTF-8 字节。只传允许发给该提供方的摘录。
- `provider`、`model`：可选的完整路由对。

例如：

```json
{"prompt":"解释这段代码的作用","context":"function add(a, b) { return a + b }","provider":"YOUR_REGISTERED_PROVIDER_ID","model":"YOUR_MODEL_ID"}
```

返回 `provider`、`model`、`text`、`truncated`。这是一次独立请求，不自动携带会话历史、不读取文件、不检索网页、不提供实时数据。底层模型没有可执行工具，任何工具调用输出都会被拒绝。不会返回推理块。模型仍可能答错，不应把回答当成已执行的操作或事实核验。

调用会把明确给出的问题和材料发给所选提供方，可能产生模型费用。只读指不更改本地文件或执行模型工具，不代表离线、免费或不传输输入。插件自身不保存聊天历史；宿主工具记录和提供方仍可能记录输入输出。不要发送密钥或未经允许的敏感材料。

## 资源与故障边界

- 默认超时 60 秒，可配置整数 1–120000 毫秒，覆盖路由准备和流消费。父调用取消会传给提供方；不遵守取消信号的提供方也不会阻塞工具返回，但远端计费/计算是否终止取决于提供方。
- 默认输出上限 2048 token，可配置整数 1–8192。达到 token 上限时 `truncated: true`，界面单独提示内容可能不完整。`text` 保留模型原文（包括首尾空白），不追加或翻译界面提示。
- 原始流累计最多 1 MiB / 20000 个块（包括推理和协议元数据），超过限制直接失败，避免输出/内存失控。输入超限直接报错，不静默截断。
- 缺少结束标记、错误/取消结束、工具调用、异常内容或空回答均失败，不把半截失败结果当成成功。
- 提供方异常使用通用提示，避免把错误中可能包含的凭据返回给模型；排查时查看宿主提供方状态。

## 测试

在安装了上述官方 peer dependencies 的环境执行：

```sh
npm test --prefix packages/dsh-x-chat
```

测试使用真实官方 `defineTool` / `BlockAssembler` 与本地假提供方，覆盖注册、路由、输入边界、截断、错误、工具调用拒绝、取消、超时及流大小上限。测试不会发起真实模型请求，不需要密钥，也不会产生模型费用。真实提供方端到端行为仍需在用户已配置的环境中验证。

## 界面语言 / UI language

浏览器端使用官方 `ctx.locale` 注册 `dsh-x-chat` 中英文词典，通过 `tool.call.toolview` 为 `dsh_x_chat` 注册独立工具卡片。问答标题、准备/执行/完成状态、详情按钮、字段标签、错误和截断提示随 DSH 的语言设置即时切换。插件没有额外语言选项，也不会把语言选择传给模型。插件管理中的标题和简介通过官方 `locale/en.json`、`locale/zh.json` 发布。

Host 使用官方 `HarnessError` 保留 `DshXChatError` 和稳定的 `DSH_X_CHAT_*` 错误码。客户端只根据结构化错误码选择提示，不根据中文或英文错误文字猜测。成功结果通过 `output.presentationMeta` 保存版本化的路由、原回答区段与截断信息。工具给主模型的截断提醒是单独的固定文本块，不受界面语言影响；卡片通过结构化区段显示原回答，再单独显示本地化提醒。旧记录缺少元数据时保留记录原文，不猜测或删除看起来像警告的模型文字。未知错误显示本地化的通用提示，可用“检查调用”查看宿主记录。

The web client follows the official DSH language preference immediately. It owns bilingual tool titles, progress/result states, details controls, field labels, errors, and truncation warnings. There is no separate language preference. Original model answers, questions, reference material, route IDs, tool descriptions, and the system prompt are never translated by the UI. Missing plugin translations in another installed language use the official locale fallback chain.

The client uses the official dynamic module factory and keyed tool-view slot. Build it with `npm --prefix packages/dsh-x-chat run build`; the repository build includes that step. Tests exercise the published client bundle in a DOM fixture with the installed official `LocaleRuntime`, including switching while an answer is expanded, English fallback, unchanged model text, structured failure identities, metadata, cleanup, and package exports. These checks do not replace an assembled-kernel browser smoke test.
