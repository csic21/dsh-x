import { planError } from './errors.js'
import { MAX_PLAN_CHARS, SUBPROCESS_GRACE_MS } from './limits.js'

const PROTOCOL_VERSION = 1
export const MAX_ACP_LINE_CHARS = 256_000

/**
 * One-shot ACP client. Matches the official subagent client: a fresh process,
 * `initialize` then `session/new` then `session/prompt`, assistant text taken
 * only from `agent_message_chunk`, and every permission request cancelled.
 * Client capabilities stay empty so the child is not offered a writable filesystem.
 *
 * @param {{
 *   spawn: (spec: object) => { stdin: import('node:stream').Writable, stdout: import('node:stream').Readable, terminate?: () => void },
 *   argv: string[],
 *   cwd: string,
 *   env?: Record<string, string>,
 *   prompt: string,
 *   signal?: AbortSignal,
 *   modeId?: string | null,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<{ ok: boolean, stopReason: string, text: string, permissionDenials: number }>}
 */
export async function runAcpPrompt(options) {
  const signal = options.timeoutMs === undefined
    ? options.signal
    : AbortSignal.any([
      ...(options.signal === undefined ? [] : [options.signal]),
      AbortSignal.timeout(options.timeoutMs),
    ])
  throwIfAborted(signal)

  const child = options.spawn({
    argv: options.argv,
    cwd: options.cwd,
    stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' },
    graceMs: SUBPROCESS_GRACE_MS,
    signal,
    env: options.env ?? {},
  })
  if (child.stdin === undefined || child.stdout === undefined) {
    teardown(child)
    throw planError('ACP_STREAM', 'ACP 子进程没有提供 stdin/stdout。')
  }

  const rpc = new NdjsonRpc(child.stdin, child.stdout)
  let sessionId
  let permissionDenials = 0
  rpc.onRequest('session/request_permission', () => {
    permissionDenials += 1
    return { outcome: { outcome: 'cancelled' } }
  })

  const text = { value: '' }
  rpc.onNotify('session/update', params => {
    const update = params && params.update
    if (update === undefined || update === null) return
    if (update.sessionUpdate !== 'agent_message_chunk') return
    const chunk = contentText(update.content)
    if (text.value.length + chunk.length > MAX_PLAN_CHARS) {
      throw planError('ACP_SIZE', `ACP 正文超过 ${MAX_PLAN_CHARS} 个字符。`)
    }
    text.value += chunk
  })

  const cancel = () => {
    if (typeof sessionId === 'string') {
      try {
        rpc.notify('session/cancel', { sessionId })
      } catch {
        // The child is already gone.
      }
    }
  }
  if (signal !== undefined) signal.addEventListener('abort', cancel, { once: true })

  try {
    const initialized = await request(rpc, signal, 'initialize', {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    })
    await authenticateIfNeeded(rpc, initialized, signal)
    const session = await request(rpc, signal, 'session/new', { cwd: options.cwd, mcpServers: [] })
    if (typeof session?.sessionId !== 'string' || session.sessionId === '') {
      throw planError('ACP_SESSION', 'ACP 子进程没有返回 sessionId。')
    }
    sessionId = session.sessionId
    if (typeof options.modeId === 'string' && options.modeId !== '') {
      try {
        await request(rpc, signal, 'session/set_mode', { sessionId, modeId: options.modeId })
      } catch (error) {
        if (signal?.aborted) throw error
        // Older adapters have no session mode. Permission rejection still applies.
      }
    }
    const prompted = await request(rpc, signal, 'session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: options.prompt }],
    })
    const stopReason = typeof prompted?.stopReason === 'string' ? prompted.stopReason : 'unknown'
    const ok = stopReason === 'end_turn' && text.value.trim() !== ''
    return { ok, stopReason, text: text.value, permissionDenials }
  } finally {
    if (signal !== undefined) signal.removeEventListener('abort', cancel)
    teardown(child)
  }
}

async function authenticateIfNeeded(rpc, initialized, signal) {
  const methods = Array.isArray(initialized?.authMethods) ? initialized.authMethods : []
  if (methods.length === 0) return
  const cached = methods.find(method => {
    const label = `${method?.id ?? ''} ${method?.name ?? ''}`
    return /cached|existing|login/i.test(label) && !/api[_-]?key/i.test(label)
  })
  if (cached === undefined || typeof cached.id !== 'string') {
    const ids = methods.map(method => method?.id).filter(id => typeof id === 'string')
    throw planError('ACP_AUTH', `ACP 代理要求登录（${ids.join(', ') || '未知方法'}）。先在对应 CLI 里登录。这个插件不保存 API key。`)
  }
  await request(rpc, signal, 'authenticate', { methodId: cached.id })
}

function request(rpc, signal, method, params) {
  return withSignal(rpc.request(method, params), signal)
}

