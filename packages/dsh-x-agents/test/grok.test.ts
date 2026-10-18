import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { createGrokAdapter } from '../src/adapters/grok.ts';
import { deferred } from '../src/adapters/grok-rpc.ts';

const capturedInit = JSON.parse(readFileSync(new URL('./fixtures/grok/initialize-1.0.62.json', import.meta.url), 'utf8'));
const cwd = '/workspace/project', sandboxPolicy: any = { mode: 'workspace-write', workspaceRoot: cwd };
const input: any = { prompt: 'Inspect this fixture.', cwd, sandboxPolicy };
const tick = () => new Promise<any>(resolve => setImmediate(resolve));
function fixture({ onMessage, onPrompt, configured = true, version = 'grok 1.0.62 (1474f9cbdd91)', waitForExit, config, stallWrites = false }: any = {}) {
  const spawns: any = [], messages: any = [], children: any = [], errors: any = [];
  function spawn(spec: any) {
    spawns.push(spec);
    const exited = deferred(), stdout = new PassThrough(), stderr = new PassThrough();
    const child: any = { stdout, stderr, done: exited.promise, terminated: 0, waited: 0,
      terminate() { this.terminated++; exited.resolve({ exitCode: null, signal: 'SIGTERM' }); },
      async waitForExit(signal: any) { this.waited++; return waitForExit ? waitForExit(signal, child) : this.terminated > 0; },
      frame(value: any) { stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...value })}\n`); },
      reply(request: any, result: any) { this.frame({ id: request.id, result }); },
      notify(method: any, params: any) { this.frame({ method, params }); },
      update(update: any, sessionId = 'native-fixture') { this.notify('session/update', { sessionId, update }); },
      exit() { stdout.end(); exited.resolve({ exitCode: 0, signal: null }); },
    };
    ;(child as any).stdin = new Writable({ write(chunk, encoding, callback) {
      if (stallWrites) return;
      const message = JSON.parse(String(chunk)); messages.push(message); callback();
      void Promise.resolve().then(async () => {
        if (await onMessage?.(message, child)) return;
        if (!message.method || !Object.hasOwn(message, 'id')) return;
        switch (message.method) {
          case 'initialize': {
            const init = structuredClone(capturedInit);
            if (configured) { init.authMethods.unshift({ id: 'cached_token', name: 'Cached token' }); init._meta.defaultAuthMethodId = 'cached_token'; }
            child.reply(message, init); break;
          }
          case 'session/new': child.reply(message, { sessionId: 'native-fixture', models: capturedInit._meta.modelState }); break;
          case 'session/load': child.reply(message, { models: capturedInit._meta.modelState }); break;
          case 'session/set_model': child.reply(message, {}); break;
          case 'session/prompt': if (onPrompt) await onPrompt(child, message); else finish(child, message); break;
        }
      }).catch(error => errors.push(error));
    } });
    children.push(child);
    if (spec.argv.at(-1) === '--version') queueMicrotask(() => { stdout.write(`${version}\n`); exited.resolve({ exitCode: 0, signal: null }); });
    return child;
  }
  const adapter = createGrokAdapter({ spawn, config: { nativeHome: '/workspace/native-grok', requestTimeoutMs: 80, cleanupTimeoutMs: 80, ...config } });
  return { spawn, adapter, spawns, messages, children, errors };
}
function finish(child: any, message: any, stopReason = 'end_turn') {
  child.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Fixture answer.' } }, message.params.sessionId);
  child.reply(message, { stopReason, _meta: { sessionId: message.params.sessionId, usage: { inputTokens: 11, outputTokens: 2 } } });
}
function permission(child: any, overrides: any = {}, requestId = 77) {
  child.frame({ id: requestId, method: 'session/request_permission', params: {
    sessionId: 'native-fixture', toolCall: { toolCallId: 'tool-fixture', title: 'Run git status', kind: 'execute', rawInput: { command: 'git status' } },
    options: [{ optionId: 'always-allow', name: 'Allow always', kind: 'allow_always' }, { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' }], ...overrides,
  } });
}
function question(child: any, overrides: any = {}) {
  child.frame({ id: 78, method: '_x.ai/ask_user_question', params: {
    sessionId: 'native-fixture', toolCallId: 'question-tool', mode: 'default',
    questions: [{ question: 'Which color?', options: [{ label: 'Blue', description: 'Cool color' }, { label: 'Red', description: 'Warm color' }], multiSelect: false }], ...overrides,
  } });
}

test('discovery is version-only: no initialize, login, native catalog, or authentication claims', async () => {
  const f = fixture(); const result = await f.adapter.discover({ cwd });
  assert.equal(result.available, true); assert.equal(result.version, '1.0.62'); assert.equal(result.authenticated, null);
  assert.deepEqual(result.models, []); assert.deepEqual(result.authentication, { state: 'requires-native-initialization', source: 'version-only' });
  assert.deepEqual(f.spawns.map((spec: any) => spec.argv), [['grok', '--version']]); assert.deepEqual(f.messages, []);
  assert.ok(f.children.every((child: any) => child.terminated === 1 && child.waited === 1));
});
test('discovery rejects unrelated or obsolete executables and drains secrets from stderr', async () => {
  for (const version of ['other 1.0.62', 'grok 0.2.10', 'grok-cli 1.0.62', 'grok 2.0.0'] as const) {
    const f = fixture({ version }); assert.equal((await f.adapter.discover({ cwd })).available, false);
  }
  const adapter = createGrokAdapter({ spawn() { throw new Error('SECRET=hidden'); } });
  assert.ok(!JSON.stringify(await adapter.discover({ cwd })).includes('hidden'));
});
test('approved model discovery reads initialize catalog with or without configured authentication and never creates a session', async () => {
  for (const configured of [false, true] as const) {
    const f = fixture({ configured });
    const result = await f.adapter.discoverModels({ cwd, sandboxPolicy });
    assert.equal(result.available, true); assert.equal(result.version, '1.0.62'); assert.equal(result.authenticated, null);
    assert.deepEqual(result.models, [{ id: 'grok-4.6', label: 'Grok 4.6' }, { id: 'grok-4.5', label: 'Grok 4.5' }]);
    assert.deepEqual(result.authentication, { state: configured ? 'configured-unverified' : 'unconfigured', source: 'native-initialize' });
    assert.deepEqual(f.messages.map((message: any) => message.method), ['initialize']);
    assert.deepEqual(f.messages[0].params.clientCapabilities, { fs: { readTextFile: false, writeTextFile: false }, terminal: false });
    assert.deepEqual(f.spawns.map((spec: any) => spec.argv), [['grok', '--version'], ['grok', 'agent', '--no-leader', 'stdio']]);
    assert.ok(f.children.every((child: any) => child.terminated && child.waited));
  }
});
test('model discovery requires a bound policy and honors cancellation before spawning', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.adapter.discoverModels({ cwd, sandboxPolicy, signal: controller.signal }), { code: 'ABORT_ERR' });
  await assert.rejects(f.adapter.discoverModels({ cwd }));
  await assert.rejects(f.adapter.discoverModels({ cwd: '/elsewhere', sandboxPolicy }));
  assert.equal(f.spawns.length, 0);
});
test('model discovery rejects malformed, missing or oversized catalogs and mismatched native identity', async () => {
  for (const mutate of [
    (init: any) => { delete init._meta.modelState; },
    (init: any) => { init._meta.modelState = {}; },
    (init: any) => { init._meta.modelState.availableModels = Array.from({ length: 101 }, (_, i) => ({ modelId: `model-${i}` })); },
    (init: any) => { init._meta.modelState.availableModels.push(init._meta.modelState.availableModels[0]); },
    (init: any) => { init._meta.agentVersion = '1.0.99'; },
    (init: any) => { init._meta.grokShell = false; },
  ]) {
    const f = fixture({ onMessage(message: any, child: any) { if (message.method !== 'initialize') return; const init = structuredClone(capturedInit); mutate(init); child.reply(message, init); return true; } });
    await assert.rejects(f.adapter.discoverModels({ cwd, sandboxPolicy }));
    assert.deepEqual(f.messages.map((message: any) => message.method), ['initialize']);
    assert.ok(f.children.every((child: any) => child.terminated && child.waited));
  }
});
test('empty native model catalogs remain empty and unsupported authentication is not verified', async () => {
  const f = fixture({ onMessage(message: any, child: any) {
    if (message.method !== 'initialize') return;
    const init = structuredClone(capturedInit); init._meta.modelState.availableModels = []; init._meta.defaultAuthMethodId = 'unknown-auth'; child.reply(message, init); return true;
  } });
  const result = await f.adapter.discoverModels({ cwd, sandboxPolicy });
  assert.deepEqual(result.models, []); assert.equal(result.capabilities.models, false); assert.equal(result.authenticated, null);
  assert.deepEqual(result.authentication, { state: 'unsupported', source: 'native-initialize' });
});
test('model discovery cancellation during initialize drains and terminates its owned process', async () => {
  const controller = new AbortController(), entered = deferred();
  const f = fixture({ onMessage(message: any) { if (message.method === 'initialize') { entered.resolve(); return true; } } });
  const running = f.adapter.discoverModels({ cwd, sandboxPolicy, signal: controller.signal });
  await entered.promise; controller.abort();
  await assert.rejects(running, { code: 'ABORT_ERR' });
  assert.deepEqual(f.messages.map((message: any) => message.method), ['initialize']);
  assert.ok(f.children.every((child: any) => child.terminated && child.waited));
});
test('model discovery rejects unexpected client actions instead of performing them', async () => {
  const f = fixture({ onMessage(message: any, child: any) {
    if (message.method !== 'initialize') return;
    child.frame({ id: 'client-action', method: 'fs/read_text_file', params: { sessionId: 'not-created', path: '/private' } });
    child.reply(message, structuredClone(capturedInit)); return true;
  } });
  await assert.rejects(f.adapter.discoverModels({ cwd, sandboxPolicy }));
  assert.ok(f.children.every((child: any) => child.terminated && child.waited));
  assert.ok(!f.messages.some((message: any) => message.id === 'client-action' && Object.hasOwn(message, 'result')));
});
test('model discovery cleanup uncertainty is thrown even after a valid catalog or cancellation', async () => {
  for (const cancelled of [false, true] as const) {
    const controller = new AbortController(); let checks = 0;
    const f = fixture({ waitForExit: () => ++checks === 1,
      onMessage(message: any) { if (cancelled && message.method === 'initialize') { controller.abort(); return true; } },
    });
    await assert.rejects(f.adapter.discoverModels({ cwd, sandboxPolicy, signal: controller.signal }), { code: 'AGENTS_CLEANUP_UNCONFIRMED' });
  }
});
test('model discovery cancellation during successful cleanup cannot publish a catalog', async () => {
  const controller = new AbortController(); let checks = 0;
  const f = fixture({ waitForExit() { if (++checks === 2) controller.abort(); return true; } });
  await assert.rejects(f.adapter.discoverModels({ cwd, sandboxPolicy, signal: controller.signal }), { code: 'ABORT_ERR' });
  assert.ok(f.children.every((child: any) => child.terminated && child.waited));
});
test('model discovery initialize and cleanup deadlines fail without publishing a catalog', async () => {
  const timedOut = fixture({ config: { requestTimeoutMs: 15 }, onMessage(message: any) { if (message.method === 'initialize') return true; } });
  await assert.rejects(timedOut.adapter.discoverModels({ cwd, sandboxPolicy }), { code: 'AGENTS_GROK_TIMEOUT' });
  assert.ok(timedOut.children.every((child: any) => child.terminated && child.waited));
  let checks = 0;
  const unknown = fixture({ config: { cleanupTimeoutMs: 15 }, waitForExit: () => ++checks === 1 ? true : new Promise<any>(() => {}) });
  await assert.rejects(unknown.adapter.discoverModels({ cwd, sandboxPolicy }), { code: 'AGENTS_CLEANUP_UNCONFIRMED' });
});
test('new run checkpoints native session before model selection or prompt and publishes actual models', async () => {
  const f = fixture(); const events: any = [];
  const result = await f.adapter.run({ ...input, model: 'grok-4.5', onEvent: async (event: any) => {
    if (event.type === 'session') { await tick(); assert.ok(!f.messages.some((m: any) => m.method === 'session/prompt')); }
    events.push(event);
  } });
  assert.equal(result.status, 'completed'); assert.equal(result.nativeSessionId, 'native-fixture'); assert.equal(result.summary, 'Fixture answer.');
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 2 });
  assert.deepEqual(f.spawns.map((s: any) => s.argv), [['grok', '--version'], ['grok', 'agent', '--no-leader', 'stdio']]);
  assert.equal(f.spawns[1].env.GROK_HOME, '/workspace/native-grok'); assert.ok(f.messages.every((m: any) => m.jsonrpc === '2.0'));
  const session = f.messages.find((m: any) => m.method === 'session/new');
  assert.deepEqual(session.params._meta, { yoloMode: false, autoMode: false, noReplay: true, 'x.ai/restore_code': false, 'x.ai/skip_envrc': true });
  assert.equal(events[0].type, 'session'); assert.deepEqual(events.find((e: any) => e.data?.models)?.data.models, [{ id: 'grok-4.6', label: 'Grok 4.6' }, { id: 'grok-4.5', label: 'Grok 4.5' }]);
  assert.equal(f.messages.find((m: any) => m.method === 'session/set_model').params.modelId, 'grok-4.5');
  assert.ok(events.find((e: any) => e.type === 'assistant').data.messageId);
});
test('native home is part of the nonsecret backend identity and unsafe config cannot override routing', () => {
  const f = fixture(); assert.match(f.adapter.backendIdentity, /native-grok/);
  assert.notEqual(f.adapter.backendIdentity, fixture({ config: { nativeHome: '/another' } }).adapter.backendIdentity);
  for (const patch of [{ args: ['--always-approve'] }, { env: {} }, { nativeHome: 'relative' }, { leader: true }, { executable: 'xai-abcdefghijklmnop' }] as const) assert.throws(() => fixture({ config: patch }));
});
test('host policy and slash-command protections block before any process launch', async () => {
  const f = fixture();
  for (const patch of [{ sandboxPolicy: undefined }, { cwd: '/etc' }, { prompt: '/always-approve on' }, { prompt: '   /model change' }] as const) assert.equal((await f.adapter.run({ ...input, ...patch })).status, 'blocked');
  assert.equal(f.spawns.length, 0);
});
test('unconfigured runtime never calls authenticate, starts a session, or prompts', async () => {
  const f = fixture({ configured: false }); const result = await f.adapter.run(input);
  assert.equal(result.status, 'blocked'); assert.deepEqual(f.messages.map((m: any) => m.method), ['initialize']);
});
test('incorrect official handshake and unknown models fail before session startup', async () => {
  const f = fixture({ onMessage(message: any, child: any) { if (message.method === 'initialize') { child.reply(message, { protocolVersion: 1, _meta: { grokShell: false } }); return true; } } });
  assert.equal((await f.adapter.run(input)).status, 'failed');
  const unknown = fixture(); assert.equal((await unknown.adapter.run({ ...input, model: 'imaginary-model' })).status, 'blocked'); assert.ok(!unknown.messages.some((m: any) => m.method === 'session/new'));
});
test('resume uses the exact persistent session without automatic fallback', async () => {
  const f = fixture(); const result = await f.adapter.run({ ...input, nativeSessionId: 'existing' });
  assert.equal(result.status, 'completed'); assert.equal(result.nativeSessionId, 'existing');
  assert.equal(f.messages.find((m: any) => m.method === 'session/load').params.sessionId, 'existing'); assert.ok(!f.messages.some((m: any) => m.method === 'session/new'));
  for (const different of [true, false] as const) {
    const broken = fixture({ onMessage(message: any, child: any) {
      if (message.method !== 'session/load') return;
      child.frame(different ? { id: message.id, result: { sessionId: 'different' } } : { id: message.id, error: { code: -32002, message: 'missing' } }); return true;
    } });
    assert.equal((await broken.adapter.run({ ...input, nativeSessionId: 'existing' })).status, 'failed');
    assert.ok(!broken.messages.some((m: any) => ['session/new', 'session/prompt'].includes(m.method)));
  }
});
test('malformed session model catalog cannot erase an already checkpointed native identity', async () => {
  const events: any = []; const f = fixture({ onMessage(m: any, c: any) { if (m.method === 'session/new') { c.reply(m, { sessionId: 'native-fixture', models: {} }); return true; } } });
  assert.equal((await f.adapter.run({ ...input, onEvent: (e: any) => events.push(e) })).status, 'failed');
  assert.equal(events[0].data.nativeSessionId, 'native-fixture'); assert.ok(!f.messages.some((m: any) => m.method === 'session/prompt'));
});
test('one-time approval maps only the exact option and duplicate identical request prompts once', async () => {
  let calls = 0, promptMessage: any; const f = fixture({ onPrompt(child: any, message: any) { promptMessage = message; permission(child); permission(child); },
    onMessage(message: any, child: any) { if (message.id === 77 && message.result) { finish(child, promptMessage); return true; } } });
  const result = await f.adapter.run({ ...input, requestPermission(request: any) {
    calls++; assert.equal(request.nativeSessionId, 'native-fixture'); assert.ok(request.signal); assert.deepEqual(request.options.map((o: any) => o.id), ['allow-once', 'reject-once']); return { optionId: 'allow-once' };
  } });
  assert.equal(result.status, 'completed'); assert.equal(calls, 1);
  assert.deepEqual(f.messages.find((m: any) => m.id === 77).result, { outcome: { outcome: 'selected', optionId: 'allow-once' } });
});
test('persistent, unknown, pseudo-once, missing callbacks and sensitive permission data fail closed', async () => {
  const cases = [
    { options: [{ optionId: 'enable-always-approve', name: 'Enable all', kind: 'allow_once' }] },
    { options: [{ optionId: 'allow-once', name: 'Unknown', kind: 'allow_session' }] },
    { options: [{ optionId: 'allow-once', name: 'Session', kind: 'allow_always' }] },
    { toolCall: { toolCallId: 'secret', rawInput: { API_KEY: 'do-not-show' } } },
  ];
  for (const extra of cases) {
    const f = fixture({ onPrompt(child: any) { permission(child, extra); } });
    let called = false; const result = await f.adapter.run({ ...input, requestPermission() { called = true; return { optionId: 'allow-once' }; } });
    assert.equal(result.status, 'blocked'); assert.equal(called, false); assert.deepEqual(f.messages.find((m: any) => m.id === 77).result, { outcome: { outcome: 'cancelled' } });
  }
  for (const reply of [undefined, { optionId: 'always-allow' }, { optionId: 'reject-once' }] as const) {
    const f = fixture({ onPrompt(child: any) { permission(child); } });
    assert.equal((await f.adapter.run({ ...input, ...(reply ? { requestPermission: () => reply } : {}) })).status, 'blocked');
  }
});
test('wrong session permission and unknown client methods never invoke host handlers', async () => {
  for (const mode of ['session', 'unknown'] as const) {
    let called = false; const f = fixture({ onPrompt(child: any) { if (mode === 'session') permission(child, { sessionId: 'other' }); else child.frame({ id: 3, method: 'terminal/create', params: { sessionId: 'native-fixture' } }); } });
    assert.notEqual((await f.adapter.run({ ...input, requestPermission() { called = true; return { optionId: 'allow-once' }; } })).status, 'completed'); assert.equal(called, false);
  }
});
test('input maps normalized host IDs back to native question text and supports Other annotations', async () => {
  for (const answer of ['Blue', 'A shade of green'] as const) {
    let promptMessage: any; const f = fixture({ onPrompt(child: any, m: any) { promptMessage = m; question(child); }, onMessage(m: any, child: any) { if (m.id === 78 && m.result) { finish(child, promptMessage); return true; } } });
    const result = await f.adapter.run({ ...input, requestInput(request: any) {
      assert.equal(request.nativeSessionId, 'native-fixture'); assert.deepEqual(request.questions[0], { id: 'question-0', question: 'Which color?', multiSelect: false, options: [{ label: 'Blue', description: 'Cool color' }, { label: 'Red', description: 'Warm color' }] });
      return { answers: [{ id: 'question-0', selected: answer === 'Blue' ? ['Blue'] : [], ...(answer !== 'Blue' ? { custom: answer } : {}) }] };
    } });
    assert.equal(result.status, 'completed'); const response = f.messages.find((m: any) => m.id === 78).result;
    assert.equal(response.outcome, 'accepted'); assert.deepEqual(response.answers, { 'Which color?': [answer === 'Blue' ? 'Blue' : 'Other'] });
    if (answer !== 'Blue') assert.deepEqual(response.annotations, { 'Which color?': { notes: answer } });
  }
});
test('question tool results omit native answer and annotation echoes while ordinary tool results remain visible', async () => {
  const events: any = [], notes = 'private fixture meeting notes'; let promptMessage: any;
  const f = fixture({ onPrompt(child: any, message: any) { promptMessage = message; question(child); }, onMessage(message: any, child: any) {
    if (message.id !== 78 || !message.result) return;
    assert.equal(message.result.annotations['Which color?'].notes, notes);
    const echo = `User has answered your questions: "Which color?"="Blue" user notes: ${notes}.`;
    child.update({ sessionUpdate: 'tool_call_update', toolCallId: 'question-tool', status: 'completed', title: echo,
      content: [{ type: 'content', content: { type: 'text', text: echo } }], rawInput: { notes }, rawOutput: message.result, _meta: { notes } });
    child.update({ sessionUpdate: 'tool_call_update', toolCallId: 'ordinary-tool', status: 'completed', rawOutput: 'ordinary result' });
    finish(child, promptMessage); return true;
  } });
  const result = await f.adapter.run({ ...input, onEvent: (event: any) => events.push(event),
    requestInput: () => ({ answers: [{ id: 'question-0', selected: ['Blue'], custom: notes }] }) });
  assert.equal(result.status, 'completed');
  assert.ok(!JSON.stringify({ events, result }).includes(notes));
  assert.deepEqual(events.find((event: any) => event.type === 'tool' && event.data.toolCallId === 'question-tool').data,
    { sessionUpdate: 'tool_call_update', toolCallId: 'question-tool', title: 'Grok interactive question', status: 'completed', answerContentOmitted: true, nativeSessionId: 'native-fixture' });
  assert.equal(events.find((event: any) => event.data?.toolCallId === 'ordinary-tool').data.rawOutput, 'ordinary result');
});
test('question result echoes remain omitted when prompt completion revokes the queued input handler', async () => {
  const events: any = []; let calls = 0;
  const f = fixture({ onPrompt(child: any, message: any) {
    question(child);
    child.update({ sessionUpdate: 'tool_call_update', toolCallId: 'question-tool', status: 'completed',
      content: [{ type: 'content', content: { type: 'text', text: 'private queued answer' } }], rawOutput: { notes: 'private queued annotation' } });
    finish(child, message);
  } });
  const result = await f.adapter.run({ ...input, onEvent: (event: any) => events.push(event), requestInput() { calls++; } });
  assert.equal(result.status, 'completed'); assert.equal(calls, 0);
  assert.ok(!JSON.stringify(events).includes('private queued'));
  assert.equal(events.find((event: any) => event.type === 'tool').data.answerContentOmitted, true);
});
test('input unknown fields, credential questions, missing handler and cancellation block visibly', async () => {
  for (const questionText of ['Enter API key', 'Which color?'] as const) {
    const f = fixture({ onPrompt(child: any) { question(child, { questions: [{ question: questionText, options: [{ label: 'A', description: '' }, { label: 'B', description: '' }] }] }); } });
    const events: any = []; const result = await f.adapter.run({ ...input, onEvent: (e: any) => events.push(e) });
    assert.equal(result.status, 'blocked'); assert.equal(f.messages.find((m: any) => m.id === 78).result.outcome, 'cancelled'); assert.ok(events.some((e: any) => e.type === 'input'));
  }
});
test('streamed UTF-8 text, tool and plan frames are forwarded; thoughts and unrelated sessions are excluded', async () => {
  const f = fixture({ onPrompt(child: any, m: any) {
    const raw = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'native-fixture', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '你好' } } } }) + '\n');
    const n = raw.indexOf(Buffer.from('你')) + 1; child.stdout.write(raw.subarray(0, n)); child.stdout.write(raw.subarray(n));
    child.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'wrong session' } }, 'other');
    child.update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'private thinking' } });
    child.update({ sessionUpdate: 'tool_call', toolCallId: 't', title: 'Tool' }); child.update({ sessionUpdate: 'plan', entries: [{ content: 'Inspect', status: 'completed', priority: 'high' }] });
    child.reply(m, { stopReason: 'end_turn' });
  } });
  const events: any = []; const result = await f.adapter.run({ ...input, onEvent: (e: any) => events.push(e) });
  assert.equal(result.summary, '你好'); assert.ok(events.some((e: any) => e.type === 'plan')); assert.ok(events.some((e: any) => e.type === 'tool')); assert.ok(!JSON.stringify(events).includes('private thinking'));
});
test('cancellation resolves pending approval, sends native cancel and awaits managed quiescence', async () => {
  const controller = new AbortController(), started = deferred(), hostFinished = deferred();
  const f = fixture({ onPrompt(child: any) { permission(child); } });
  const running = f.adapter.run({ ...input, signal: controller.signal, requestPermission(request: any) {
    started.resolve(); request.signal.addEventListener('abort', hostFinished.resolve, { once: true }); return new Promise<any>(() => {});
  } });
  await started.promise; controller.abort(); const result = await running; await hostFinished.promise;
  assert.equal(result.status, 'cancelled'); assert.ok(f.messages.some((m: any) => m.method === 'session/cancel')); assert.ok(f.children.every((c: any) => c.terminated && c.waited));
});
test('terminal response invalidates unanswered host interactions without a late approval', async () => {
  let promptMessage: any; const held = deferred(), hostSignal = deferred();
  const f = fixture({ onPrompt(child: any, m: any) { promptMessage = m; permission(child); } });
  const running = f.adapter.run({ ...input, requestPermission(request: any) { hostSignal.resolve(request.signal); return held.promise; } });
  const signal = await hostSignal.promise; finish(f.children.at(-1), promptMessage); const result = await running;
  assert.equal(result.status, 'completed'); assert.equal(signal.aborted, true); held.resolve({ optionId: 'allow-once' }); await tick();
  assert.ok(!f.messages.some((m: any) => m.id === 77 && m.result?.outcome?.optionId === 'allow-once'));
});
test('unconfirmed cleanup remains a thrown lock-retaining error for discovery and run', async () => {
  for (const run of [false, true] as const) {
    const f = fixture({ waitForExit: () => false });
    await assert.rejects(run ? f.adapter.run(input) : f.adapter.discover({ cwd }), { code: 'AGENTS_CLEANUP_UNCONFIRMED' });
  }
});
test('malformed frames and request timeout fail closed and still clean owned processes', async () => {
  for (const corrupt of [true, false] as const) {
    const f = fixture({ onMessage(m: any, child: any) { if (m.method !== 'initialize') return; if (corrupt) child.stdout.write('{not-json}\n'); return true; } });
    assert.equal((await f.adapter.run(input)).status, 'failed'); assert.ok(f.children.every((c: any) => c.terminated && c.waited));
  }
});
test('prompt latency has no short RPC deadline and remains cancellable', async () => {
  const f = fixture({ onPrompt(child: any, message: any) { setTimeout(() => finish(child, message), 120); } });
  assert.equal((await f.adapter.run(input)).status, 'completed');
});
test('native authentication errors block without new session retries or login', async () => {
  const f = fixture({ onPrompt(child: any, m: any) { child.frame({ id: m.id, error: { code: -32000, message: 'AUTH_TOKEN=must-not-echo' } }); } });
  const result = await f.adapter.run(input); assert.equal(result.status, 'blocked'); assert.ok(!JSON.stringify(result).includes('must-not-echo'));
  assert.equal(f.messages.filter((m: any) => m.method === 'session/new').length, 1); assert.ok(!f.messages.some((m: any) => m.method === 'authenticate'));
});
test('completed prompt atomically invalidates a coalesced pending permission before it reaches the host', async () => {
  let called = false; const f = fixture({ onPrompt(child: any, m: any) { permission(child); finish(child, m); } });
  const result = await f.adapter.run({ ...input, requestPermission() { called = true; return { optionId: 'allow-once' }; } });
  assert.equal(result.status, 'completed'); assert.equal(called, false); assert.ok(!f.messages.some((m: any) => m.id === 77));
});
test('partial permission ToolCallUpdate uses the same-session prior tool input, otherwise blocks', async () => {
  for (const includeTool of [true, false] as const) {
    let promptMessage: any; const f = fixture({ onPrompt(child: any, m: any) {
      promptMessage = m;
      if (includeTool) child.update({ sessionUpdate: 'tool_call', toolCallId: 'tool-fixture', title: 'git status', rawInput: { command: 'git status' } });
      permission(child, { toolCall: { toolCallId: 'tool-fixture' } });
    }, onMessage(m: any, child: any) { if (m.id === 77 && m.result) { finish(child, promptMessage); return true; } } });
    let called = false; const result = await f.adapter.run({ ...input, requestPermission(request: any) { called = true; assert.match(request.details, /git status/); return { optionId: 'allow-once' }; } });
    assert.equal(result.status, includeTool ? 'completed' : 'blocked'); assert.equal(called, includeTool);
  }
});
test('native interaction resolution cancels only that host request and suppresses a late answer while turn continues', async () => {
  for (const type of ['permission', 'input'] as const) {
    const held = deferred(), entered = deferred(); let promptMessage: any;
    const f = fixture({ onPrompt(child: any, m: any) { promptMessage = m; if (type === 'permission') permission(child); else question(child); } });
    const callback = (request: any) => { entered.resolve(request.signal); return held.promise; };
    const running = f.adapter.run({ ...input, [type === 'permission' ? 'requestPermission' : 'requestInput']: callback });
    const signal = await entered.promise; const child = f.children.at(-1);
    child.notify('_x.ai/session_notification', { sessionId: 'other', update: { sessionUpdate: 'interaction_resolved', tool_call_id: type === 'permission' ? 'tool-fixture' : 'question-tool' } });
    await tick(); assert.equal(signal.aborted, false);
    child.notify('_x.ai/session_notification', { sessionId: 'native-fixture', update: { sessionUpdate: 'interaction_resolved', tool_call_id: type === 'permission' ? 'tool-fixture' : 'question-tool' } });
    await tick(); assert.equal(signal.aborted, true);
    held.resolve(type === 'permission' ? { optionId: 'allow-once' } : { answers: [{ id: 'question-0', selected: ['Blue'] }] });
    await tick(); assert.ok(!f.messages.some((m: any) => m.id === (type === 'permission' ? 77 : 78)));
    finish(child, promptMessage); assert.equal((await running).status, 'completed');
  }
});
test('unconfirmed runtime cleanup after successful version probe also retains the host lock', async () => {
  let checks = 0; const f = fixture({ waitForExit: () => ++checks === 1 });
  await assert.rejects(f.adapter.run(input), { code: 'AGENTS_CLEANUP_UNCONFIRMED' });
  assert.equal(f.spawns.length, 2);
});
test('cleanup deadline and stalled protocol writes cannot report success', async () => {
  const f = fixture({ waitForExit: () => new Promise<any>(() => {}), config: { cleanupTimeoutMs: 15 } });
  await assert.rejects(f.adapter.discover({ cwd }), { code: 'AGENTS_CLEANUP_UNCONFIRMED' });
  const stalled = fixture({ stallWrites: true, config: { requestTimeoutMs: 15 } });
  assert.equal((await stalled.adapter.run(input)).status, 'failed'); assert.ok(stalled.children.every((c: any) => c.terminated && c.waited));
});
test('malformed input answers and unknown permission metadata remain visible and fail closed', async () => {
  for (const answers of [{ 'question-0': ['Blue'] }, [{ id: 'wrong', selected: ['Blue'] }], [{ id: 'question-0', selected: [] }], [{ id: 'question-0', selected: ['Unknown'] }]] as const) {
    const f = fixture({ onPrompt(child: any) { question(child); } });
    assert.equal((await f.adapter.run({ ...input, requestInput: () => ({ answers }) })).status, 'blocked');
  }
  let nativePrompt: any; const f = fixture({ onPrompt(child: any, m: any) { nativePrompt = m; permission(child, { _meta: { protected_edit: { reason: 'Changes permission settings' } } }); }, onMessage(m: any, child: any) { if (m.id === 77 && m.result) { finish(child, nativePrompt); return true; } } });
  assert.equal((await f.adapter.run({ ...input, requestPermission(request: any) { assert.match(request.details, /Changes permission settings/); return { optionId: 'reject-once' }; } })).status, 'blocked');
});
test('interaction resolution bypasses slow tool display and invalidates requests before queued handlers start', async () => {
  for (const pendingHost of [true, false] as const) {
    const displayed = deferred(), unblock = deferred(), entered = deferred(), held = deferred(); let promptMessage: any;
    let calls = 0;
    const f = fixture({ onPrompt(child: any, m: any) { promptMessage = m; if (pendingHost) permission(child); } });
    const running = f.adapter.run({ ...input, onEvent(event: any) { if (event.type === 'tool') { displayed.resolve(); return unblock.promise; } },
      requestPermission(request: any) { calls++; entered.resolve(request.signal); return held.promise; } });
    let hostSignal: any;
    if (pendingHost) hostSignal = await entered.promise;
    else { while (!promptMessage) await tick(); }
    const child = f.children.at(-1);
    child.update({ sessionUpdate: 'tool_call_update', toolCallId: 'display', status: 'in_progress' });
    await displayed.promise;
    if (!pendingHost) permission(child);
    child.notify('_x.ai/session_notification', { sessionId: 'native-fixture', update: { sessionUpdate: 'interaction_resolved', tool_call_id: 'tool-fixture' } });
    if (pendingHost) assert.equal(hostSignal.aborted, true);
    held.resolve({ optionId: 'allow-once' }); await tick();
    assert.ok(!f.messages.some((m: any) => m.id === 77));
    unblock.resolve(); await tick();
    assert.equal(calls, pendingHost ? 1 : 0);
    finish(child, promptMessage); assert.equal((await running).status, 'completed');
  }
});
