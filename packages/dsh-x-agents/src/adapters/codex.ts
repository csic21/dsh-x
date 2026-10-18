import type { NativeDiscovery } from '../types.ts'
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { CodexRpc, abortable, cleanupCodexChild, deferred, failure } from './codex-rpc.ts';

// Stable v2 wire names follow openai/codex's generated JSON schemas, rather
// than prose examples. No experimental API, login, or credential API is used.
const CAPABILITIES = Object.freeze({ nativeSessions: true, resume: true, streaming: true, tools: true, plans: true,
  permissions: true, input: true, usage: true, cancel: true, models: true, authDiscovery: true,
  permissionScopes: ['once'], limitations: ['Sensitive credential input, persistent permission grants, and MCP elicitation are unsupported.'] });
const DEFAULTS = { executable: 'codex', graceMs: 3000, cleanupTimeoutMs: 15000, requestTimeoutMs: 15000, maxFrameBytes: 4194304, maxQueuedEvents: 4096, maxQueuedBytes: 16777216 };
const APPROVAL_METHODS = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']);

function object(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('Codex returned invalid response data.');
  return value;
}

function id(value: any) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024) throw failure('Codex returned an invalid identifier.');
  return value;
}

function inside(root: any, cwd: any) {
  const part = relative(root, cwd);
  return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

function safeText(text: any) {
  return text.replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[redacted]')
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[redacted]')
    .replace(/(\b[A-Z_]*(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|ID_TOKEN|PRIVATE_KEY|PASSWORD|SECRET|CREDENTIAL|COOKIE)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]');
}

function safeData(value: any, depth = 0) : any {
  if (depth > 40) return '[nested data omitted]';
  if (typeof value === 'string') return safeText(value);
  if (Array.isArray(value)) return value.map(item => safeData(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item !== 'boolean' && /api.?key|password|secret|credential|authorization|cookie|(?:access|refresh|auth|id).?token|^env(?:ironment)?$|encrypted_content/i.test(key)
      ? '[redacted]' : safeData(item, depth + 1)]));
}

function settings(config: any) {
  const result: Record<string, any> = { ...DEFAULTS, ...config };
  if (typeof result.executable !== 'string' || !result.executable.trim() || /[\0\r\n]/.test(result.executable)) throw new TypeError('A Codex executable is required.');
  for (const key of ['graceMs', 'cleanupTimeoutMs', 'requestTimeoutMs', 'maxFrameBytes', 'maxQueuedEvents', 'maxQueuedBytes']) {
    if (!Number.isSafeInteger(result[key]) || result[key] <= 0 || result[key] > 2147483647) throw new TypeError(`Invalid Codex ${key}.`);
  }
  if (config.sandbox !== undefined || config.approvalPolicy !== undefined || config.args !== undefined) throw new TypeError('Codex sandbox and approval settings are owned by the host policy.');
  result.codexHome = config.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), '.codex');
  if (typeof result.codexHome !== 'string' || !isAbsolute(result.codexHome) || /[\0\r\n]/.test(result.codexHome)) throw new TypeError('Codex native home must be an absolute directory.');
  if (safeText(result.codexHome) !== result.codexHome || safeText(result.executable) !== result.executable) throw new TypeError('Codex routing settings must not contain credential-shaped data.');
  result.searchPath = isAbsolute(result.executable) ? null : process.env.PATH ?? '';
  if (result.searchPath != null && safeText(result.searchPath) !== result.searchPath) throw new TypeError('Codex executable lookup paths must not contain credential-shaped data.');
  return result;
}

function spec(config: any, cwd: any, version = false, signal: any) {
  return { argv: [config.executable, ...(version ? ['--version'] : ['app-server'])], cwd,
    stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs: config.graceMs,
    env: { CODEX_HOME: config.codexHome, ...(config.searchPath != null ? { PATH: config.searchPath } : {}) }, ...(signal ? { signal } : {}) };
}

async function initialize(wire: any, signal: any) {
  object(await wire.request('initialize', {
    clientInfo: { name: 'dsh_x_agents', title: 'DSH-X Agents', version: '0.1.0' },
    capabilities: { experimentalApi: false, requestAttestation: false },
  }, signal));
  await wire.notify('initialized', {}, signal);
}

