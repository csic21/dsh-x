import { en } from './locales.ts'
import type { ChatLocaleKey } from './locales.ts'

const CANCELLED = new Set<string>(['interrupted', 'ABORTED', 'ABORTED_BEFORE_DISPATCH', 'DSH_X_CHAT_CANCELLED'])

/** Lazy model-visible argument view supplied by the shell while rendering. */
export interface LazyToolArgs {
  text?(key: string): unknown
}

/** Recorded call material this view reads; every field is untrusted beyond its checks. */
export interface ChatToolBlock {
  args?: LazyToolArgs | null
  isError?: unknown
  error?: { name?: unknown; code?: unknown } | null
  content?: unknown
  meta?: unknown
}

/** One presentation decision for the chat tool row. */
export interface ChatViewModel {
  state: 'preparing' | 'running' | 'complete' | 'failed' | 'cancelled'
  errorKey: ChatLocaleKey | null
  prompt: string
  context: string
  provider: string
  model: string
  text: string
  truncated: boolean
}

interface ChatPresentationMeta {
  answerBlocks: number
  provider: string
  model: string
  truncated: boolean
}

function resultMetadata(meta: unknown, content: unknown): ChatPresentationMeta | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const value = meta as Record<string, unknown>
  if (value.kind !== 'dsh-x-chat' || value.version !== 1 || value.answerBlocks !== 1
    || typeof value.provider !== 'string' || typeof value.model !== 'string'
    || typeof value.truncated !== 'boolean'
    || !Array.isArray(content) || content.length !== (value.truncated ? 2 : 1)
    || content.some(item => !item || typeof item !== 'object' || (item as { type?: unknown }).type !== 'text' || typeof (item as { text?: unknown }).text !== 'string')) return null
  return { answerBlocks: value.answerBlocks, provider: value.provider, model: value.model, truncated: value.truncated }
}

function argument(block: ChatToolBlock | null | undefined, key: string): string {
  // Read the official lazy argument view while rendering, including preparation.
  const value = block?.args?.text?.(key)
  return typeof value === 'string' ? value : ''
}

function visibleText(block: ChatToolBlock | null | undefined, settled: boolean, failed: boolean, meta: ChatPresentationMeta | null): string {
  if (!settled || failed) return ''
  const content = block?.content
  if (!Array.isArray(content)) return ''
  const shown = meta ? content.slice(0, meta.answerBlocks) : content
  return shown.map(item => item && typeof item === 'object' && (item as { type?: unknown }).type === 'text'
    ? String((item as { text: unknown }).text)
    : JSON.stringify(item, null, 2)).join('\n')
}

export function chatViewModel(phase: string, block?: ChatToolBlock | null): ChatViewModel {
  const settled = phase === 'result'
  const failed = settled && block?.isError === true
  const code = block?.error?.code
  const cancelled = failed && typeof code === 'string' && CANCELLED.has(code)
  const meta = settled && !failed ? resultMetadata(block?.meta, block?.content) : null
  const ownError = block?.error?.name === 'DshXChatError'
    && typeof code === 'string'
    && Object.hasOwn(en, `error.${code}`)
  const errorKey: ChatLocaleKey | null = !failed ? null
    : ownError ? `error.${code}` as ChatLocaleKey
      : cancelled ? 'error.DSH_X_CHAT_CANCELLED' : 'error.unknown'
  return {
    state: !settled ? phase === 'preparing' ? 'preparing' : 'running'
      : cancelled ? 'cancelled' : failed ? 'failed' : 'complete',
    errorKey,
    prompt: argument(block, 'prompt'),
    context: argument(block, 'context'),
    provider: meta?.provider ?? argument(block, 'provider'),
    model: meta?.model ?? argument(block, 'model'),
    // A locale change must never translate or rewrite recorded model content.
    text: visibleText(block, settled, failed, meta),
    truncated: meta?.truncated === true,
  }
}
