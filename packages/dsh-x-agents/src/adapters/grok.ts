import type { NativeDiscovery } from '../types.ts'
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { GrokRpc, abortable, cleanupGrokChild, deferred, failure } from './grok-rpc.ts';

const CAPABILITIES = Object.freeze({ nativeSessions: true, resume: true, streaming: true, tools: true, plans: true,
  permissions: true, input: true, usage: true, cancel: true, models: true, authDiscovery: false, permissionScopes: ['once'],
  limitations: ['Discovery checks the version only. Authorized native startup may maintain native state, load plugins, and contact services.',
    'Native remembered grants and configured allow rules remain effective; host confinement is the hard boundary.',
    'Credential input, persistent permission grants, native login, client filesystem/terminal services, and unsupported extensions are blocked.'] });
const DEFAULTS = { executable: 'grok', graceMs: 3000, cleanupTimeoutMs: 15000, requestTimeoutMs: 30000,
  maxFrameBytes: 4194304, maxQueuedEvents: 4096, maxQueuedBytes: 16777216 };
const SESSION_META = Object.freeze({ yoloMode: false, autoMode: false, noReplay: true, 'x.ai/restore_code': false, 'x.ai/skip_envrc': true });
const SECRET = /password|api[\s_-]*key|access[\s_-]*token|refresh[\s_-]*token|secret|credential|sign[\s-]*in|log[\s-]*in|verification code|one[\s-]*time code|验证码|密码|密钥|令牌/i;

function object(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('Grok returned invalid response data.');
  return value;
}
function id(value: any) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024 || /[\0\r\n]/.test(value) || safeText(value) !== value) throw failure('Grok returned an invalid identifier.');
  return value;
}
function safeText(value: any) {
  return value.replace(/\b(?:xai-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[redacted]')
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[redacted]')
    .replace(/(\b[A-Z_]*(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|ID_TOKEN|PRIVATE_KEY|PASSWORD|SECRET|CREDENTIAL|COOKIE)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]');
}
function safeData(value: any, depth = 0) : any {
  if (depth > 40) return '[nested data omitted]';
  if (typeof value === 'string') return safeText(value);
  if (Array.isArray(value)) return value.map(item => safeData(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item !== 'boolean' && /api.?key|password|secret|credential|authorization|cookie|(?:access|refresh|auth|id).?token|^env(?:ironment)?$/i.test(key)
      ? '[redacted]' : safeData(item, depth + 1)]));
}
function settings(config: any) {
  const result: Record<string, any> = { ...DEFAULTS, ...config };
  for (const key of ['args', 'env', 'sandbox', 'approvalPolicy', 'alwaysApprove', 'leader']) {
    if (Object.hasOwn(config, key)) throw new TypeError('Grok process routing and permissions are owned by the host.');
  }
  for (const key of ['graceMs', 'cleanupTimeoutMs', 'requestTimeoutMs', 'maxFrameBytes', 'maxQueuedEvents', 'maxQueuedBytes']) {
    if (!Number.isSafeInteger(result[key]) || result[key] <= 0 || result[key] > 2147483647) throw new TypeError(`Invalid Grok ${key}.`);
  }
  result.nativeHome = config.nativeHome ?? process.env.GROK_HOME ?? join(homedir(), '.grok');
  if (typeof result.executable !== 'string' || !result.executable.trim() || /[\0\r\n]/.test(result.executable)) throw new TypeError('A Grok executable is required.');
  if (typeof result.nativeHome !== 'string' || !isAbsolute(result.nativeHome) || /[\0\r\n]/.test(result.nativeHome)) throw new TypeError('Grok native home must be an absolute directory.');
  result.searchPath = isAbsolute(result.executable) ? null : process.env.PATH ?? '';
  for (const value of [result.executable, result.nativeHome, result.searchPath]) if (value && safeText(value) !== value) throw new TypeError('Grok routing settings must not contain credential-shaped data.');
  return result;
}
function spec(options: any, cwd: any, signal: any, version = false) {
  return { argv: [options.executable, ...(version ? ['--version'] : ['agent', '--no-leader', 'stdio'])], cwd,
    stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs: options.graceMs,
    env: { GROK_HOME: options.nativeHome, ...(options.searchPath == null ? {} : { PATH: options.searchPath }) }, ...(signal ? { signal } : {}) };
}
function validPolicy(cwd: any, policy: any) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd) || !policy || !['read-only', 'workspace-write', 'danger-full-access'].includes(policy.mode)
    || typeof policy.workspaceRoot !== 'string' || !isAbsolute(policy.workspaceRoot)) return false;
  const part = relative(policy.workspaceRoot, cwd);
  return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}