async function versionOf(spawn: any, config: any, cwd: any, signal: any) {
  const child = await spawn(spec(config, cwd, true, signal));
  let text = '';
  const collect = (chunk: any) => { if (text.length < 8192) text += String(chunk).slice(0, 8192 - text.length); };
  const ignore = () => {};
  child.stdout?.on('data', collect);
  child.stdout?.on('error', ignore);
  child.stderr?.on('data', ignore);
  child.stderr?.on('error', ignore);
  child.stdin?.on('error', ignore);
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), config.requestTimeoutMs);
  try {
    const outcome = await abortable(abortable(child.done, timeout.signal), signal);
    await new Promise<any>(resolve => setImmediate(resolve));
    if (outcome.exitCode !== 0) throw failure('The installed Codex CLI did not report its version.');
    const match = /^codex(?:-cli)?\s+(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/m.exec(text.trim());
    if (!match) throw failure('The installed executable is not a recognized Codex CLI.');
    return match[1];
  } finally {
    clearTimeout(timer);
    child.stdout?.off('data', collect);
    child.stderr?.off('data', ignore);
    await cleanupCodexChild(child, null, config.cleanupTimeoutMs);
  }
}

/**
 * Create a native Codex app-server adapter. `spawn` must own the entire process
 * range; the host additionally confines run processes to its effective policy.
 * Discovery uses the same injected policy and never starts a model turn.
 */
