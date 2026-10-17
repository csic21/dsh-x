import { en } from './locales.js'

const CANCELLED = new Set(['interrupted', 'ABORTED', 'ABORTED_BEFORE_DISPATCH', 'DSH_X_CHAT_CANCELLED'])

function resultMetadata(meta, content) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)
    || meta.kind !== 'dsh-x-chat' || meta.version !== 1 || meta.answerBlocks !== 1
    || typeof meta.provider !== 'string' || typeof meta.model !== 'string'
    || typeof meta.truncated !== 'boolean'
    || !Array.isArray(content) || content.length !== (meta.truncated ? 2 : 1)
    || content.some(item => item?.type !== 'text' || typeof item.text !== 'string')) return null
  return meta
}

function argument(block, key) {
  // Read the official lazy argument view while rendering, including preparation.
  const value = block?.args?.text?.(key)
  return typeof value === 'string' ? value : ''
}

export function chatViewModel(phase, block) {
  const settled = phase === 'result'
  const failed = settled && block.isError === true
  const cancelled = failed && CANCELLED.has(block.error?.code)
  const meta = settled && !failed ? resultMetadata(block.meta, block.content) : null
  const ownError = block.error?.name === 'DshXChatError'
    && Object.hasOwn(en, `error.${block.error.code}`)
  return {
    state: !settled ? phase === 'preparing' ? 'preparing' : 'running'
      : cancelled ? 'cancelled' : failed ? 'failed' : 'complete',
    errorKey: !failed ? null : ownError ? `error.${block.error.code}`
      : cancelled ? 'error.DSH_X_CHAT_CANCELLED' : 'error.unknown',
    prompt: argument(block, 'prompt'),
    context: argument(block, 'context'),
    provider: meta?.provider ?? argument(block, 'provider'),
    model: meta?.model ?? argument(block, 'model'),
    // A locale change must never translate or rewrite recorded model content.
    text: settled && !failed && Array.isArray(block.content)
      ? (meta ? block.content.slice(0, meta.answerBlocks) : block.content)
        .map(item => item.type === 'text' ? item.text : JSON.stringify(item, null, 2)).join('\n') : '',
    truncated: meta?.truncated === true,
  }
}