async function versionOf(spawn: any, options: any, cwd: any, signal: any) {
  const child = await spawn(spec(options, cwd, signal, true));
  let output = '';
  const collect = (chunk: any) => { if (output.length < 8192) output += String(chunk).slice(0, 8192 - output.length); };
  const ignore = () => {};
  child.stdout?.on('data', collect); child.stdout?.on('error', ignore);
  child.stderr?.on('data', ignore); child.stderr?.on('error', ignore); child.stdin?.on('error', ignore);
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), options.requestTimeoutMs);
  try {
    const exit = await abortable(abortable(child.done, timeout.signal), signal);
    await new Promise<any>(resolve => setImmediate(resolve));
    const match = /^grok\s+(\d+\.\d+\.\d+)(?:\s+\([a-f0-9]+\))?\s*$/m.exec(output.trim());
    if (exit.exitCode !== 0 || !match) throw failure('The executable is not a recognized official Grok CLI.');
    const [major, minor, patch] = match[1].split('.').map(Number);
    if (major !== 1 || minor === 0 && patch < 45) throw failure('This Grok CLI version predates the supported ACP contract.');
    return match[1];
  } finally {
    clearTimeout(timer); child.stdout?.off('data', collect); child.stderr?.off('data', ignore);
    await cleanupGrokChild(child, null, options.cleanupTimeoutMs);
  }
}
function modelsFrom(state: any) {
  if (state == null) return [];
  if (!Array.isArray(state.availableModels) || state.availableModels.length > 100) throw failure('Grok returned an invalid native model catalog.');
  const seen = new Set<any>();
  return state.availableModels.map((model: any) => {
    const modelId = id(model.modelId);
    if (seen.has(modelId) || safeText(modelId) !== modelId) throw failure('Grok returned an invalid native model catalog.');
    seen.add(modelId);
    if (model.name != null && (typeof model.name !== 'string' || model.name.length > 1024)) throw failure('Grok returned an invalid model label.');
    return { id: modelId, label: safeText(model.name ?? modelId) };
  });
}