export function createCodexAdapter({ spawn, config = {} }: any = {}) {
  if (typeof spawn !== 'function') throw new TypeError('Codex requires the managed subprocess spawn service.');
  const options = settings(config);
  const backendIdentity = JSON.stringify({ runtime: 'codex', transport: 'app-server-stdio-v2', executable: options.executable,
    codexHome: options.codexHome, searchPath: options.searchPath, approvalPolicy: 'on-request', sandboxCeiling: 'workspace-write' });

  async function discover({ cwd, signal }: any = {}) {
    let version: any = null, child, wire;
    const result: NativeDiscovery = { available: false, version, authenticated: null, models: [], capabilities: CAPABILITIES };
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) return { ...result, reason: 'Choose an absolute workspace folder before checking Codex.' };
    try {
      version = await versionOf(spawn, options, cwd, signal);
      result.version = version;
      child = await spawn(spec(options, cwd, false, signal));
      wire = new CodexRpc(child, { ...options, onNotification: async () => {}, onRequest: async () => { throw failure('Codex requested an unsupported action during discovery.'); } });
      await initialize(wire, signal);
      result.available = true;
      try {
        const account = object(await wire.request('account/read', { refreshToken: false }, signal));
        if (account.account === null && account.requiresOpenaiAuth === true) result.authenticated = false;
        else if (account.account && ['apiKey', 'chatgpt'].includes(account.account.type)) result.authenticated = true;
      } catch {
        if (signal?.aborted) throw failure('Codex discovery cancelled.', 'ABORT_ERR');
        result.reason = 'Codex is installed, but its account state could not be verified.';
      }
      const cursors = new Set<any>();
      let cursor;
      try {
        do {
          const models = object(await wire.request('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) }, signal));
          if (!Array.isArray(models.data) || models.data.length > 100) throw failure('Invalid Codex model list.');
          for (const model of models.data) {
            const modelId = id(model.model ?? model.id);
            if (model.displayName != null && (typeof model.displayName !== 'string' || model.displayName.length > 1024)) throw failure('Invalid Codex model label.');
            if (!result.models.some(item => item.id === modelId)) result.models.push({ id: modelId, label: typeof model.displayName === 'string' ? safeText(model.displayName) : modelId });
          }
          cursor = models.nextCursor;
          if (cursor != null) {
            id(cursor);
            if (cursors.has(cursor) || cursors.size >= 20) throw failure('Invalid Codex model pagination.');
            cursors.add(cursor);
          }
        } while (cursor != null);
      } catch {
        if (signal?.aborted) throw failure('Codex discovery cancelled.', 'ABORT_ERR');
        result.reason ??= 'Codex is installed, but its model list could not be verified.';
        result.models = [];
        result.modelCatalog = { status: 'failed', source: 'native-discovery', error: 'Native model pagination or catalog validation failed.' };
      }
      if (result.authenticated === false) result.reason = 'Sign in using the official Codex CLI, then check again.';
      else if (result.authenticated === null) result.reason ??= 'Codex account authentication is unknown; no login or model request was attempted.';
      return result;
    } catch (error: any) {
      if (error?.code === 'AGENTS_CLEANUP_UNCONFIRMED') throw error;
      return { ...result, available: false, reason: signal?.aborted ? 'Codex discovery cancelled.' : 'Codex CLI or its app-server protocol is unavailable. Check the installed official CLI.' };
    } finally {
      if (child) await cleanupCodexChild(child, wire, options.cleanupTimeoutMs);
    }
  }

  async function run({ prompt, model, cwd, nativeSessionId, sandboxPolicy, signal, onEvent, requestPermission, requestInput }: any = {}) {
    let sessionId = nativeSessionId ?? null;
    const result = (status: any, summary = '', reason?: any, usage?: any) => ({ nativeSessionId: sessionId, status, summary, ...(reason ? { reason } : {}), ...(usage ? { usage } : {}) });
    if (signal?.aborted) return result('cancelled');
    if (typeof prompt !== 'string' || !prompt.trim()) return result('blocked', '', 'A nonempty Codex prompt is required.');
    if (nativeSessionId != null) id(nativeSessionId);
    if (model != null && (typeof model !== 'string' || !model.trim())) return result('blocked', '', 'Choose a valid Codex model.');
    if (!sandboxPolicy || !['read-only', 'workspace-write', 'danger-full-access'].includes(sandboxPolicy.mode)
      || typeof sandboxPolicy.workspaceRoot !== 'string' || !isAbsolute(sandboxPolicy.workspaceRoot)
      || typeof cwd !== 'string' || !isAbsolute(cwd) || !inside(sandboxPolicy.workspaceRoot, cwd)) {
      return result('blocked', '', 'Codex requires a host sandbox policy and a folder inside its workspace.');
    }
    const mode = sandboxPolicy.mode === 'read-only' ? 'read-only' : 'workspace-write';
    const nativePolicy = mode === 'read-only' ? { type: 'readOnly', networkAccess: false }
      : { type: 'workspaceWrite', writableRoots: [sandboxPolicy.workspaceRoot], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true };
    const operation = new AbortController();
    const epoch = randomUUID();
    const completed = deferred(), turnReady = deferred(), blocked = deferred();
    const pendingPermissions = new Map<any, any>();
    const activeItems = new Map<any, any>();
    let activeItemBytes = 0;
    let child, wire: any, turnId: any, startingTurn = false, terminal = false, blockReason: any, usage;
    let finalAnswer: any, partialAnswer: any, unphasedAnswer: any, lastDelta = '';
    const emit = async (event: any) => {
      if (operation.signal.aborted) return;
      if (onEvent) await abortable(Promise.resolve().then(() => onEvent(safeData(event))), operation.signal);
    };
    const summary = () => safeText(finalAnswer ?? partialAnswer ?? unphasedAnswer ?? lastDelta);
    const block = async (reason: any) => {
      blockReason ??= reason;
      await emit({ type: 'status', text: reason, data: { status: 'blocked' } });
    };
    const interrupt = () => {
      if (wire && sessionId && turnId && !terminal && !wire.closed) {
        void wire.request('turn/interrupt', { threadId: sessionId, turnId }).catch(() => {});
      }
    };
    const cancel = () => { interrupt(); operation.abort(); };
    signal?.addEventListener('abort', cancel, { once: true });
    const matches = async (params: any, requireItem = false, nullableTurn = false) => {
      if (params.threadId !== sessionId || !startingTurn) throw failure('Codex request referenced an inactive thread.');
      if (!turnId) await abortable(turnReady.promise, operation.signal);
      if ((!nullableTurn || params.turnId != null) && params.turnId !== turnId || terminal) throw failure('Codex request referenced an inactive turn.');
      if (requireItem) id(params.itemId);
    };
    const notification = async (method: any, params: any) => {
      if (method === 'serverRequest/resolved') {
        if (params.threadId !== sessionId) return;
        wire.invalidateRequest(params.requestId);
        const pending = pendingPermissions.get(params.requestId);
        pending?.controller.abort();
        await emit({ type: pending?.type ?? 'permission', data: { id: pending?.id, nativeRequestId: params.requestId, status: 'resolved' } });
        return;
      }
      if (params.threadId !== sessionId || !startingTurn || terminal) return;
      const eventTurnId = params.turnId ?? params.turn?.id;
      if ((method.startsWith('item/') || method.startsWith('turn/')) && eventTurnId == null) throw failure('Codex turn event is missing its turn identity.');
      if (eventTurnId != null) {
        if (!turnId) await abortable(turnReady.promise, operation.signal);
        if (eventTurnId !== turnId) return;
      }
      const data = { ...params, method };
      if (method === 'turn/completed') {
        const status = object(params.turn).status;
        if (!['completed', 'failed', 'interrupted'].includes(status)) throw failure('Codex returned an invalid terminal status.');
        terminal = true;
        for (const [requestId, pending] of pendingPermissions) { wire.invalidateRequest(requestId); pending.controller.abort(); }
        await emit({ type: 'status', data: { ...data, status, nativeTurnId: turnId } });
        completed.resolve(status);
      } else if (method === 'item/agentMessage/delta') {
        if (typeof params.delta !== 'string') throw failure('Codex returned an invalid assistant delta.');
        // Only the latest streamed message is a fallback summary; completed
        // agentMessage items are authoritative and do not duplicate deltas.
        lastDelta = (lastDelta + params.delta).slice(-options.maxFrameBytes);
        await emit({ type: 'assistant', text: params.delta, data: { ...data, messageId: params.itemId, delta: true } });
      } else if (method === 'item/started' || method === 'item/completed') {
        const item = object(params.item);
        id(item.id);
        if (method === 'item/started') {
          if (activeItems.size >= options.maxQueuedEvents) throw failure('Codex active item limit exceeded.');
          if (activeItems.has(item.id)) activeItemBytes -= Buffer.byteLength(JSON.stringify(activeItems.get(item.id)));
          activeItemBytes += Buffer.byteLength(JSON.stringify(item));
          if (activeItemBytes > options.maxQueuedBytes) throw failure('Codex active item data exceeds its memory budget.');
          activeItems.set(item.id, item);
        } else if (activeItems.has(item.id)) {
          activeItemBytes -= Buffer.byteLength(JSON.stringify(activeItems.get(item.id)));
          activeItems.delete(item.id);
        }
        if (item.type === 'agentMessage') {
          if (typeof item.text !== 'string') throw failure('Codex returned an invalid assistant item.');
          if (method === 'item/started') lastDelta = '';
          if (method === 'item/completed') {
            if (item.phase === 'final_answer') finalAnswer = item.text;
            else if (item.phase === 'partial_answer') partialAnswer = item.text;
            else if (item.phase == null) unphasedAnswer = item.text;
          }
          await emit({ type: 'assistant', text: item.text, data: { ...data, messageId: item.id, delta: false } });
        } else if (item.type === 'plan') await emit({ type: 'plan', text: item.text, data });
        else if (item.type === 'reasoning') {
          // Raw reasoning blocks are not published; documented summaries are.
          await emit({ type: 'diagnostic', data: { method, threadId: sessionId, turnId, item: { id: item.id, type: item.type, summary: item.summary } } });
        } else if (item.type !== 'userMessage') await emit({ type: 'tool', data });
      } else if (method === 'turn/plan/updated' || method === 'item/plan/delta') {
        await emit({ type: 'plan', text: params.delta ?? params.explanation, data });
      } else if (method === 'thread/tokenUsage/updated') {
        usage = safeData(params.tokenUsage ?? params.usage ?? {});
        await emit({ type: 'usage', data: usage });
      } else if (method.startsWith('item/') && !method.startsWith('item/reasoning/')) {
        await emit({ type: 'tool', text: typeof params.delta === 'string' ? params.delta : undefined, data });
      } else if (method.startsWith('turn/') || method.startsWith('thread/') || method.startsWith('hook/')) {
        await emit({ type: 'status', data });
      } else if (method === 'error' || method === 'warning' || method === 'model/rerouted' || method === 'model/verification') {
        await emit({ type: 'diagnostic', data });
      }
    };
    const collectInput = async (requestId: any, params: any) => {
      const unsupported = async (reason: any) => {
        await block(reason);
        await emit({ type: 'input', text: reason, data: { status: 'unsupported', nativeRequestId: requestId } });
        return { answers: {} };
      };
      if (!requestInput) return unsupported('Codex requested interactive input, but no host input handler is available.');
      if (!Array.isArray(params.questions) || !params.questions.length || params.questions.length > 3) return unsupported('Codex returned an unsupported question format.');
      const questionIds = new Set<any>();
      const secretPattern = /password|api[\s_-]*key|access[\s_-]*token|refresh[\s_-]*token|secret|credential|sign[\s-]*in|log[\s-]*in|verification code|one[\s-]*time code|验证码|密码|密钥|令牌/i;
      const questions: any[] = [];
      for (const question of params.questions) {
        if (!question || typeof question.question !== 'string' || !question.question.trim() || typeof question.id !== 'string' || !question.id || questionIds.has(question.id)) return unsupported('Codex returned an unsupported question format.');
        questionIds.add(question.id);
        if (question.isSecret || secretPattern.test(`${question.header ?? ''} ${question.question}`)) return unsupported('Codex requested sensitive sign-in or credential input. Use the official Codex client to handle it securely.');
        if (JSON.stringify(safeData(question)) !== JSON.stringify(question)) return unsupported('Codex question details contained sensitive data and could not be shown completely. Use the official client.');
        if (question.options != null && (!Array.isArray(question.options) || question.options.length > 20
          || question.options.some((option: any) => !option || typeof option.label !== 'string' || !option.label.trim() || (option.description != null && typeof option.description !== 'string'))
          || new Set(question.options.map((option: any) => option.label)).size !== question.options.length)) return unsupported('Codex returned unsupported question options.');
        questions.push({ id: question.id, question: question.question, ...(typeof question.header === 'string' ? { header: question.header } : {}),
          ...(question.options ? { options: question.options.map((option: any) => ({ label: option.label, ...(option.description != null ? { description: option.description } : {}) })) } : {}), multiSelect: false });
      }
      const controller = new AbortController();
      const request: Record<string, any> = { id: `codex:${epoch}:${typeof requestId}:${requestId}`, nativeSessionId: sessionId, title: 'Codex needs your input', questions,
        signal: controller.signal, details: { nativeSessionId: sessionId, turnId, itemId: params.itemId, nativeRequestId: requestId, connectionEpoch: epoch } };
      pendingPermissions.set(requestId, { id: request.id, controller, type: 'input' });
      try {
        await emit({ type: 'input', data: { id: request.id, title: request.title, questions, details: request.details, status: 'pending' } });
        let answer;
        try { answer = await abortable(abortable(Promise.resolve().then(() => requestInput(request)), controller.signal), operation.signal); }
        catch { answer = null; }
        if (controller.signal.aborted || operation.signal.aborted || terminal) return { answers: {} };
        if (!answer || !Array.isArray(answer.answers) || answer.answers.length !== questions.length) return unsupported('Codex input was cancelled or incomplete. No answer was invented.');
        const answers = Object.create(null);
        for (const item of answer.answers) {
          const question = params.questions.find((question: any) => question.id === item?.id);
          if (!question || Object.hasOwn(answers, item.id) || !Array.isArray(item.selected) || item.selected.length > 1 || item.selected.some((label: any) => typeof label !== 'string' || !question.options?.some((option: any) => option.label === label))
            || item.custom != null && (typeof item.custom !== 'string' || question.options?.length && !question.isOther)) return unsupported('The host returned an unsupported Codex answer.');
          const values = [...item.selected, ...(item.custom?.trim() ? [item.custom] : [])];
          if (values.length !== 1 || values.some(value => safeText(value) !== value)) return unsupported('Codex input was empty, ambiguous, or contained credential-shaped data. Use the official client for secure input.');
          answers[item.id] = { answers: values };
        }
        return { answers };
      } finally { pendingPermissions.delete(requestId); }
    };
    const serverRequest = async ({ id: requestId, method, params }: any) => {
      const known = APPROVAL_METHODS.has(method) || ['item/tool/requestUserInput', 'item/permissions/requestApproval', 'mcpServer/elicitation/request'].includes(method);
      if (!known) { await block('Codex requested an unsupported interaction. No access was granted.'); throw failure('Codex requested an unsupported interaction.'); }
      await matches(params, method.startsWith('item/'), method === 'mcpServer/elicitation/request');
      if (wire.isRequestCleared(requestId)) return {};
      if (method === 'item/tool/requestUserInput') return collectInput(requestId, params);
      if (!APPROVAL_METHODS.has(method)) {
        const reason = method === 'item/tool/requestUserInput'
          ? 'Codex requested interactive input, which this host does not support. Continue in the official Codex client.'
          : 'Codex requested an unsupported permission or interaction. No access was granted.';
        await block(reason);
        if (method === 'item/tool/requestUserInput') {
          await emit({ type: 'input', text: reason, data: { status: 'unsupported', questions: params.questions } });
          return { answers: {} };
        }
        if (method === 'item/permissions/requestApproval') return { permissions: {}, scope: 'turn' };
        if (method === 'mcpServer/elicitation/request') return { action: 'decline', content: null, _meta: null };
        throw failure('Codex requested an unsupported interaction.');
      }
      const offered = params.availableDecisions ?? ['accept', 'decline', 'cancel'];
      if (!Array.isArray(offered)) throw failure('Codex returned invalid approval choices.');
      const decisions = offered.filter(value => ['accept', 'decline', 'cancel'].includes(value));
      const deny = decisions.includes('decline') ? 'decline' : decisions.includes('cancel') ? 'cancel' : null;
      if (!deny) { await block('Codex offered no supported way to decline this request.'); throw failure('No safe Codex approval decision.'); }
      if (params.additionalPermissions != null || (params.grantRoot != null && (!isAbsolute(params.grantRoot) || !inside(sandboxPolicy.workspaceRoot, params.grantRoot)))) {
        await block('Codex requested access beyond the supported host sandbox. No access was granted.');
        return { decision: deny };
      }
      const item = activeItems.get(params.itemId);
      const network = params.networkApprovalContext;
      const command = params.command ?? item?.command;
      const commandCwd = params.cwd ?? item?.cwd;
      const invalidNetwork = network != null && (typeof network !== 'object' || Array.isArray(network)
        || typeof network.host !== 'string' || !network.host.trim() || typeof network.protocol !== 'string' || !network.protocol.trim()
        || network.port != null && (!Number.isInteger(network.port) || network.port < 1 || network.port > 65535));
      const missingCommand = method.includes('commandExecution') && network == null
        && (typeof command !== 'string' || !command.trim() || typeof commandCwd !== 'string' || !isAbsolute(commandCwd));
      const missingChanges = method.includes('fileChange') && (!Array.isArray(item?.changes) || !item.changes.length);
      if (invalidNetwork || missingCommand || missingChanges) {
        await block('Codex did not provide enough operation details for a safe approval. No access was granted.');
        return { decision: deny };
      }
      const rawDetails = { ...params, ...(item ? { item } : {}), sandboxPolicy: { mode, workspaceRoot: sandboxPolicy.workspaceRoot }, nativeSessionId: sessionId, connectionEpoch: epoch, nativeRequestId: requestId, method };
      const details = safeData(rawDetails);
      if (JSON.stringify(details) !== JSON.stringify(rawDetails)) {
        await block('Codex approval details contained sensitive data and could not be shown completely. No access was granted.');
        return { decision: deny };
      }
      const request: Record<string, any> = {
        id: `codex:${epoch}:${typeof requestId}:${requestId}`,
        nativeSessionId: sessionId,
        kind: params.networkApprovalContext ? 'network' : method.includes('fileChange') ? 'file' : 'command',
        title: params.networkApprovalContext ? 'Allow Codex network access?' : method.includes('fileChange') ? 'Allow this Codex file change?' : 'Allow this Codex command?',
        defaultRejectOptionId: deny,
        scopeComplete: true,
        details,
        options: decisions.map(decision => ({ id: decision, label: decision === 'accept' ? 'Allow once' : decision === 'cancel' ? 'Cancel turn' : 'Decline', kind: decision === 'accept' ? 'allow_once' : 'reject_once' })),
      };
      const controller = new AbortController();
      request.signal = controller.signal;
      pendingPermissions.set(requestId, { id: request.id, controller, type: 'permission' });
      try {
        const { signal: requestSignal, ...visibleRequest } = request;
        await emit({ type: 'permission', data: { ...visibleRequest, status: 'pending' } });
        if (!requestPermission) { await block('Codex needs approval, but no host approval handler is available.'); return { decision: deny }; }
        let answer;
        try { answer = await abortable(abortable(Promise.resolve().then(() => requestPermission(request)), controller.signal), operation.signal); }
        catch { answer = null; }
        if (controller.signal.aborted || operation.signal.aborted || terminal) return { decision: deny };
        const decision = answer?.optionId;
        if (!decisions.includes(decision)) { await block('Codex approval was cancelled or returned an unsupported choice. No access was granted.'); return { decision: deny }; }
        return { decision };
      } finally { pendingPermissions.delete(requestId); }
    };
    try {
      child = await spawn(spec(options, cwd, false, operation.signal));
      wire = new CodexRpc(child, { ...options, onNotification: notification, onRequest: serverRequest, afterRequest: async () => { if (blockReason) blocked.resolve(); } });
      if (signal?.aborted) cancel();
      await initialize(wire, operation.signal);
      const common = { cwd, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: mode, ...(model ? { model } : {}) };
      const response = object(await wire.request(sessionId ? 'thread/resume' : 'thread/start', sessionId
        ? { threadId: sessionId, ...common } : { ephemeral: false, ...common }, operation.signal));
      const thread = object(response.thread);
      const returnedId = id(thread.id);
      if (sessionId && returnedId !== sessionId) throw failure('Codex resumed a different thread.');
      sessionId = returnedId;
      if (thread.ephemeral === true) throw failure('Codex did not create a persistent thread.');
      await emit({ type: 'session', data: { nativeSessionId: sessionId } });
      startingTurn = true;
      const turnResponse = object(await wire.request('turn/start', { threadId: sessionId, cwd, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandboxPolicy: nativePolicy,
        ...(model ? { model } : {}), input: [{ type: 'text', text: prompt, text_elements: [] }] }, operation.signal));
      turnId = id(object(turnResponse.turn).id);
      turnReady.resolve();
      const status = await wire.guard(Promise.race([completed.promise, blocked.promise.then(() => 'blocked')]), operation.signal);
      if (status === 'blocked') { interrupt(); return result('blocked', summary(), blockReason, usage); }
      return result(status === 'interrupted' ? 'cancelled' : status, summary(), status === 'failed' ? 'Codex reported that the turn failed. Review the recorded events before explicitly retrying.' : undefined, usage);
    } catch (error: any) {
      interrupt();
      if (signal?.aborted) return result('cancelled', summary(), undefined, usage);
      const reason = blockReason ?? (error?.code === 'AGENTS_CODEX_TIMEOUT' ? 'Codex did not answer within the protocol timeout. The turn was not retried.'
        : 'Codex could not complete this turn. Check CLI setup, protocol compatibility, and host sandbox access before explicitly retrying.');
      await emit({ type: 'diagnostic', text: reason });
      return result(blockReason ? 'blocked' : 'failed', summary(), reason, usage);
    } finally {
      signal?.removeEventListener('abort', cancel);
      operation.abort();
      for (const pending of pendingPermissions.values()) pending.controller.abort();
      if (child) await cleanupCodexChild(child, wire, options.cleanupTimeoutMs);
    }
  }

  return { id: 'codex', transport: 'app-server-stdio', backendIdentity, capabilities: CAPABILITIES, discover, run };
}
