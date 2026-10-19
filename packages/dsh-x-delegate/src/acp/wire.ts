/**
 * Minimal Agent Client Protocol (ACP) client over newline-delimited JSON-RPC.
 *
 * The official `@deepseek-ai/dsh-subagent-acp` provider depends on
 * `@agentclientprotocol/sdk`, which is not carried by the DSH installation and
 * whose client never calls `authenticate` or `session/set_config_option`. This
 * module owns the same framing with no third-party dependency, so the delegate
 * plugin installs from this repository alone.
 *
 * Wire contract: one JSON object per line, `jsonrpc: "2.0"`. A frame with
 * `id` + `method` is a request, `id` alone is a response, `method` alone is a
 * notification. Malformed lines are ignored; an unparseable line never kills
 * the session.
 *
 * @module dsh-x-delegate/acp/wire
 */

/** One JSON value on the wire. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** One JSON object frame. */
export type JsonObject = { [key: string]: JsonValue }

/** Closed ACP method names this client uses, grouped by the peer that serves them. */
export const ACP_METHODS = {
  agent: {
    initialize: 'initialize',
    authenticate: 'authenticate',
    sessionNew: 'session/new',
    sessionPrompt: 'session/prompt',
    sessionCancel: 'session/cancel',
    sessionSetConfigOption: 'session/set_config_option',
  },
  client: {
    sessionUpdate: 'session/update',
    requestPermission: 'session/request_permission',
    fsReadTextFile: 'fs/read_text_file',
    fsWriteTextFile: 'fs/write_text_file',
    terminalCreate: 'terminal/create',
    terminalOutput: 'terminal/output',
    terminalWaitForExit: 'terminal/wait_for_exit',
    terminalKill: 'terminal/kill',
    terminalRelease: 'terminal/release',
  },
} as const

/** Raised when the peer answers a request with a JSON-RPC error frame. */
export class AcpRpcError extends Error {
  /** JSON-RPC error code, or 0 when the peer omitted it. */
  readonly code: number
  /** Optional structured data the peer attached to the error. */
  readonly data: JsonValue | undefined

  constructor(method: string, code: number, message: string, data: JsonValue | undefined) {
    super(`ACP ${method} failed (${code}): ${message}`)
    this.name = 'AcpRpcError'
    this.code = code
    this.data = data
  }
}

/** Raised when the peer closes its stdout while requests are still pending. */
export class AcpTransportClosedError extends Error {
  constructor(detail: string) {
    super(`ACP transport closed: ${detail}`)
    this.name = 'AcpTransportClosedError'
  }
}

/** One inbound request the client must answer. */
export interface AcpRequestContext {
  /** The JSON-RPC method the peer invoked. */
  readonly method: string
  /** The request params object (`{}` when the peer sent none). */
  readonly params: JsonObject
}

/** Handler that produces a result for one inbound request. */
export type AcpRequestHandler = (context: AcpRequestContext) => JsonValue | Promise<JsonValue>

/** Handler for one inbound notification. */
export type AcpNotificationHandler = (context: AcpRequestContext) => void | Promise<void>

/** Byte streams the client drives. */
export interface AcpWireStreams {
  /** Writable side of the child's stdin. */
  readonly output: { write(chunk: string): unknown }
  /** Readable side of the child's stdout. */
  readonly input: {
    on(event: 'data', listener: (chunk: Buffer | string) => void): unknown
    on(event: 'end', listener: () => void): unknown
    on(event: 'error', listener: (error: Error) => void): unknown
  }
}

/** Construction options for {@link AcpWire}. */
export interface AcpWireOptions {
  /** The child's byte streams. */
  readonly streams: AcpWireStreams
  /** Inbound request handler; unknown methods are answered with a JSON-RPC error when omitted. */
  readonly onRequest?: AcpRequestHandler
  /** Inbound notification handler. */
  readonly onNotification?: AcpNotificationHandler
  /** Called once when the peer's stdout ends or errors, before pending requests reject. */
  readonly onClose?: (reason: Error) => void
  /** Maximum bytes buffered for one unterminated line. */
  readonly maxLineBytes?: number
}

/** Default cap for one unterminated protocol line (1 MiB). */
const DEFAULT_MAX_LINE_BYTES = 1024 * 1024

interface PendingRequest {
  readonly method: string
  readonly resolve: (value: JsonValue) => void
  readonly reject: (error: Error) => void
}