/** Official Grok Build ACP v1; every process must be owned and confined by spawn. */
export function createGrokAdapter({ spawn, config = {} }: any = {}) {
  if (typeof spawn !== 'function') throw new TypeError('Grok requires the managed subprocess spawn service.');
  const options = settings(config);
  const backendIdentity = JSON.stringify({ runtime: 'grok', transport: 'acp-stdio-v1', executable: options.executable,
    nativeHome: options.nativeHome, searchPath: options.searchPath, leader: false, yoloMode: false, autoMode: false });

  async function discover({ cwd, signal }: any = {}) {
    const result: NativeDiscovery = { available: false, version: null, authenticated: null, models: [], capabilities: CAPABILITIES,
      authentication: { state: 'requires-native-initialization', source: 'version-only' } };
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) return { ...result, reason: 'Choose an absolute workspace folder before checking Grok.' };
    try {
      result.version = await versionOf(spawn, options, cwd, signal);
      return { ...result, available: true, reason: 'Grok is installed. Authentication and models are checked only after approval to start the native runtime; startup can maintain native state and contact services.' };
    } catch (error: any) {
      if (error?.code === 'AGENTS_CLEANUP_UNCONFIRMED') throw error;
      return { ...result, reason: signal?.aborted ? 'Grok discovery cancelled.' : 'A supported official Grok Build CLI is unavailable. Install it using x.ai/cli; third-party grok CLIs are unsupported.' };
    }
  }

  // Unlike discover(), this requires explicit approval for native startup.
  // initialize advertises models even when no supported login is configured.
  async function discoverModels({ cwd, signal, sandboxPolicy }: any = {}) {
    let child, wire, result;
    const checkCancelled = () => { if (signal?.aborted) throw failure('Grok model discovery cancelled.', 'ABORT_ERR'); };
    checkCancelled();
    if (!validPolicy(cwd, sandboxPolicy)) throw failure('Grok model discovery requires the bound host sandbox policy and workspace.');
    try {
      const version = await versionOf(spawn, options, cwd, signal);
      checkCancelled();
      child = await spawn(spec(options, cwd, signal));
      checkCancelled();
      wire = new GrokRpc(child, { ...options, onNotification: async () => {},
        onRequest: async () => { throw failure('Grok requested an unsupported client action during model discovery.'); },
      });
      const init = object(await wire.request('initialize', { protocolVersion: 1,
        clientInfo: { name: 'dsh-x-agents', version: '0.1.0' },
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      }, signal));
      if (init.protocolVersion !== 1 || init._meta?.grokShell !== true || init._meta?.agentVersion !== version || init.agentCapabilities?.loadSession !== true) throw failure('The executable did not negotiate the official Grok ACP contract.');
      if (init._meta.modelState == null) throw failure('Grok did not advertise a native model catalog.');
      const models = modelsFrom(init._meta.modelState);
      const auth = init._meta.defaultAuthMethodId;
      const configured = ['cached_token', 'xai.api_key'].includes(auth) && Array.isArray(init.authMethods) && init.authMethods.some((method: any) => method.id === auth);
      await wire.guard(wire.notifications, signal);
      if (wire.serverRequests.size) throw failure('Grok requested an unsupported client action during model discovery.');
      checkCancelled();
      result = { available: true, version, authenticated: null, models,
        capabilities: { ...CAPABILITIES, models: models.length > 0 },
        authentication: { state: configured ? 'configured-unverified' : auth == null ? 'unconfigured' : 'unsupported', source: 'native-initialize' },
      };
    } finally {
      if (child) await cleanupGrokChild(child, wire, options.cleanupTimeoutMs);
    }
    checkCancelled();
    return result;
  }

  async function run({ prompt, model, cwd, nativeSessionId, sandboxPolicy, signal, onEvent, requestPermission, requestInput }: any = {}) {
    let sessionId = nativeSessionId ?? null, child, wire: any, blockReason: any, usage: any, answer = '', prompting = false, terminal = false;
    const result = (status: any, reason?: any) => ({ nativeSessionId: sessionId, status, summary: safeText(answer), ...(reason ? { reason } : {}), ...(usage ? { usage } : {}) });
    if (signal?.aborted) return result('cancelled');
    if (!validPolicy(cwd, sandboxPolicy)) return result('blocked', 'Grok requires a host sandbox policy and a folder inside its workspace.');
    if (typeof prompt !== 'string' || !prompt.trim()) return result('blocked', 'A nonempty Grok prompt is required.');
    if (nativeSessionId != null) id(nativeSessionId);
    if (model != null) id(model);
    // Slash commands can toggle permissions or run native administrative actions.
    if (/^\s*\//.test(prompt)) return result('blocked', 'Native slash commands are unsupported in delegated Grok prompts.');
    const operation = new AbortController(), blocked = deferred(), epoch = randomUUID();
    const toolCalls = new Map<any, any>(), interactions = new Map<any, any>();
    let toolBytes = 0;
    const emit = async (event: any) => {
      if (!operation.signal.aborted && onEvent) await abortable(Promise.resolve().then(() => onEvent(safeData(event))), operation.signal);
    };
    const interrupt = () => {
      if (wire && sessionId && prompting && !terminal && !wire.closed) void wire.notify('session/cancel', { sessionId, _meta: { cancelSubagents: true } }).catch(() => {});
    };
    const cancel = () => { interrupt(); operation.abort(); };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const block = async (reason: any) => { blockReason ??= reason; await emit({ type: 'status', text: reason, data: { status: 'blocked' } }); };
    const rejectPermission = () => ({ outcome: { outcome: 'cancelled' } });
    const checkRequest = (params: any) => {
      if (!prompting || terminal || !sessionId || params.sessionId !== sessionId) throw failure('Grok requested an action for an inactive native session.');
    };
    const permission = async ({ id: requestId, params, signal: requestSignal }: any) => {
      checkRequest(params);
      const unsupported = async (reason: any) => { await block(reason); return rejectPermission(); };
      const update = object(params.toolCall); id(update.toolCallId);
      const tool = { ...toolCalls.get(update.toolCallId), ...update };
      if (tool.rawInput == null && (!Array.isArray(tool.content) || !tool.content.length)) return unsupported('Grok permission details do not identify the complete tool input.');
      if (!Array.isArray(params.options) || !params.options.length || params.options.length > 32) return unsupported('Grok returned an unsupported permission scope.');
      const seen = new Set<any>();
      for (const option of params.options) {
        if (!option || typeof option.optionId !== 'string' || !option.optionId || option.optionId.length > 1024 || typeof option.name !== 'string' || !option.name || option.name.length > 1024 || seen.has(option.optionId) || !['allow_once', 'reject_once', 'allow_always', 'reject_always'].includes(option.kind)) return unsupported('Grok returned an unknown permission scope.');
        seen.add(option.optionId);
      }
      // Grok also uses AllowOnce for enable-always-approve. Only the official
      // exact ordinary IDs are eligible; never infer scope from label/position.
      const eligible = params.options.filter((option: any) => option.optionId === 'allow-once' && option.kind === 'allow_once'
        || option.optionId === 'reject-once' && option.kind === 'reject_once');
      if (!eligible.some((option: any) => option.kind === 'allow_once') || typeof requestPermission !== 'function') return unsupported('Grok requires a supported one-time permission handler.');
      const data = { ...params, toolCall: tool };
      if (JSON.stringify(safeData(data)) !== JSON.stringify(data)) return unsupported('Grok permission details contain sensitive data and cannot be shown completely.');
      const permissionRequest = { id: `grok:${epoch}:${typeof requestId}:${requestId}`, nativeSessionId: sessionId, kind: 'grok-tool',
        title: typeof tool.title === 'string' ? tool.title : 'Grok tool permission', details: JSON.stringify(data),
        options: eligible.map((option: any) => ({ id: option.optionId, label: option.name, kind: option.kind })) };
      await emit({ type: 'permission', data: permissionRequest });
      let response;
      try { response = await abortable(Promise.resolve().then(() => { requestSignal.throwIfAborted(); return requestPermission({ ...permissionRequest, signal: requestSignal }); }), requestSignal); }
      catch (error: any) { if (requestSignal.aborted) return rejectPermission(); throw error; }
      if (requestSignal.aborted || terminal) return rejectPermission();
      const selected = eligible.find((option: any) => option.optionId === response?.optionId);
      if (!selected) return unsupported('Grok permission was cancelled or an unsupported scope was selected.');
      if (selected.kind !== 'allow_once') await block('Grok tool permission was denied.');
      return { outcome: { outcome: 'selected', optionId: selected.optionId } };
    };
    const inputRequest = async ({ id: requestId, params, signal: requestSignal }: any) => {
      checkRequest(params); id(params.toolCallId);
      const unsupported = async (reason: any) => { await block(reason); await emit({ type: 'input', text: reason, data: { status: 'unsupported', nativeSessionId: sessionId } }); return { outcome: 'cancelled' }; };
      if (!requestInput || !Array.isArray(params.questions) || !params.questions.length || params.questions.length > 3 || !['default', 'plan'].includes(params.mode)) return unsupported('Grok requested an unsupported interactive question.');
      const seen = new Set<any>(), nativeQuestions = params.questions, questions: any[] = [];
      for (const [index, question] of nativeQuestions.entries()) {
        if (!question || typeof question.question !== 'string' || !question.question.trim() || seen.has(question.question)
          || !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 10
          || question.multiSelect != null && typeof question.multiSelect !== 'boolean') return unsupported('Grok returned an unsupported question format.');
        seen.add(question.question);
        if (SECRET.test(JSON.stringify(question)) || JSON.stringify(safeData(question)) !== JSON.stringify(question)) return unsupported('Grok requested sensitive credential input. Use the official client to handle it securely.');
        const labels = new Set<any>();
        for (const option of question.options) {
          if (!option || typeof option.label !== 'string' || !option.label.trim() || labels.has(option.label) || typeof option.description !== 'string'
            || option.preview != null) return unsupported('Grok question options require unsupported formatting.');
          labels.add(option.label);
        }
        questions.push({ id: `question-${index}`, question: question.question, multiSelect: question.multiSelect === true,
          options: question.options.map((option: any) => ({ label: option.label, description: option.description })) });
      }
      const request = { id: `grok:${epoch}:${typeof requestId}:${requestId}`, nativeSessionId: sessionId, title: 'Grok needs your input', questions };
      await emit({ type: 'input', data: request });
      let response;
      try { response = await abortable(Promise.resolve().then(() => { requestSignal.throwIfAborted(); return requestInput({ ...request, signal: requestSignal }); }), requestSignal); }
      catch (error: any) { if (requestSignal.aborted) return { outcome: 'cancelled' }; throw error; }
      if (terminal || requestSignal.aborted) return { outcome: 'cancelled' };
      if (!response) return unsupported('Grok interactive input was cancelled.');
      if (!Array.isArray(response.answers) || response.answers.length !== questions.length) return unsupported('Grok received an incomplete input response.');
      const answers = Object.create(null), annotations = Object.create(null), answered = new Set<any>();
      for (const item of response.answers) {
        const question = questions.find(candidate => candidate.id === item?.id);
        if (!question || answered.has(item.id) || !Array.isArray(item.selected)
          || item.selected.length > (question.multiSelect ? 10 : 1) || new Set(item.selected).size !== item.selected.length
          || item.selected.some((value: any) => typeof value !== 'string' || !question.options.some((option: any) => option.label === value))
          || item.custom != null && typeof item.custom !== 'string') return unsupported('Grok received an invalid input response.');
        answered.add(item.id);
        const notes = item.custom?.trim();
        if (!item.selected.length && !notes || notes && (notes.length > 4000 || safeText(notes) !== notes)) return unsupported('Grok input was empty or contained credential-shaped data.');
        answers[question.question] = item.selected.length ? item.selected : ['Other'];
        if (notes) annotations[question.question] = { notes };
      }
      return { outcome: 'accepted', answers, ...(Object.keys(annotations).length ? { annotations } : {}) };
    };
    const notification = async (method: any, params: any) => {
      if (params.sessionId !== sessionId || !prompting || terminal) return;
      if (method === '_x.ai/session_notification' && params.update?.sessionUpdate === 'interaction_resolved') {
        await emit({ type: 'status', data: { nativeSessionId: sessionId, toolCallId: params.update.tool_call_id, status: 'interaction_resolved' } });
      } else if (method === 'session/update') {
        const update = object(params.update);
        const data = { ...update, nativeSessionId: sessionId };
        if (update.sessionUpdate === 'agent_message_chunk') {
          if (update.content?.type !== 'text' || typeof update.content.text !== 'string') throw failure('Grok returned unsupported assistant content.');
          if (Buffer.byteLength(answer) + Buffer.byteLength(update.content.text) > options.maxQueuedBytes) throw failure('Grok answer exceeded its memory budget.');
          answer += update.content.text;
          await emit({ type: 'assistant', text: update.content.text, data: { nativeSessionId: sessionId, messageId: `${epoch}:assistant`, delta: true } });
        } else if (['tool_call', 'tool_call_update'].includes(update.sessionUpdate)) {
          id(update.toolCallId);
          // Grok formats selected answers and freeform notes into this tool's
          // result. Request scopes are recorded on receipt, even if the input
          // handler is queued or revoked; never persist its native echo.
          const questionTool = [...wire.requestScopes.values()].some(scope => scope.method === '_x.ai/ask_user_question'
            && scope.sessionId === sessionId && scope.toolCallId === update.toolCallId);
          const visibleUpdate = questionTool ? { sessionUpdate: update.sessionUpdate, toolCallId: update.toolCallId,
            title: 'Grok interactive question', status: ['pending', 'in_progress', 'completed', 'failed'].includes(update.status) ? update.status : 'in_progress',
            answerContentOmitted: true } : update;
          const prior = toolCalls.get(update.toolCallId);
          if (prior) toolBytes -= Buffer.byteLength(JSON.stringify(prior));
          const merged = questionTool ? visibleUpdate : { ...prior, ...visibleUpdate };
          toolBytes += Buffer.byteLength(JSON.stringify(merged));
          if (toolCalls.size >= options.maxQueuedEvents && !prior || toolBytes > options.maxQueuedBytes) throw failure('Grok tool state exceeds its memory budget.');
          toolCalls.set(update.toolCallId, merged);
          await emit({ type: 'tool', data: { ...visibleUpdate, nativeSessionId: sessionId } });
        } else if (update.sessionUpdate === 'plan') await emit({ type: 'plan', data });
        else if (update.sessionUpdate !== 'agent_thought_chunk') await emit({ type: 'status', data });
      } else if (method === '_x.ai/yolo_mode_changed' && (params.yolo_mode === true || params.auto_mode === true || params.permission_mode && !['ask', 'default'].includes(params.permission_mode))) {
        await block('Grok attempted to broaden its permission mode.'); blocked.resolve();
      }
    };
    try {
      const version = await versionOf(spawn, options, cwd, operation.signal);
      child = await spawn(spec(options, cwd, operation.signal));
      wire = new GrokRpc(child, { ...options, onNotification: notification,
        beforeNotification: (method: any, params: any) => {
          if (method !== '_x.ai/session_notification' || params.sessionId !== sessionId || !prompting || terminal
            || params.update?.sessionUpdate !== 'interaction_resolved') return;
          const toolCallId = id(params.update.tool_call_id);
          // Scopes are registered when each request frame is received, before
          // its handler can be delayed by prior display/persistence callbacks.
          for (const [requestId, scope] of wire.requestScopes) {
            if (scope.sessionId !== sessionId || scope.toolCallId !== toolCallId
              || !['session/request_permission', '_x.ai/ask_user_question'].includes(scope.method)) continue;
            wire.invalidateRequest(requestId);
            interactions.get(requestId)?.controller.abort();
          }
        },
        onRequest: async (request: any) => {
          if (wire.isRequestCleared(request.id)) return null;
          if (['session/request_permission', '_x.ai/ask_user_question'].includes(request.method)) {
            const controller = new AbortController();
            const type = request.method === 'session/request_permission' ? 'permission' : 'input';
            interactions.set(request.id, { controller, type, hostId: `grok:${epoch}:${typeof request.id}:${request.id}`, toolCallId: request.params.toolCall?.toolCallId ?? request.params.toolCallId });
            try {
              return await (type === 'permission' ? permission : inputRequest)({ ...request, signal: AbortSignal.any([operation.signal, controller.signal]) });
            } finally { interactions.delete(request.id); }
          }
          await block('Grok requested an unsupported client action; execution is blocked.');
          throw failure('Unsupported Grok client request.');
        },
        afterRequest: async () => { if (blockReason) blocked.resolve(); },
      });
      const init = object(await wire.request('initialize', { protocolVersion: 1,
        clientInfo: { name: 'dsh-x-agents', version: '0.1.0' },
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      }, operation.signal));
      if (init.protocolVersion !== 1 || init._meta?.grokShell !== true || init._meta?.agentVersion !== version || init.agentCapabilities?.loadSession !== true) throw failure('The executable did not negotiate the official Grok ACP contract.');
      const auth = init._meta.defaultAuthMethodId;
      if (!['cached_token', 'xai.api_key'].includes(auth) || !Array.isArray(init.authMethods) || !init.authMethods.some((method: any) => method.id === auth)) {
        return result('blocked', 'Grok has no supported configured authentication. Sign in through the official Grok CLI, then retry; no login was attempted.');
      }
      let models = modelsFrom(init._meta.modelState);
      if (model && !models.some((item: any) => item.id === model)) return result('blocked', 'The selected model is not advertised by the native Grok runtime.');
      const session = object(await wire.request(nativeSessionId ? 'session/load' : 'session/new', {
        cwd, mcpServers: [], ...(nativeSessionId ? { sessionId: nativeSessionId } : {}), _meta: SESSION_META,
      }, operation.signal));
      if (!nativeSessionId) sessionId = id(session.sessionId);
      else if (session.sessionId != null && session.sessionId !== nativeSessionId) throw failure('Grok changed the requested native session identity.');
      await emit({ type: 'session', data: { nativeSessionId: sessionId } });
      if (session.models != null) models = modelsFrom(session.models);
      await emit({ type: 'session', data: { nativeSessionId: sessionId, models, capabilities: { resume: true, models: models.length > 0 }, authentication: { state: 'configured-unverified', source: 'native-initialize' } } });
      if (model) {
        if (!models.some((item: any) => item.id === model)) return result('blocked', 'The selected model is not advertised by this Grok session.');
        object(await wire.request('session/set_model', { sessionId, modelId: model }, operation.signal));
      }
      prompting = true;
      const response = await Promise.race([
        wire.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }, operation.signal, { timeoutMs: null, onResult: () => {
          for (const requestId of wire.serverRequests.keys()) { wire.invalidateRequest(requestId); interactions.get(requestId)?.controller.abort(); }
        } }),
        blocked.promise.then(() => { interrupt(); throw failure('Grok execution blocked.'); }),
      ]);
      await wire.guard(wire.notifications, operation.signal);
      terminal = true;
      operation.abort();
      if (blockReason) return result('blocked', blockReason);
      const stop = object(response).stopReason;
      if (response._meta?.sessionId != null && response._meta.sessionId !== sessionId) throw failure('Grok returned a prompt result for another session.');
      // PromptUsage is official _meta data. Never synthesize token/cost values.
      if (response._meta?.usage) { usage = safeData(object(response._meta.usage)); if (onEvent) await abortable(Promise.resolve().then(() => onEvent({ type: 'usage', data: usage })), signal); }
      if (stop === 'end_turn') return result('completed');
      if (stop === 'cancelled') return result('cancelled');
      if (stop === 'refusal') return result('blocked', 'Grok refused this request.');
      if (['max_tokens', 'max_turn_requests'].includes(stop)) return result('blocked', 'Grok stopped at its native turn limit.');
      return result('failed', 'Grok returned an unsupported terminal status.');
    } catch (error: any) {
      if (error?.code === 'AGENTS_CLEANUP_UNCONFIRMED') throw error;
      if (signal?.aborted) return result('cancelled');
      if (blockReason) return result('blocked', blockReason);
      if (error?.rpcCode === -32000) return result('blocked', 'Grok requires authentication. Use the official CLI to sign in; no login or retry was attempted.');
      return result('failed', 'The native Grok ACP request failed. No new session or alternate runtime was retried.');
    } finally {
      signal?.removeEventListener('abort', cancel); operation.abort();
      if (child) await cleanupGrokChild(child, wire, options.cleanupTimeoutMs);
    }
  }
  return { id: 'grok', transport: 'acp-stdio-v1', capabilities: CAPABILITIES, backendIdentity, discover, discoverModels, run };
}
