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
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
/** One JSON object frame. */
export type JsonObject = {
    [key: string]: JsonValue;
};
/** Closed ACP method names this client uses, grouped by the peer that serves them. */
export declare const ACP_METHODS: {
    readonly agent: {
        readonly initialize: 'initialize';
        readonly authenticate: 'authenticate';
        readonly sessionNew: 'session/new';
        readonly sessionPrompt: 'session/prompt';
        readonly sessionCancel: 'session/cancel';
        readonly sessionSetConfigOption: 'session/set_config_option';
    };
    readonly client: {
        readonly sessionUpdate: 'session/update';
        readonly requestPermission: 'session/request_permission';
        readonly fsReadTextFile: 'fs/read_text_file';
        readonly fsWriteTextFile: 'fs/write_text_file';
        readonly terminalCreate: 'terminal/create';
        readonly terminalOutput: 'terminal/output';
        readonly terminalWaitForExit: 'terminal/wait_for_exit';
        readonly terminalKill: 'terminal/kill';
        readonly terminalRelease: 'terminal/release';
    };
};
/** Raised when the peer answers a request with a JSON-RPC error frame. */
export declare class AcpRpcError extends Error {
    /** JSON-RPC error code, or 0 when the peer omitted it. */
    readonly code: number;
    /** Optional structured data the peer attached to the error. */
    readonly data: JsonValue | undefined;
    constructor(method: string, code: number, message: string, data: JsonValue | undefined);
}
/** Raised when the peer closes its stdout while requests are still pending. */
export declare class AcpTransportClosedError extends Error {
    constructor(detail: string);
}
/** One inbound request the client must answer. */
export interface AcpRequestContext {
    /** The JSON-RPC method the peer invoked. */
    readonly method: string;
    /** The request params object (`{}` when the peer sent none). */
    readonly params: JsonObject;
}
/** Handler that produces a result for one inbound request. */
export type AcpRequestHandler = (context: AcpRequestContext) => JsonValue | Promise<JsonValue>;
/** Handler for one inbound notification. */
export type AcpNotificationHandler = (context: AcpRequestContext) => void | Promise<void>;
/** Byte streams the client drives. */
export interface AcpWireStreams {
    /** Writable side of the child's stdin. */
    readonly output: {
        write(chunk: string): unknown;
    };
    /** Readable side of the child's stdout. */
    readonly input: {
        on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
        on(event: 'end', listener: () => void): unknown;
        on(event: 'error', listener: (error: Error) => void): unknown;
    };
}
/** Construction options for {@link AcpWire}. */
export interface AcpWireOptions {
    /** The child's byte streams. */
    readonly streams: AcpWireStreams;
    /** Inbound request handler; unknown methods are answered with a JSON-RPC error when omitted. */
    readonly onRequest?: AcpRequestHandler;
    /** Inbound notification handler. */
    readonly onNotification?: AcpNotificationHandler;
    /** Called once when the peer's stdout ends or errors, before pending requests reject. */
    readonly onClose?: (reason: Error) => void;
    /** Maximum bytes buffered for one unterminated line. */
    readonly maxLineBytes?: number;
}
/**
 * One ACP connection over a child process's stdio.
 *
 * The client owns request correlation, the initialize/authenticated handshake,
 * session configuration, permission auto-answering, and clean teardown. It does
 * not own the process; the caller spawns and terminates it.
 */
export declare class AcpWire {
    #private;
    constructor(options: AcpWireOptions);
    /** Whether the connection already closed. */
    get closed(): boolean;
    /** The reason the connection closed, once it did. */
    get closeReason(): Error | undefined;
    /**
     * Send one request and await its response.
     * @param method - the ACP method name.
     * @param params - the params object.
     * @param signal - optional cancellation; aborting rejects locally and sends `$/cancelRequest`.
     * @returns the response `result` value.
     */
    request(method: string, params: JsonObject, signal?: AbortSignal): Promise<JsonValue>;
    /**
     * Send one notification with no response.
     * @param method - the ACP method name.
     * @param params - the params object.
     */
    notify(method: string, params?: JsonObject): void;
    /**
     * Perform the ACP initialize handshake.
     * @param clientInfo - name and version reported to the peer.
     * @param capabilities - optional client capabilities; omitted advertises none.
     * @param signal - cancellation.
     * @returns the peer's `agentCapabilities` object (never `undefined`).
     */
    initialize(clientInfo: {
        name: string;
        version: string;
    }, capabilities?: JsonObject, signal?: AbortSignal): Promise<JsonObject>;
    /**
     * Call `authenticate` for one advertised method id.
     * @param methodId - the id from the peer's advertised `authMethods`.
     * @param signal - cancellation.
     */
    authenticate(methodId: string, signal?: AbortSignal): Promise<void>;
    /**
     * Create a session.
     * @param cwd - absolute working directory for the child session.
     * @param mcpServers - MCP servers to offer (default none).
     * @param signal - cancellation.
     * @returns the session id plus any advertised config options and modes.
     */
    newSession(cwd: string, mcpServers?: JsonValue[], signal?: AbortSignal): Promise<{
        sessionId: string;
        configOptions: JsonObject[];
        modes: JsonObject | undefined;
    }>;
    /**
     * Set one session configuration option, e.g. the model or reasoning effort.
     * @param sessionId - the session to configure.
     * @param configId - the option id from `configOptions`.
     * @param value - the selected option value.
     * @param signal - cancellation.
     */
    setConfigOption(sessionId: string, configId: string, value: string, signal?: AbortSignal): Promise<void>;
    /**
     * Submit one prompt turn and await its terminal stop reason.
     * @param sessionId - the session to prompt.
     * @param prompt - ACP content blocks.
     * @param signal - cancellation.
     * @returns the peer's `stopReason`.
     */
    prompt(sessionId: string, prompt: JsonValue[], signal?: AbortSignal): Promise<string>;
    /**
     * Best-effort cancellation of the running turn.
     * @param sessionId - the session to cancel.
     */
    cancel(sessionId: string): void;
    /** Close the client side; pending requests reject. Idempotent. */
    close(reason?: Error): void;
}