/** True when a value is a non-null, non-array object. */
function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Read a string field from a frame, or `undefined`. */
function stringField(frame: JsonObject, key: string): string | undefined {
  const value = frame[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * One ACP connection over a child process's stdio.
 *
 * The client owns request correlation, the initialize/authenticated handshake,
 * session configuration, permission auto-answering, and clean teardown. It does
 * not own the process; the caller spawns and terminates it.
 */
export class AcpWire {
  readonly #streams: AcpWireStreams
  readonly #onRequest: AcpRequestHandler | undefined
  readonly #onNotification: AcpNotificationHandler | undefined
  readonly #onClose: ((reason: Error) => void) | undefined
  readonly #maxLineBytes: number
  readonly #pending = new Map<number, PendingRequest>()
  #buffer = ''
  #nextId = 1
  #closed = false
  #closeReason: Error | undefined

  constructor(options: AcpWireOptions) {
    this.#streams = options.streams
    this.#onRequest = options.onRequest
    this.#onNotification = options.onNotification
    this.#onClose = options.onClose
    this.#maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES
    this.#streams.input.on('data', chunk => {
      this.#consume(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    })
    this.#streams.input.on('end', () => {
      this.#close(new AcpTransportClosedError('the peer closed stdout'))
    })
    this.#streams.input.on('error', error => {
      this.#close(new AcpTransportClosedError(error.message))
    })
  }

  /** Whether the connection already closed. */
  get closed(): boolean {
    return this.#closed
  }

  /** The reason the connection closed, once it did. */
  get closeReason(): Error | undefined {
    return this.#closeReason
  }

  /**
   * Send one request and await its response.
   * @param method - the ACP method name.
   * @param params - the params object.
   * @param signal - optional cancellation; aborting rejects locally and sends `$/cancelRequest`.
   * @returns the response `result` value.
   */
  request(method: string, params: JsonObject, signal?: AbortSignal): Promise<JsonValue> {
    if (this.#closed) {
      return Promise.reject(this.#closeReason ?? new AcpTransportClosedError('connection already closed'))
    }
    if (signal?.aborted) {
      return Promise.reject(new Error(`ACP ${method} aborted before dispatch`))
    }
    const id = this.#nextId++
    const promise = new Promise<JsonValue>((resolve, reject) => {
      this.#pending.set(id, { method, resolve, reject })
    })
    this.#write({ jsonrpc: '2.0', id, method, params })
    if (signal === undefined) return promise
    const onAbort = (): void => {
      const pending = this.#pending.get(id)
      if (pending === undefined) return
      this.#pending.delete(id)
      pending.reject(new Error(`ACP ${method} aborted`))
      this.notify('$/cancelRequest', { id })
    }
    signal.addEventListener('abort', onAbort, { once: true })
    return promise.finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  }

  /**
   * Send one notification with no response.
   * @param method - the ACP method name.
   * @param params - the params object.
   */
  notify(method: string, params?: JsonObject): void {
    if (this.#closed) return
    this.#write(params === undefined
      ? { jsonrpc: '2.0', method }
      : { jsonrpc: '2.0', method, params })
  }

  /**
   * Perform the ACP initialize handshake.
   * @param clientInfo - name and version reported to the peer.
   * @param capabilities - optional client capabilities; omitted advertises none.
   * @param signal - cancellation.
   * @returns the peer's `agentCapabilities` object (never `undefined`).
   */
  async initialize(
    clientInfo: { name: string, version: string },
    capabilities: JsonObject = {},
    signal?: AbortSignal,
  ): Promise<JsonObject> {
    const result = await this.request(ACP_METHODS.agent.initialize, {
      protocolVersion: 1,
      clientCapabilities: capabilities,
      clientInfo,
    }, signal)
    if (!isJsonObject(result)) throw new Error('ACP initialize returned no result object')
    this.notify('initialized')
    const capabilitiesValue = result.agentCapabilities
    return isJsonObject(capabilitiesValue) ? capabilitiesValue : {}
  }

  /**
   * Call `authenticate` for one advertised method id.
   * @param methodId - the id from the peer's advertised `authMethods`.
   * @param signal - cancellation.
   */
  async authenticate(methodId: string, signal?: AbortSignal): Promise<void> {
    await this.request(ACP_METHODS.agent.authenticate, { methodId }, signal)
  }

  /**
   * Create a session.
   * @param cwd - absolute working directory for the child session.
   * @param mcpServers - MCP servers to offer (default none).
   * @param signal - cancellation.
   * @returns the session id plus any advertised config options and modes.
   */
  async newSession(
    cwd: string,
    mcpServers: JsonValue[] = [],
    signal?: AbortSignal,
  ): Promise<{ sessionId: string, configOptions: JsonObject[], modes: JsonObject | undefined }> {
    const result = await this.request(ACP_METHODS.agent.sessionNew, { cwd, mcpServers }, signal)
    if (!isJsonObject(result)) throw new Error('ACP session/new returned no result object')
    const sessionId = stringField(result, 'sessionId')
    if (sessionId === undefined || sessionId.length === 0) {
      throw new Error('ACP session/new returned no session id')
    }
    const rawOptions = result.configOptions
    const configOptions = Array.isArray(rawOptions) ? rawOptions.filter(isJsonObject) : []
    const modesValue = result.modes
    return {
      sessionId,
      configOptions,
      modes: isJsonObject(modesValue) ? modesValue : undefined,
    }
  }

  /**
   * Set one session configuration option, e.g. the model or reasoning effort.
   * @param sessionId - the session to configure.
   * @param configId - the option id from `configOptions`.
   * @param value - the selected option value.
   * @param signal - cancellation.
   */
  async setConfigOption(
    sessionId: string,
    configId: string,
    value: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.request(ACP_METHODS.agent.sessionSetConfigOption, {
      sessionId,
      configId,
      value,
    }, signal)
  }

  /**
   * Submit one prompt turn and await its terminal stop reason.
   * @param sessionId - the session to prompt.
   * @param prompt - ACP content blocks.
   * @param signal - cancellation.
   * @returns the peer's `stopReason`.
   */
  async prompt(sessionId: string, prompt: JsonValue[], signal?: AbortSignal): Promise<string> {
    const result = await this.request(ACP_METHODS.agent.sessionPrompt, { sessionId, prompt }, signal)
    if (!isJsonObject(result)) throw new Error('ACP session/prompt returned no result object')
    return stringField(result, 'stopReason') ?? 'unknown'
  }

  /**
   * Best-effort cancellation of the running turn.
   * @param sessionId - the session to cancel.
   */
  cancel(sessionId: string): void {
    this.notify(ACP_METHODS.agent.sessionCancel, { sessionId })
  }

  /** Close the client side; pending requests reject. Idempotent. */
  close(reason: Error = new AcpTransportClosedError('the client closed the connection')): void {
    this.#close(reason)
  }

  /** Write one frame as a single line. */
  #write(frame: JsonObject): void {
    try {
      this.#streams.output.write(`${JSON.stringify(frame)}\n`)
    } catch (error) {
      this.#close(new AcpTransportClosedError(error instanceof Error ? error.message : String(error)))
    }
  }

  /** Split the buffer into lines and dispatch each frame. */
  #consume(text: string): void {
    this.#buffer += text
    if (this.#buffer.length > this.#maxLineBytes) {
      this.#close(new AcpTransportClosedError(`a protocol line exceeded ${this.#maxLineBytes} bytes`))
      return
    }
    let index = this.#buffer.indexOf('\n')
    while (index >= 0) {
      const line = this.#buffer.slice(0, index)
      this.#buffer = this.#buffer.slice(index + 1)
      if (line.trim().length > 0) this.#dispatchLine(line)
      if (this.#closed) return
      index = this.#buffer.indexOf('\n')
    }
  }

  /** Parse and route one line. Malformed JSON is ignored. */
  #dispatchLine(line: string): void {
    let frame: JsonValue
    try {
      frame = JSON.parse(line) as JsonValue
    } catch {
      return
    }
    if (!isJsonObject(frame)) return
    const id = frame.id
    const method = stringField(frame, 'method')
    if (method === undefined) {
      this.#settleResponse(id, frame)
      return
    }
    const params = isJsonObject(frame.params) ? frame.params : {}
    if (typeof id === 'number' || typeof id === 'string') {
      void this.#serveRequest(id, method, params)
      return
    }
    this.#serveNotification(method, params)
  }

  /** Resolve or reject one pending request from a response frame. */
  #settleResponse(id: JsonValue | undefined, frame: JsonObject): void {
    if (typeof id !== 'number') return
    const pending = this.#pending.get(id)
    if (pending === undefined) return
    this.#pending.delete(id)
    const error = frame.error
    if (isJsonObject(error)) {
      pending.reject(new AcpRpcError(
        pending.method,
        typeof error.code === 'number' ? error.code : 0,
        typeof error.message === 'string' ? error.message : 'unknown error',
        error.data,
      ))
      return
    }
    pending.resolve(frame.result ?? null)
  }

  /** Answer one inbound request, converting handler failures into error frames. */
  async #serveRequest(id: number | string, method: string, params: JsonObject): Promise<void> {
    const handler = this.#onRequest
    if (handler === undefined) {
      this.#write({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `method not supported by this client: ${method}` },
      })
      return
    }
    try {
      const result = await handler({ method, params })
      this.#write({ jsonrpc: '2.0', id, result })
    } catch (error) {
      this.#write({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  /** Dispatch one notification, containing handler failures. */
  #serveNotification(method: string, params: JsonObject): void {
    const handler = this.#onNotification
    if (handler === undefined) return
    try {
      void handler({ method, params })
    } catch {
      // A notification sink cannot fail the transport.
    }
  }

  /** Mark closed, reject pending requests, and notify once. */
  #close(reason: Error): void {
    if (this.#closed) return
    this.#closed = true
    this.#closeReason = reason
    for (const pending of this.#pending.values()) pending.reject(reason)
    this.#pending.clear()
    try {
      this.#onClose?.(reason)
    } catch {
      // A close sink cannot fail the transport.
    }
  }
}
