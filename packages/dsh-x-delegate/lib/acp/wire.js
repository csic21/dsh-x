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
};
/** Raised when the peer answers a request with a JSON-RPC error frame. */
export class AcpRpcError extends Error {
    /** JSON-RPC error code, or 0 when the peer omitted it. */
    code;
    /** Optional structured data the peer attached to the error. */
    data;
    constructor(method, code, message, data) {
        super(`ACP ${method} failed (${code}): ${message}`);
        this.name = 'AcpRpcError';
        this.code = code;
        this.data = data;
    }
}
/** Raised when the peer closes its stdout while requests are still pending. */
export class AcpTransportClosedError extends Error {
    constructor(detail) {
        super(`ACP transport closed: ${detail}`);
        this.name = 'AcpTransportClosedError';
    }
}
/** Default cap for one unterminated protocol line (1 MiB). */
const DEFAULT_MAX_LINE_BYTES = 1024 * 1024;
/** True when a value is a non-null, non-array object. */
function isJsonObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Read a string field from a frame, or `undefined`. */
function stringField(frame, key) {
    const value = frame[key];
    return typeof value === 'string' ? value : undefined;
}
/**
 * One ACP connection over a child process's stdio.
 *
 * The client owns request correlation, the initialize/authenticated handshake,
 * session configuration, permission auto-answering, and clean teardown. It does
 * not own the process; the caller spawns and terminates it.
 */
