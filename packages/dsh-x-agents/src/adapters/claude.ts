import type { Options, CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import type { NativeDiscovery } from '../types.ts'
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, sep } from 'node:path';
import { query as nativeQuery } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeProcessOwner, abortable, deadline, deferred, failure } from './claude-process.ts';

export const CLAUDE_SDK_VERSION = '0.3.302';
const CLI_VERSION = '2.1.302';
const CAPABILITIES = Object.freeze({ nativeSessions: true, resume: true, streaming: true, tools: true, plans: true,
  permissions: true, input: true, usage: true, cancel: true, models: true, authDiscovery: false,
  permissionScopes: ['once'], sandbox: { owner: 'host-managed-process', nativePermissionsAreSandbox: false },
  limitations: ['Discovery checks only the native binary version. Configuration is inspected after launch approval.',
    'This SDK adapter supports API-key and cloud-provider configuration; subscription OAuth is outside its scope.',
    'Persistent permission grants, MCP elicitation, credential entry, plugins, skills and user/project hooks are disabled.',
    'Native permission callbacks only cover requests Claude asks the host to approve. Host confinement owns file-effect enforcement.'] });
const DEFAULTS = { graceMs: 3000, cleanupTimeoutMs: 15000, requestTimeoutMs: 15000, maxFrameBytes: 4194304, maxOutputBytes: 16777216, maxFrames: 8192 };
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const SECRET_QUESTION = /password|api[\s_-]*key|access[\s_-]*token|refresh[\s_-]*token|secret|credential|sign[\s-]*in|log[\s-]*in|verification code|one[\s-]*time code|验证码|密码|密钥|令牌/i;
const ENV_KEYS = new Set(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'AWS_PROFILE', 'AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_BEARER_TOKEN_BEDROCK',
  'ANTHROPIC_VERTEX_PROJECT_ID', 'CLOUD_ML_REGION', 'GOOGLE_APPLICATION_CREDENTIALS',
  'ANTHROPIC_FOUNDRY_RESOURCE', 'ANTHROPIC_FOUNDRY_BASE_URL', 'ANTHROPIC_FOUNDRY_API_KEY']);