function withSignal(promise, signal) {
  if (signal === undefined) return promise
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function abortError() {
  const error = planError('CANCELLED', 'ACP 调用已取消。')
  error.name = 'AbortError'
  return error
}

function contentText(content) {
  if (Array.isArray(content)) return content.map(contentText).join('')
  if (content && content.type === 'text' && typeof content.text === 'string') return content.text
  return ''
}

function teardown(child) {
  try {
    child.stdin.end()
  } catch {
    // Already closed.
  }
  try {
    child.terminate?.()
  } catch {
    // The subprocess seam owns the real escalation.
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = planError('CANCELLED', 'ACP 调用已取消。')
    error.name = 'AbortError'
    throw error
  }
}

class NdjsonRpc {
  constructor(stdin, stdout) {
    this.stdin = stdin
    this.nextId = 1
    this.pending = new Map()
    this.requests = new Map()
    this.notifications = new Map()
    this.buffer = ''
    this.closed = false
    // Pipe writes fail asynchronously when an adapter closes its input. Catch
    // that event rather than letting EPIPE terminate the host or wait for timeout.
    stdin.on('error', error => this.failAll(error instanceof Error ? error : new Error(String(error))))
    stdout.setEncoding('utf8')
    stdout.on('data', chunk => this.onData(chunk))
    stdout.on('end', () => this.failAll(planError('ACP_CLOSED', 'ACP stdout 已关闭。')))
    stdout.on('error', error => this.failAll(error instanceof Error ? error : new Error(String(error))))
  }

  onRequest(method, handler) {
    this.requests.set(method, handler)
  }

  onNotify(method, handler) {
    this.notifications.set(method, handler)
  }

  request(method, params) {
    if (this.closed) return Promise.reject(planError('ACP_CLOSED', `ACP 连接已关闭，无法调用 ${method}。`))
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.send({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  notify(method, params) {
    this.send({ jsonrpc: '2.0', method, params })
  }

  onData(chunk) {
    if (this.closed) return
    try {
      this.buffer += chunk
      let newline = this.buffer.indexOf('\n')
      while (newline >= 0) {
        if (newline > MAX_ACP_LINE_CHARS) throw planError('ACP_SIZE', 'ACP 单行响应超过大小限制。')
        const line = this.buffer.slice(0, newline).trim()
        this.buffer = this.buffer.slice(newline + 1)
        if (line !== '') this.onLine(line)
        if (this.closed) return
        newline = this.buffer.indexOf('\n')
      }
      if (this.buffer.length > MAX_ACP_LINE_CHARS) throw planError('ACP_SIZE', 'ACP 单行响应超过大小限制。')
    } catch (error) {
      this.failAll(error instanceof Error ? error : planError('ACP_INVALID', 'ACP 响应无效。'))
    }
  }

  onLine(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch (error) {
      this.failAll(error instanceof Error ? error : new Error(String(error)))
      return
    }
    if (message === null || typeof message !== 'object' || Array.isArray(message)
      || message.jsonrpc !== '2.0'
      || (message.id !== undefined && message.id !== null && typeof message.id !== 'string' && !Number.isSafeInteger(message.id))
      || (Object.hasOwn(message, 'method') && typeof message.method !== 'string')
      || (!Object.hasOwn(message, 'method') && !(Object.hasOwn(message, 'id') && (Object.hasOwn(message, 'result') !== Object.hasOwn(message, 'error'))))) {
      this.failAll(planError('ACP_INVALID', 'ACP 响应不是有效的 JSON-RPC 消息。'))
      return
    }
    if (message.id !== undefined && message.id !== null && typeof message.method === 'string') {
      this.answer(message)
      return
    }
    if (message.id !== undefined && message.id !== null && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) {
      const pending = this.pending.get(message.id)
      if (pending === undefined) return
      this.pending.delete(message.id)
      if (Object.hasOwn(message, 'error')) pending.reject(rpcError(message.error))
      else pending.resolve(message.result)
      return
    }
    if (typeof message.method === 'string') {
      const handler = this.notifications.get(message.method)
      if (handler !== undefined) handler(message.params)
    }
  }

  answer(message) {
    const handler = this.requests.get(message.method)
    const responded = handler === undefined
      ? Promise.reject(new Error(`不支持的 ACP 请求：${message.method}`))
      : Promise.resolve(handler(message.params))
    responded.then(
      result => this.send({ jsonrpc: '2.0', id: message.id, result }),
      error => this.send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
      }),
    )
  }

  send(message) {
    if (this.closed) return
    this.stdin.write(`${JSON.stringify(message)}\n`)
  }

  failAll(error) {
    if (this.closed) return
    this.closed = true
    this.buffer = ''
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

function rpcError(error) {
  const message = error && typeof error.message === 'string' ? error.message : 'ACP 请求失败。'
  return planError('ACP_REQUEST', message)
}