export class AcpWire {
    #streams;
    #onRequest;
    #onNotification;
    #onClose;
    #maxLineBytes;
    #pending = new Map();
    #buffer = '';
    #nextId = 1;
    #closed = false;
    #closeReason;
    constructor(options) {
        this.#streams = options.streams;
        this.#onRequest = options.onRequest;
        this.#onNotification = options.onNotification;
        this.#onClose = options.onClose;
        this.#maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
        this.#streams.input.on('data', chunk => {
            this.#consume(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
        });
        this.#streams.input.on('end', () => {
            this.#close(new AcpTransportClosedError('the peer closed stdout'));
        });
        this.#streams.input.on('error', error => {
            this.#close(new AcpTransportClosedError(error.message));
        });
    }
    /** Whether the connection already closed. */
    get closed() {
        return this.#closed;
    }
    /** The reason the connection closed, once it did. */
    get closeReason() {
        return this.#closeReason;
    }
    /**
     * Send one request and await its response.
     * @param method - the ACP method name.
     * @param params - the params object.
     * @param signal - optional cancellation; aborting rejects locally and sends `$/cancelRequest`.
     * @returns the response `result` value.
     */
    request(method, params, signal) {
        if (this.#closed) {
            return Promise.reject(this.#closeReason ?? new AcpTransportClosedError('connection already closed'));
        }
        if (signal?.aborted) {
            return Promise.reject(new Error(`ACP ${method} aborted before dispatch`));
        }
        const id = this.#nextId++;
        const promise = new Promise((resolve, reject) => {
            this.#pending.set(id, { method, resolve, reject });
        });
        this.#write({ jsonrpc: '2.0', id, method, params });
        if (signal === undefined)
            return promise;
        const onAbort = () => {
            const pending = this.#pending.get(id);
            if (pending === undefined)
                return;
            this.#pending.delete(id);
            pending.reject(new Error(`ACP ${method} aborted`));
            this.notify('$/cancelRequest', { id });
        };
        signal.addEventListener('abort', onAbort, { once: true });
        return promise.finally(() => {
            signal.removeEventListener('abort', onAbort);
        });
    }
    /**
     * Send one notification with no response.
     * @param method - the ACP method name.
     * @param params - the params object.
     */
    notify(method, params) {
        if (this.#closed)
            return;
        this.#write(params === undefined
            ? { jsonrpc: '2.0', method }
            : { jsonrpc: '2.0', method, params });
    }
    /**
     * Perform the ACP initialize handshake.
     * @param clientInfo - name and version reported to the peer.
     * @param capabilities - optional client capabilities; omitted advertises none.
     * @param signal - cancellation.
     * @returns the peer's `agentCapabilities` object (never `undefined`).
     */
    async initialize(clientInfo, capabilities = {}, signal) {
        const result = await this.request(ACP_METHODS.agent.initialize, {
            protocolVersion: 1,
            clientCapabilities: capabilities,
            clientInfo,
        }, signal);
        if (!isJsonObject(result))
            throw new Error('ACP initialize returned no result object');
        this.notify('initialized');
        const capabilitiesValue = result.agentCapabilities;
        return isJsonObject(capabilitiesValue) ? capabilitiesValue : {};
    }
    /**
     * Call `authenticate` for one advertised method id.
     * @param methodId - the id from the peer's advertised `authMethods`.
     * @param signal - cancellation.
     */
    async authenticate(methodId, signal) {
        await this.request(ACP_METHODS.agent.authenticate, { methodId }, signal);
    }
    /**
     * Create a session.
     * @param cwd - absolute working directory for the child session.
     * @param mcpServers - MCP servers to offer (default none).
     * @param signal - cancellation.
     * @returns the session id plus any advertised config options and modes.
     */
    async newSession(cwd, mcpServers = [], signal) {
        const result = await this.request(ACP_METHODS.agent.sessionNew, { cwd, mcpServers }, signal);
        if (!isJsonObject(result))
            throw new Error('ACP session/new returned no result object');
        const sessionId = stringField(result, 'sessionId');
        if (sessionId === undefined || sessionId.length === 0) {
            throw new Error('ACP session/new returned no session id');
        }
        const rawOptions = result.configOptions;
        const configOptions = Array.isArray(rawOptions) ? rawOptions.filter(isJsonObject) : [];
        const modesValue = result.modes;
        return {
            sessionId,
            configOptions,
            modes: isJsonObject(modesValue) ? modesValue : undefined,
        };
    }
    /**
     * Set one session configuration option, e.g. the model or reasoning effort.
     * @param sessionId - the session to configure.
     * @param configId - the option id from `configOptions`.
     * @param value - the selected option value.
     * @param signal - cancellation.
     */
    async setConfigOption(sessionId, configId, value, signal) {
        await this.request(ACP_METHODS.agent.sessionSetConfigOption, {
            sessionId,
            configId,
            value,
        }, signal);
    }
    /**
     * Submit one prompt turn and await its terminal stop reason.
     * @param sessionId - the session to prompt.
     * @param prompt - ACP content blocks.
     * @param signal - cancellation.
     * @returns the peer's `stopReason`.
     */
    async prompt(sessionId, prompt, signal) {
        const result = await this.request(ACP_METHODS.agent.sessionPrompt, { sessionId, prompt }, signal);
        if (!isJsonObject(result))
            throw new Error('ACP session/prompt returned no result object');
        return stringField(result, 'stopReason') ?? 'unknown';
    }
    /**
     * Best-effort cancellation of the running turn.
     * @param sessionId - the session to cancel.
     */
    cancel(sessionId) {
        this.notify(ACP_METHODS.agent.sessionCancel, { sessionId });
    }
    /** Close the client side; pending requests reject. Idempotent. */
    close(reason = new AcpTransportClosedError('the client closed the connection')) {
        this.#close(reason);
    }
    /** Write one frame as a single line. */
    #write(frame) {
        try {
            this.#streams.output.write(`${JSON.stringify(frame)}\n`);
        }
        catch (error) {
            this.#close(new AcpTransportClosedError(error instanceof Error ? error.message : String(error)));
        }
    }
    /** Split the buffer into lines and dispatch each frame. */
    #consume(text) {
        this.#buffer += text;
        if (this.#buffer.length > this.#maxLineBytes) {
            this.#close(new AcpTransportClosedError(`a protocol line exceeded ${this.#maxLineBytes} bytes`));
            return;
        }
        let index = this.#buffer.indexOf('\n');
        while (index >= 0) {
            const line = this.#buffer.slice(0, index);
            this.#buffer = this.#buffer.slice(index + 1);
            if (line.trim().length > 0)
                this.#dispatchLine(line);
            if (this.#closed)
                return;
            index = this.#buffer.indexOf('\n');
        }
    }
    /** Parse and route one line. Malformed JSON is ignored. */
    #dispatchLine(line) {
        let frame;
        try {
            frame = JSON.parse(line);
        }
        catch {
            return;
        }
        if (!isJsonObject(frame))
            return;
        const id = frame.id;
        const method = stringField(frame, 'method');
        if (method === undefined) {
            this.#settleResponse(id, frame);
            return;
        }
        const params = isJsonObject(frame.params) ? frame.params : {};
        if (typeof id === 'number' || typeof id === 'string') {
            void this.#serveRequest(id, method, params);
            return;
        }
        this.#serveNotification(method, params);
    }
    /** Resolve or reject one pending request from a response frame. */
    #settleResponse(id, frame) {
        if (typeof id !== 'number')
            return;
        const pending = this.#pending.get(id);
        if (pending === undefined)
            return;
        this.#pending.delete(id);
        const error = frame.error;
        if (isJsonObject(error)) {
            pending.reject(new AcpRpcError(pending.method, typeof error.code === 'number' ? error.code : 0, typeof error.message === 'string' ? error.message : 'unknown error', error.data));
            return;
        }
        pending.resolve(frame.result ?? null);
    }
    /** Answer one inbound request, converting handler failures into error frames. */
    async #serveRequest(id, method, params) {
        const handler = this.#onRequest;
        if (handler === undefined) {
            this.#write({
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `method not supported by this client: ${method}` },
            });
            return;
        }
        try {
            const result = await handler({ method, params });
            this.#write({ jsonrpc: '2.0', id, result });
        }
        catch (error) {
            this.#write({
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: error instanceof Error ? error.message : String(error),
                },
            });
        }
    }
    /** Dispatch one notification, containing handler failures. */
    #serveNotification(method, params) {
        const handler = this.#onNotification;
        if (handler === undefined)
            return;
        try {
            void handler({ method, params });
        }
        catch {
            // A notification sink cannot fail the transport.
        }
    }
    /** Mark closed, reject pending requests, and notify once. */
    #close(reason) {
        if (this.#closed)
            return;
        this.#closed = true;
        this.#closeReason = reason;
        for (const pending of this.#pending.values())
            pending.reject(reason);
        this.#pending.clear();
        try {
            this.#onClose?.(reason);
        }
        catch {
            // A close sink cannot fail the transport.
        }
    }
}