const PROVIDERS = new Set(['bedrock', 'vertex', 'foundry', 'anthropicAws', 'anthropicGoogleCloud', 'mantle', 'gateway']);
const API_SOURCES = new Set(['ANTHROPIC_API_KEY', 'apiKeyHelper', '/login managed key', 'user', 'project', 'org', 'temporary']);
function object(value: any): Record<string, any> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('Claude returned invalid protocol data.'); return value; }
function identifier(value: any) { if (typeof value !== 'string' || !value || value.length > 512) throw failure('Claude returned an invalid request identifier.'); return value; }
function safeText(value: any) {
  return value.replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[redacted]')
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[redacted]')
    .replace(/(\b[A-Z_]*(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|ID_TOKEN|PRIVATE_KEY|PASSWORD|SECRET|CREDENTIAL|COOKIE)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]');
}
function safeData(value: any, depth = 0) : any {
  if (depth > 30) return '[nested data omitted]';
  if (typeof value === 'string') return safeText(value);
  if (Array.isArray(value)) return value.map(item => safeData(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item !== 'boolean' && /api.?key|password|secret|credential|authorization|cookie|(?:access|refresh|auth|id).?token|^env(?:ironment)?$|thinking|signature/i.test(key)
      ? '[redacted]' : safeData(item, depth + 1)]));
}
function complete(value: any) { return JSON.stringify(safeData(value)) === JSON.stringify(value); }
function settings(config: any) {
  const options: Record<string, any> = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (config[key] !== undefined) options[key as keyof typeof options] = config[key];
    if (!Number.isSafeInteger(options[key as keyof typeof options]) || options[key as keyof typeof options] <= 0 || options[key as keyof typeof options] > 2147483647) throw new TypeError(`Invalid Claude ${key}.`);
  }
  for (const key of Object.keys(config)) if (![...Object.keys(DEFAULTS), 'executable', 'configDir', 'env'].includes(key)) throw new TypeError('Claude runtime permissions, transport and SDK options are owned by the host.');
  if (config.executable !== undefined && (typeof config.executable !== 'string' || !config.executable.trim() || /[\0\r\n]/.test(config.executable) || safeText(config.executable) !== config.executable)) throw new TypeError('Invalid Claude executable.');
  options.executable = config.executable;
  if (!options.executable) {
    const require = createRequire(import.meta.url);
    const musl = process.platform === 'linux' && (process.report?.getReport?.() as {header?: {glibcVersionRuntime?: string}} | undefined)?.header?.glibcVersionRuntime === undefined;
    const base = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
    const packages = process.platform === 'linux' ? (musl ? [`${base}-musl`, base] : [base, `${base}-musl`]) : [base];
    for (const name of packages) { try { options.executable = require.resolve(`${name}/claude${process.platform === 'win32' ? '.exe' : ''}`); break; } catch {} }
  }
  options.configDir = config.configDir ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  if (typeof options.configDir !== 'string' || !isAbsolute(options.configDir) || /[\0\r\n]/.test(options.configDir) || !complete(options.configDir)) throw new TypeError('Claude native configuration directory must be an absolute path.');
  options.env = {};
  for (const [key, value] of Object.entries(config.env ?? {})) {
    if (!ENV_KEYS.has(key) || typeof value !== 'string' || /[\0\r\n]/.test(value)) throw new TypeError('Unsupported Claude provider environment setting.');
    if (/BASE_URL$/.test(key)) { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError('Claude provider URLs must not contain credentials or query parameters.'); }
    if (!/KEY|TOKEN/.test(key) && !complete(value)) throw new TypeError('Claude routing settings must not contain credential-shaped data.');
    options.env[key] = value;
  }
  // Do not read ambient credentials or widen the subprocess host's secret scrub.
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP']) if (typeof process.env[key] === 'string') options.env[key] = process.env[key];
  Object.assign(options.env, { CLAUDE_CONFIG_DIR: options.configDir, CLAUDE_AGENT_SDK_CLIENT_APP: 'dsh-x-agents/0.1.0',
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1', CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: 'false', CLAUDE_CODE_STARTUP_FAILURE_RESULTS: '1' });
  return options;
}
function authentication(account: any) {
  object(account);
  if (PROVIDERS.has(account.apiProvider) || API_SOURCES.has(account.apiKeySource)) return {
    state: 'configured-unverified', source: 'native-account-info',
    reason: 'The official runtime reports API/provider configuration. Account validity, model access and billing have not been tested.' };
  if (typeof account.tokenSource === 'string' && !['', 'none'].includes(account.tokenSource) || account.apiKeySource === 'oauth' || account.subscriptionType) return {
    state: 'unsupported', source: 'native-account-info', reason: 'This SDK adapter supports API-key or cloud-provider setup. Native subscription OAuth workflows are outside this adapter’s scope.' };
  return { state: 'unconfigured', source: 'native-account-info', reason: 'No supported API-key or cloud-provider configuration was reported by the official runtime.' };
}
function within(root: any, cwd: any) { const part = relative(root, cwd); return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part); }
function validPolicy(cwd: any, policy: any) { return typeof cwd === 'string' && isAbsolute(cwd) && policy && ['read-only', 'workspace-write', 'danger-full-access'].includes(policy.mode) && typeof policy.workspaceRoot === 'string' && isAbsolute(policy.workspaceRoot) && within(policy.workspaceRoot, cwd); }
function sdkOptions(options: any, owner: any, controller: any, cwd: any, discovery: any): Options {
  return { cwd, abortController: controller, ...(options.executable ? { pathToClaudeCodeExecutable: options.executable } : {}),
    env: { ...options.env }, spawnClaudeCodeProcess: owner.create, settingSources: [], strictMcpConfig: true, mcpServers: {}, plugins: [], skills: [],
    permissionMode: 'default', allowDangerouslySkipPermissions: false, allowedTools: [], disallowedTools: ['EnterPlanMode', 'ExitPlanMode'],
    settings: { disableAllHooks: true, disableBundledSkills: true, disableSkillShellExecution: true, autoMemoryEnabled: false,
      syncClaudeAiSkills: false, syncClaudeAiPlugins: false, permissions: { defaultMode: 'default', disableBypassPermissionsMode: 'disable' } },
    systemPrompt: { type: 'preset', preset: 'claude_code' }, includePartialMessages: true,
    persistSession: !discovery, promptSuggestions: false, agentProgressSummaries: false, verbatimPrompts: true,
    ...(discovery ? { tools: [] } : {}), stderr: () => {},
  };
}
function gatedPrompt(gate: any, stop: any, message?: any) {
  return (async function* () {
    const allowed = await Promise.race([gate.promise, stop.promise]);
    if (allowed && message) yield message;
    // Retain bidirectional input until our one native turn reaches a result.
    await stop.promise;
  })();
}

