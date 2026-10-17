import { HarnessError } from '@deepseek-ai/dsh-llm'

// Stable host/model diagnostics. Browser language never changes these strings.
// The client selects its own localized copy by the durable error identity.
export const ERROR_MESSAGES = Object.freeze({
  DSH_X_CHAT_ROUTE: 'provider 和 model 必须同时设置为非空字符串（最多 256 字符）。',
  DSH_X_CHAT_CONFIG: '插件配置必须是对象。',
  DSH_X_CHAT_CONFIG_KEY: '不支持的插件配置项。',
  DSH_X_CHAT_TIMEOUT_CONFIG: 'timeoutMs 必须为 1–120000 的整数。',
  DSH_X_CHAT_TOKENS_CONFIG: 'maxOutputTokens 必须为 1–8192 的整数。',
  DSH_X_CHAT_PROMPT_TYPE: 'prompt 必须是非空字符串。',
  DSH_X_CHAT_CONTEXT_TYPE: 'context 必须是字符串。',
  DSH_X_CHAT_PROMPT_LIMIT: 'prompt 超过 16384 UTF-8 字节限制，请缩短后重试。',
  DSH_X_CHAT_CONTEXT_LIMIT: 'context 超过 49152 UTF-8 字节限制，请缩短后重试。',
  DSH_X_CHAT_CANCELLED: '问答已取消。',
  DSH_X_CHAT_TIMEOUT: '问答超时。',
  DSH_X_CHAT_AFTER_FINISH: '模型在结束标记后继续返回数据。',
  DSH_X_CHAT_RESPONSE_LIMIT: '模型响应超过安全大小限制，已中止。',
  DSH_X_CHAT_TOOL_CALL: '只读问答拒绝模型工具调用。',
  DSH_X_CHAT_FINISH: '模型未正常完成问答（错误、取消或工具请求）。',
  DSH_X_CHAT_INCOMPLETE: '模型响应缺少结束标记，不能作为完整回答。',
  DSH_X_CHAT_CONTENT: '模型返回了不支持的内容类型。',
  DSH_X_CHAT_EMPTY: '模型没有返回可见文字。',
  DSH_X_CHAT_PROVIDER: '问答调用失败，请检查已配置的提供方、模型及其连接状态。',
})

export class DshXChatError extends HarnessError {
  constructor(code) {
    if (!Object.hasOwn(ERROR_MESSAGES, code)) throw new TypeError(`Unknown chat error code: ${code}`)
    super(ERROR_MESSAGES[code], code)
  }
}