export function createClaudeAdapter({ spawn, config = {} }: any = {}) {
  if (typeof spawn !== 'function') throw new TypeError('Claude requires the managed subprocess spawn service.');
  const options = settings(config);
  const secrets = Object.entries(options.env as Record<string, string>).filter(([key, value]) => /KEY|TOKEN/.test(key) && value).map(([, value]) => value);
  const redactText = (value: any) => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), safeText(value));
  const redact = (value: any) => {
    const sanitized = safeData(value);
    const walk: any = (data: any) => typeof data === 'string' ? redactText(data) : Array.isArray(data) ? data.map(walk)
      : data && typeof data === 'object' ? Object.fromEntries(Object.entries(data).map(([key, item]) => [key, walk(item)])) : data;
    return walk(sanitized);
  };
  const isComplete = (value: any) => JSON.stringify(redact(value)) === JSON.stringify(value);
  const modelCatalog = (advertised: any) => {
    if (!Array.isArray(advertised) || advertised.length > 100) throw failure('Invalid Claude native model catalog.');
    const ids = new Set<any>();
    return advertised.map(item => {
      object(item); identifier(item.value);
      if (item.value.length > 160 || item.value.trim() !== item.value || /[\0\r\n]/.test(item.value) || !isComplete(item.value)
        || ids.has(item.value) || typeof item.displayName !== 'string' || !item.displayName.trim() || item.displayName.length > 512) throw failure('Invalid Claude model.');
      ids.add(item.value);
      return { id: item.value, label: redactText(item.displayName) };
    });
  };
  const backendIdentity = JSON.stringify({ runtime: 'claude', transport: 'agent-sdk', sdk: CLAUDE_SDK_VERSION,
    executable: options.executable ?? 'sdk-bundled-native', configDir: options.configDir, settings: 'isolated-default-once',
    providerRouting: Object.fromEntries(Object.entries(options.env as Record<string, string>).filter(([key]) => /^(CLAUDE_CODE_USE_|AWS_PROFILE$|AWS_REGION$|AWS_DEFAULT_REGION$|ANTHROPIC_VERTEX_PROJECT_ID$|CLOUD_ML_REGION$|GOOGLE_APPLICATION_CREDENTIALS$|ANTHROPIC_FOUNDRY_RESOURCE$|ANTHROPIC_BASE_URL$|ANTHROPIC_FOUNDRY_BASE_URL$)/.test(key)).sort(([a], [b]) => a.localeCompare(b))),
    searchPath: !isAbsolute(options.executable ?? '') || /\.(?:[cm]?js|tsx?|jsx)$/.test(options.executable ?? '') ? options.env.PATH ?? null : null,
    configuredCredentialFields: Object.keys(config.env ?? {}).filter(key => /KEY|TOKEN/.test(key)).sort() });

  async function discover({ cwd, signal, sandboxPolicy }: any = {}) {
    const result: NativeDiscovery = { available: false, authenticated: null, version: null, models: [], capabilities: CAPABILITIES,
      authentication: { state: 'requires-native-initialization', source: 'version-only',
        reason: 'Only the official binary version was checked. Native configuration, account validity, model access and billing remain unverified until an approved launch.' } };
    if (!validPolicy(cwd, sandboxPolicy)) return { ...result, reason: 'Claude discovery requires a host sandbox policy and an absolute workspace folder.' };
    if (!options.executable) return { ...result, reason: 'Install the pinned official Claude Agent SDK native binary for this platform.' };
    const owner = new ClaudeProcessOwner(spawn, options), controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel();
    let text = '';
    try {
      controller.signal.throwIfAborted();
      const shell = owner.create({ command: options.executable, args: ['--version'], cwd, env: options.env, signal: controller.signal });
      const ended = deferred();
      shell.on('exit', (code) => ended.resolve(code));
      shell.stdout.on('data', (chunk: any) => { if (text.length < 8192) text += String(chunk).slice(0, 8192 - text.length); });
      const code = await deadline(owner.guard(ended.promise, controller.signal), options.requestTimeoutMs, controller.signal);
      await new Promise<any>(resolve => setImmediate(resolve));
      const match = /^(\d+\.\d+\.\d+) \(Claude Code\)\s*$/m.exec(text.trim());
      if (code !== 0 || !match || match[1] !== CLI_VERSION) return { ...result, reason: 'The official Claude binary version must match the pinned Agent SDK (2.1.302).' };
      result.version = match[1]; result.available = true; result.reason = result.authentication!.reason;
      return result;
    } catch {
      return { ...result, reason: signal?.aborted ? 'Claude discovery cancelled.' : 'The official Claude binary could not report its version. No native initialization or model request was sent.' };
    } finally { controller.abort(); signal?.removeEventListener('abort', cancel); await owner.close(); }
  }

  // The host must approve and fence this native initialization independently of
  // ordinary version-only discovery. This operation never submits a user turn.
  async function discoverModels({ cwd, signal, sandboxPolicy }: any = {}) {
    const result: NativeDiscovery = { available: false, authenticated: null, version: null, models: [], capabilities: CAPABILITIES,
      authentication: { state: 'requires-native-initialization', source: 'version-only', reason: 'Native configuration has not been initialized.' },
      modelCatalog: { source: 'native-initialization', accessVerified: false } };
    if (!validPolicy(cwd, sandboxPolicy)) return { ...result, reason: 'Claude model discovery requires a host sandbox policy and an absolute workspace folder.' };
    if (!options.executable) return { ...result, reason: 'Install the pinned official Claude Agent SDK native binary for this platform.' };
    const owner = new ClaudeProcessOwner(spawn, options), controller = new AbortController(), gate = deferred(), stop = deferred();
    let query, unexpectedRequest = false;
    const cancel = () => { controller.abort(); stop.resolve(false); gate.resolve(false); };
    signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel();
    try {
      controller.signal.throwIfAborted();
      query = nativeQuery({ prompt: gatedPrompt(gate, stop), options: {
        ...sdkOptions(options, owner, controller, cwd, true),
        canUseTool: async () => { unexpectedRequest = true; return { behavior: 'deny', message: 'Model discovery cannot execute tools.', interrupt: true }; },
        onElicitation: async () => { unexpectedRequest = true; return { action: 'cancel' }; },
        onUserDialog: async () => { unexpectedRequest = true; return { behavior: 'cancelled' }; },
      } });
      const initialized = object(await deadline(owner.guard(query.initializationResult(), controller.signal), options.requestTimeoutMs, controller.signal));
      if (initialized.claude_code_version !== CLI_VERSION) return { ...result, reason: 'The installed Claude binary does not match the pinned SDK version.' };
      const auth = authentication(await owner.guard(query.accountInfo(), controller.signal));
      const models = modelCatalog(await owner.guard(query.supportedModels(), controller.signal));
      if (unexpectedRequest) throw failure('Claude requested an action during model discovery.');
      return { ...result, available: true, version: CLI_VERSION, models, authentication: auth,
        reason: `The native runtime advertised this model catalog; model access and billing are unverified. ${auth.reason}` };
    } catch {
      return { ...result, reason: signal?.aborted ? 'Claude model discovery cancelled.' : 'Claude model discovery failed. No user prompt was submitted.' };
    } finally {
      cancel(); signal?.removeEventListener('abort', cancel); await owner.close(query);
    }
  }

  async function run({ prompt, model, cwd, nativeSessionId, sandboxPolicy, signal, onEvent, requestPermission, requestInput }: any = {}) {
    let sessionId = nativeSessionId ?? null, summary = '', usage: any, blockedReason: any;
    const result = (status: any, reason?: any) => ({ nativeSessionId: sessionId, status, summary: redactText(summary), ...(reason ? { reason } : {}), ...(usage ? { usage } : {}) });
    if (signal?.aborted) return result('cancelled');
    const maxPromptChars = sandboxPolicy?.mode === 'read-only' ? 64_000 : 12_000;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > maxPromptChars || !isComplete(prompt)) return result('blocked', `A nonempty task prompt of at most ${maxPromptChars} characters without credentials is required.`);
    if (!validPolicy(cwd, sandboxPolicy)) return result('blocked', 'Claude requires a host sandbox policy and a folder inside its workspace.');
    if (nativeSessionId != null && !UUID.test(nativeSessionId)) return result('blocked', 'Claude resume requires an exact native session UUID.');
    if (model != null && (typeof model !== 'string' || !model.trim() || model.length > 160 || !isComplete(model))) return result('blocked', 'Choose a valid Claude model.');
    const expectedSessionId = sessionId ?? randomUUID(), epoch = randomUUID(), controller = new AbortController();
    const owner = new ClaudeProcessOwner(spawn, options), gate = deferred(), stop = deferred(), sessionReady = deferred(), nativeReady = deferred();
    const seen = new Set<any>(), handlers = new Set<any>(), inputTools = new Set<any>();
    let query: any, terminal = false, closed = false, eventTail = Promise.resolve(), models: any[] = [];
    const streamMessages = new Map<any, any>();
    const emit = (event: any) => {
      const next = eventTail.then(async () => { if (!closed && !controller.signal.aborted && onEvent) await abortable(Promise.resolve().then(() => onEvent(redact(event))), controller.signal); });
      eventTail = next.catch(() => {}); return next;
    };
    const block = async (reason: any) => { blockedReason ??= reason; await emit({ type: 'status', text: reason, data: { status: 'blocked' } }); };
    const cancel = () => { if (query && !terminal) void query.interrupt({ cancelQueued: true }).catch(() => {}); controller.abort(); stop.resolve(false); gate.resolve(false); };
    signal?.addEventListener('abort', cancel, { once: true });
    const deny = (message: any, toolUseID: any): PermissionResult => ({ behavior: 'deny', message, interrupt: true, ...(toolUseID ? { toolUseID } : {}) });
    const request = async (toolName: any, input: any, meta: any): Promise<PermissionResult> => {
      let toolUseID;
      try {
        toolUseID = identifier(meta.toolUseID); identifier(meta.requestId); object(input); input = structuredClone(input);
        const localSignal = AbortSignal.any([controller.signal, meta.signal, owner.requestController.signal].filter(Boolean));
        if (terminal || closed || owner.nativeResultReceived || localSignal.aborted) return deny('The native request is no longer active.', toolUseID);
        const key = `${meta.requestId}:${toolUseID}`;
        if (seen.has(meta.requestId) || seen.has(`tool:${toolUseID}`)) { await block('Claude repeated a native permission request; it was denied.'); return deny('Repeated request.', toolUseID); }
        if (seen.size >= 4096) throw failure('Claude request limit exceeded.');
        seen.add(meta.requestId); seen.add(`tool:${toolUseID}`);
        await deadline(nativeReady.promise, options.requestTimeoutMs, localSignal);
        localSignal.throwIfAborted();
        const requestId = `${epoch}:${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
        if (toolName === 'AskUserQuestion') {
          inputTools.add(toolUseID);
          if (!requestInput || !Array.isArray(input.questions) || !input.questions.length || input.questions.length > 4 || !isComplete(input) || SECRET_QUESTION.test(JSON.stringify(input))) {
            await block('Claude requested unsupported or sensitive input. Use the official secure setup flow for credentials.');
            return deny(blockedReason, toolUseID);
          }
          const texts = new Set<any>();
          const questions = input.questions.map((question: any, index: any) => {
            object(question);
            if (typeof question.question !== 'string' || !question.question.trim() || texts.has(question.question) || !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 4 || typeof question.multiSelect !== 'boolean') throw failure('Claude returned unsupported questions.');
            texts.add(question.question);
            const labels = new Set<any>();
            const choices = question.options.map((option: any) => {
              if (!option || typeof option.label !== 'string' || !option.label.trim() || labels.has(option.label) || option.preview != null || (option.description != null && typeof option.description !== 'string')) throw failure('Claude returned unsupported question options.');
              labels.add(option.label); return { label: option.label, description: option.description ?? '' };
            });
            return { id: `q${index + 1}`, question: question.question, header: question.header, options: choices, multiSelect: question.multiSelect };
          });
          const answer = await abortable(Promise.resolve().then(() => requestInput({ id: requestId, nativeSessionId: sessionId, nativeRequestId: meta.requestId,
            title: 'Claude needs your input', questions: structuredClone(questions), signal: localSignal })), localSignal);
          localSignal.throwIfAborted(); if (terminal || closed || owner.nativeResultReceived) return deny('The native request expired.', toolUseID);
          if (!answer || !Array.isArray(answer.answers) || answer.answers.length !== questions.length || !isComplete(answer)) { await block('Claude input was cancelled or incomplete.'); return deny(blockedReason, toolUseID); }
          const answers = Object.create(null), ids = new Set<any>();
          for (const item of answer.answers) {
            const question = questions.find((q: any) => q.id === item.id);
            if (!question || ids.has(item.id) || !Array.isArray(item.selected) || item.selected.some((label: any) => !question.options.some((option: any) => option.label === label)) || new Set(item.selected).size !== item.selected.length || (!question.multiSelect && item.selected.length > 1) || (item.custom != null && typeof item.custom !== 'string')) throw failure('Host returned invalid Claude answers.');
            ids.add(item.id);
            const values = [...item.selected, ...(item.custom?.trim() ? [item.custom.trim()] : [])];
            if (!values.length || values.join(', ').length > 4000) throw failure('Host returned incomplete Claude answers.');
            answers[question.question] = values.join(', ');
          }
          return { behavior: 'allow', updatedInput: { ...input, answers }, toolUseID };
        }
        if (typeof toolName !== 'string' || !toolName || toolName.length > 200) throw failure('Invalid Claude tool name.');
        const details = { toolName, input, metadata: Object.fromEntries(Object.entries(meta).filter(([key]) => !['signal', 'suggestions'].includes(key))) };
        if (['ExitPlanMode', 'EnterPlanMode'].includes(toolName)) { await block('Native permission-mode transitions are unsupported; continue in default mode.'); return deny(blockedReason, toolUseID); }
        if (!requestPermission || !isComplete(details) || JSON.stringify(details).length > 6000) { await block('Claude requested permission with unavailable, sensitive or incomplete scope.'); return deny(blockedReason, toolUseID); }
        const answer = await abortable(Promise.resolve().then(() => requestPermission({ id: requestId, nativeSessionId: sessionId, nativeRequestId: meta.requestId,
          kind: 'tool', title: `Allow Claude ${toolName} once?`, details: structuredClone(details), scopeComplete: true, signal: localSignal, defaultRejectOptionId: 'deny',
          options: [{ id: 'allow', label: 'Allow this tool call once', kind: 'allow_once' }, { id: 'deny', label: 'Deny', kind: 'reject_once' }] })), localSignal);
        localSignal.throwIfAborted(); if (terminal || closed || owner.nativeResultReceived) return deny('The native request expired.', toolUseID);
        if (answer?.optionId !== 'allow') { await block('Claude permission was declined.'); return deny(blockedReason, toolUseID); }
        // Never echo SDK suggestions/updatedPermissions: those grant future calls.
        return { behavior: 'allow', updatedInput: input, toolUseID };
      } catch {
        if (!controller.signal.aborted && !owner.nativeResultReceived) await block('Claude native request could not be safely answered.');
        return deny('The request was cancelled or could not be safely answered.', toolUseID);
      }
    };
    const handle: CanUseTool = (...args: Parameters<CanUseTool>) => { const promise = request(...args); handlers.add(promise); promise.finally(() => handlers.delete(promise)).catch(() => {}); return promise; };
    try {
      signal?.throwIfAborted();
      query = nativeQuery({ prompt: gatedPrompt(gate, stop, { type: 'user', session_id: expectedSessionId, uuid: randomUUID(),
        message: { role: 'user', content: prompt }, parent_tool_use_id: null }), options: {
        ...sdkOptions(options, owner, controller, cwd, false), ...(nativeSessionId ? { resume: nativeSessionId } : { sessionId: expectedSessionId }), ...(model ? { model } : {}),
        canUseTool: handle,
        onElicitation: async () => { await block('Claude MCP elicitation is unsupported.'); return { action: 'cancel' }; },
        onUserDialog: async () => { await block('Claude requested an unsupported native dialog.'); return { behavior: 'cancelled' }; },
      } });
      const initialized = object(await deadline(owner.guard(query.initializationResult(), controller.signal), options.requestTimeoutMs, controller.signal));
      if (initialized.claude_code_version !== CLI_VERSION) return result('blocked', 'The installed Claude binary does not match the pinned SDK version.');
      const auth = authentication(await owner.guard(query.accountInfo(), controller.signal));
      if (auth.state !== 'configured-unverified') return result('blocked', auth.reason);
      models = modelCatalog(await owner.guard(query.supportedModels(), controller.signal));
      if (model && !models.some(item => item.id === model)) return result('blocked', 'The selected model is not advertised by this Claude runtime.');
      // The SDK's native system/init arrives only after the first user message.
      // Persist the exact host-assigned SDK session reservation BEFORE releasing it.
      sessionId = expectedSessionId;
      await emit({ type: 'session', data: { nativeSessionId: sessionId, models, provenance: nativeSessionId ? 'existing-session' : 'host-reserved', nativeConfirmed: false } });
      sessionReady.settled = true; sessionReady.resolve(true);
      gate.resolve(true);
      const iterator = query[Symbol.asyncIterator]();
      while (true) {
        const next = await owner.guard(iterator.next(), controller.signal);
        if (next.done) break;
        const message = object(next.value);
        if (message.type === 'result' && message.session_id == null) throw failure('Claude terminal result omitted its native session identity.');
        if (message.session_id != null) {
          if (!UUID.test(message.session_id) || message.session_id !== expectedSessionId) throw failure('Claude returned another native session.');
          if (!sessionReady.confirmed && message.type === 'system' && message.subtype === 'init') {
            sessionId = message.session_id;
            await emit({ type: 'session', data: { nativeSessionId: sessionId, models, provenance: 'native-message', nativeConfirmed: true } });
            sessionReady.confirmed = true;
          }
        }
        if (message.permissionMode != null && message.permissionMode !== 'default') throw failure('Claude changed its native permission mode.');
        if (message.type === 'conversation_reset') throw failure('Claude unexpectedly changed its native session.');
        if (message.type === 'system' && message.subtype === 'init') {
          if (message.permissionMode !== 'default' || message.claude_code_version !== CLI_VERSION) throw failure('Claude reported an unsupported native initialization.');
          nativeReady.resolve(true);
          await emit({ type: 'status', data: { phase: 'initialized', nativeSessionId: sessionId, model: message.model, version: message.claude_code_version } });
        } else if (message.type === 'stream_event') {
          const event = message.event;
          const streamKey = message.parent_tool_use_id ?? null;
          if (event?.type === 'message_start') { streamMessages.set(streamKey, event.message?.id); if (streamKey === null) summary = ''; }
          if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
            if (streamKey === null) summary = (summary + event.delta.text).slice(-options.maxFrameBytes);
            await emit({ type: 'assistant', text: event.delta.text, data: { delta: true, messageId: streamMessages.get(streamKey) ?? message.uuid, partId: String(event.index ?? 0) } });
          }
        } else if (message.type === 'assistant') {
          const contentBlocks = message.message?.content ?? [];
          if (message.parent_tool_use_id == null) summary = contentBlocks.filter((content: any) => content.type === 'text' && typeof content.text === 'string').map((content: any) => content.text).join('\n');
          for (const [partIndex, content] of contentBlocks.entries()) {
            if (content.type === 'text' && typeof content.text === 'string') { await emit({ type: 'assistant', text: content.text, data: { delta: false, messageId: message.message?.id ?? message.uuid, partId: String(partIndex) } }); }
            else if (content.type === 'tool_use' && content.name === 'AskUserQuestion') { inputTools.add(content.id); await emit({ type: 'input', data: { id: content.id, phase: 'native-question' } }); }
            else if (content.type === 'tool_use') await emit({ type: ['TodoWrite', 'EnterPlanMode', 'ExitPlanMode'].includes(content.name) ? 'plan' : 'tool', data: { id: content.id, name: content.name, input: content.input, phase: 'started' } });
          }
        } else if (message.type === 'user') {
          for (const content of Array.isArray(message.message?.content) ? message.message.content : []) if (content.type === 'tool_result') await emit(inputTools.has(content.tool_use_id)
            ? { type: 'input', data: { id: content.tool_use_id, phase: 'answered', isError: content.is_error === true } }
            : { type: 'tool', data: { id: content.tool_use_id, output: content.content, isError: content.is_error === true, phase: 'completed' } });
        } else if (message.type === 'result') {
          terminal = true;
          if (!sessionReady.confirmed && message.subtype === 'success' && message.is_error === false) throw failure('Claude completed without confirming native initialization.');
          if (message.subtype === 'success' && typeof message.result === 'string') summary = message.result;
          usage = redact({ usage: message.usage, modelUsage: message.modelUsage, totalCostUsd: message.total_cost_usd, turns: message.num_turns });
          await emit({ type: 'usage', data: usage });
          const status = blockedReason ? 'blocked' : message.subtype === 'success' && message.is_error === false ? 'completed' : 'failed';
          await emit({ type: 'status', data: { status, subtype: message.subtype, nativeSessionId: sessionId } });
          return result(status, blockedReason ?? (status === 'failed' ? 'Claude reported an unsuccessful native turn. Check its official setup if authentication failed.' : undefined));
        } else if (['tool_progress', 'tool_use_summary'].includes(message.type)) {
          const ids = message.preceding_tool_use_ids ?? [message.tool_use_id];
          if (ids.some((id: any) => inputTools.has(id))) await emit({ type: 'input', data: { phase: 'answered' } });
          else await emit({ type: 'tool', data: { ...message, session_id: undefined } });
        }
        else if (message.type === 'system' || ['auth_status', 'permission_denied', 'rate_limit_event'].includes(message.type)) await emit({ type: 'status', data: { type: message.type, subtype: message.subtype ?? null } });
      }
      return result(blockedReason ? 'blocked' : 'failed', blockedReason ?? 'Claude ended without a terminal native result.');
    } catch {
      return result(signal?.aborted ? 'cancelled' : blockedReason ? 'blocked' : 'failed', signal?.aborted ? undefined : blockedReason ?? 'Claude native execution or protocol failed.');
    } finally {
      closed = true; stop.resolve(false); gate.resolve(false); controller.abort(); signal?.removeEventListener('abort', cancel);
      await owner.close(query);
      await deadline(Promise.allSettled([eventTail, ...handlers]), options.cleanupTimeoutMs, undefined).catch(() => { throw failure('Claude callback cleanup could not be confirmed.', 'AGENTS_CLEANUP_UNCONFIRMED'); });
    }
  }
  return { id: 'claude', transport: 'agent-sdk', capabilities: CAPABILITIES, backendIdentity, discover, discoverModels, run };
}
