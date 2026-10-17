import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createClaudeAdapter } from '../src/adapters/claude.js';
import { deferred } from '../src/adapters/claude-process.js';
import { createClaudeFixture } from './fixtures/claude-protocol.mjs';

const cwd = '/workspace/project', sandboxPolicy = { mode: 'workspace-write', workspaceRoot: cwd };
const input = { prompt: 'Inspect the synthetic fixture.', cwd, sandboxPolicy };
const tick = () => new Promise(resolve => setImmediate(resolve));
const executable = fileURLToPath(new URL('./fixtures/claude-cli.mjs', import.meta.url));
function fixture({ onUser, onResponse, account, models, version, waitForExit, spawnDelay, config = {}, onSpawn } = {}) {
  const spawns = [], messages = [], children = [], errors = [];
  const spawn = async spec => {
    spawns.push(spec); await spawnDelay?.();
    const done = deferred(), stdout = new PassThrough(), stderr = new PassThrough();
    const child = { stdout, stderr, done: done.promise, terminated: 0, waited: 0,
      terminate() { this.terminated++; stdout.end(); stderr.end(); done.resolve({ exitCode: null, signal: 'SIGTERM' }); },
      async waitForExit(signal) { this.waited++; return waitForExit ? waitForExit(signal, child) : this.terminated > 0; },
      exit(code = 0) { stdout.end(); stderr.end(); done.resolve({ exitCode: code, signal: null }); },
      raw(value) { stdout.write(value); },
      frame(value) { stdout.write(`${JSON.stringify(value)}\n`); },
    };
    const protocol = createClaudeFixture({ argv: spec.argv, send: child.frame, onUser, onResponse, account, models, version });
    child.protocol = protocol;
    let buffer = '';
    child.stdin = new Writable({ write(chunk, encoding, callback) {
      buffer += String(chunk); let line;
      while ((line = buffer.indexOf('\n')) >= 0) {
        const text = buffer.slice(0, line); buffer = buffer.slice(line + 1);
        if (!text) continue;
        const message = JSON.parse(text); messages.push(message);
        Promise.resolve().then(() => protocol.receive(message)).catch(error => errors.push(error));
      }
      callback();
    } });
    children.push(child); onSpawn?.(spec, child);
    if (spec.argv.at(-1) === '--version') setImmediate(() => { stdout.write(`${version ?? '2.1.302'} (Claude Code)\n`); child.exit(); });
    return child;
  };
  return { adapter: createClaudeAdapter({ spawn, config: { executable, configDir: '/tmp/claude-fixture-config', requestTimeoutMs: 200, cleanupTimeoutMs: 200, ...config } }), spawn, spawns, messages, children, errors };
}

test('discovery runs only --version, never initializes the SDK or claims authentication', async () => {
  const f = fixture();
  const found = await f.adapter.discover({ cwd, sandboxPolicy });
  assert.equal(found.available, true); assert.equal(found.version, '2.1.302'); assert.equal(found.authenticated, null);
  assert.deepEqual(found.models, []); assert.equal(found.authentication.state, 'requires-native-initialization'); assert.equal(found.authentication.source, 'version-only');
  assert.deepEqual(f.spawns.map(item => item.argv), [[executable, '--version']]); assert.equal(f.messages.length, 0);
  assert.ok(f.children.every(child => child.terminated === 1 && child.waited === 1));
});

test('approved model discovery initializes the real SDK without a prompt or persisted session reservation', async () => {
  const f = fixture();
  const found = await f.adapter.discoverModels({ cwd, sandboxPolicy });
  assert.equal(found.available, true); assert.equal(found.version, '2.1.302'); assert.equal(found.authenticated, null);
  assert.equal(found.authentication.state, 'configured-unverified');
  assert.deepEqual(found.models, [{ id: 'fixture-model', label: 'Synthetic fixture model' }]);
  assert.deepEqual(found.modelCatalog, { source: 'native-initialization', accessVerified: false });
  assert.equal(found.nativeSessionId, undefined);
  assert.equal(f.messages.filter(message => message.type === 'user').length, 0);
  assert.deepEqual(f.messages.filter(message => message.type === 'control_request').map(message => message.request.subtype), ['initialize']);
  assert.equal(f.spawns.length, 1); assert.ok(f.spawns[0].argv.includes('--no-session-persistence'));
  assert.ok(f.spawns[0].argv.includes('--tools=')); assert.ok(f.spawns[0].argv.includes('--setting-sources='));
  assert.ok(!f.spawns[0].argv.some(arg => /^--(?:resume|session-id|continue|model)(?:=|$)/.test(arg)));
  assert.ok(f.children.every(child => child.terminated === 1 && child.waited === 1));
});

test('native model catalog is returned without representing missing or unsupported auth as validated', async () => {
  for (const [account, state] of [[{}, 'unconfigured'], [{ apiProvider: 'firstParty', tokenSource: 'oauth', subscriptionType: 'max' }, 'unsupported']]) {
    const f = fixture({ account });
    const found = await f.adapter.discoverModels({ cwd, sandboxPolicy });
    assert.equal(found.available, true); assert.equal(found.authentication.state, state); assert.equal(found.authenticated, null);
    assert.equal(found.models[0].id, 'fixture-model'); assert.equal(f.messages.some(message => message.type === 'user'), false);
  }
});

test('model discovery validates bounded exact native model rows without inventing or truncating a catalog', async () => {
  const valid = { value: 'native-alias', resolvedModel: 'native-wire-id', displayName: 'Native fixture model', description: 'Synthetic' };
  for (const models of [[valid], []]) {
    const f = fixture({ models }), found = await f.adapter.discoverModels({ cwd, sandboxPolicy });
    assert.equal(found.available, true); assert.deepEqual(found.models, models.map(item => ({ id: item.value, label: item.displayName })));
  }
  for (const models of ['invalid', [null], [{ ...valid, value: ' padded ' }], [{ ...valid, value: 'x'.repeat(161) }],
    [{ ...valid, displayName: '' }], [valid, valid], Array.from({ length: 101 }, (_, i) => ({ ...valid, value: `model-${i}` }))]) {
    const f = fixture({ models }), found = await f.adapter.discoverModels({ cwd, sandboxPolicy });
    assert.equal(found.available, false); assert.deepEqual(found.models, []); assert.equal(f.messages.some(message => message.type === 'user'), false);
  }
});

test('model discovery rejects version mismatch and unexpected requests without exposing an approval surface', async () => {
  const mismatch = fixture({ version: '2.1.301' });
  assert.equal((await mismatch.adapter.discoverModels({ cwd, sandboxPolicy })).available, false);
  let response;
  const f = fixture({ onSpawn(spec, child) {
    const receive = child.protocol.receive;
    child.protocol.receive = async message => {
      if (message.type === 'control_request' && message.request.subtype === 'initialize') { child.protocol.permission(); await tick(); }
      await receive(message);
    };
  }, onResponse(helper, message) { response = message.response.response; } });
  assert.equal((await f.adapter.discoverModels({ cwd, sandboxPolicy })).available, false);
  assert.equal(response.behavior, 'deny'); assert.equal(f.messages.some(message => message.type === 'user'), false);
});

test('model discovery cancellation and timeout send no prompt and await managed cleanup', async () => {
  for (const cancel of [true, false]) {
    const initialized = deferred(), controller = new AbortController();
    const f = fixture({ config: { requestTimeoutMs: 30 }, onSpawn(spec, child) {
      child.protocol.receive = async message => { if (message.request?.subtype === 'initialize') initialized.resolve(); };
    } });
    const task = f.adapter.discoverModels({ cwd, sandboxPolicy, signal: controller.signal });
    await initialized.promise; if (cancel) controller.abort();
    const found = await task;
    assert.equal(found.available, false); assert.deepEqual(found.models, []);
    if (cancel) assert.match(found.reason, /cancelled/);
    assert.ok(f.children.every(child => child.terminated === 1 && child.waited === 1));
    assert.equal(f.messages.some(message => message.type === 'user'), false);
  }
  const controller = new AbortController(); controller.abort(); const f = fixture();
  assert.equal((await f.adapter.discoverModels({ cwd, sandboxPolicy, signal: controller.signal })).available, false);
  assert.equal(f.spawns.length, 0);
});

test('model discovery redacts configured secrets from native labels', async () => {
  const secret = 'synthetic-model-label-credential';
  const f = fixture({ config: { env: { ANTHROPIC_API_KEY: secret } }, models: [{ value: 'fixture-model', displayName: `Native ${secret}` }] });
  const found = await f.adapter.discoverModels({ cwd, sandboxPolicy });
  assert.equal(found.available, true); assert.equal(found.models[0].label, 'Native [redacted]');
  assert.ok(!JSON.stringify(found).includes(secret));
});

test('official SDK initializes through managed spawn, sends one prompt and checkpoints session/models', async () => {
  const f = fixture(), events = [];
  const result = await f.adapter.run({ ...input, onEvent: event => events.push(event) });
  assert.equal(result.status, 'completed'); assert.equal(result.summary, 'Synthetic Claude fixture answer.');
  assert.equal(f.spawns.length, 1); assert.equal(f.spawns[0].argv[0], 'node'); assert.equal(f.spawns[0].argv[1], executable);
  assert.ok(f.spawns[0].argv.includes('--strict-mcp-config'));
  assert.ok(f.spawns[0].argv.includes('--setting-sources='));
  assert.equal(f.messages.filter(m => m.type === 'user').length, 1); assert.equal(f.messages.find(m => m.type === 'user').client_composed, true);
  assert.equal(events.filter(event => event.type === 'session').length, 2);
  assert.equal(events[0].data.nativeConfirmed, false); assert.equal(events[1].data.nativeConfirmed, true);
  assert.deepEqual(events[0].data.models, [{ id: 'fixture-model', label: 'Synthetic fixture model' }]);
  assert.equal(events[0].data.nativeSessionId, result.nativeSessionId);
  assert.ok(f.children.every(child => child.terminated === 1 && child.waited === 1)); assert.deepEqual(f.errors, []);
});

test('resume uses the exact session identity and never starts an automatic retry', async () => {
  const f = fixture(), nativeSessionId = '11111111-2222-4333-8444-555555555555';
  const result = await f.adapter.run({ ...input, nativeSessionId });
  assert.equal(result.status, 'completed'); assert.equal(result.nativeSessionId, nativeSessionId);
  assert.ok(f.spawns[0].argv.includes(`--resume=${nativeSessionId}`));
  assert.ok(!f.spawns[0].argv.includes('--continue')); assert.equal(f.spawns.length, 1);
});

test('official SDK permission callback returns only one-time allow and never persists suggestions', async () => {
  let request, response;
  const f = fixture({ onUser: f => f.permission(), onResponse(f, message) { response = message.response.response; f.finish(); } });
  const result = await f.adapter.run({ ...input, requestPermission: value => { request = value; return { optionId: 'allow' }; } });
  assert.equal(result.status, 'completed'); assert.equal(request.nativeSessionId, result.nativeSessionId);
  assert.deepEqual(request.options.map(option => option.kind), ['allow_once', 'reject_once']);
  assert.deepEqual(response, { behavior: 'allow', updatedInput: { command: 'printf fixture' }, toolUseID: 'tool-1' });
});

test('declined, broad and absent permission decisions fail closed', async () => {
  for (const optionId of ['deny', 'allow_always', null, undefined]) {
    let response;
    const f = fixture({ onUser: f => f.permission(), onResponse(f, message) { response = message.response.response; f.finish(); } });
    const result = await f.adapter.run({ ...input, ...(optionId !== undefined ? { requestPermission: () => ({ optionId }) } : {}) });
    assert.equal(result.status, 'blocked'); assert.equal(response.behavior, 'deny'); assert.equal(response.interrupt, true);
  }
});

test('AskUserQuestion normalizes the host answers into official question-text keyed answers', async () => {
  const questions = [{ question: 'Which output?', header: 'Output', options: [{ label: 'Short', description: 'One line' }, { label: 'Long', description: 'Two lines' }], multiSelect: false }];
  let response, request;
  const f = fixture({ onUser: f => f.permission('AskUserQuestion', { questions }), onResponse(f, message) { response = message.response.response; f.finish(); } });
  const result = await f.adapter.run({ ...input, requestInput: value => { request = value; return { answers: [{ id: 'q1', selected: ['Short'] }] }; } });
  assert.equal(result.status, 'completed'); assert.equal(request.nativeSessionId, result.nativeSessionId);
  assert.equal(request.questions[0].id, 'q1'); assert.deepEqual(response.updatedInput.answers, { 'Which output?': 'Short' });
});

test('auth is checked after initialization but before any model prompt; OAuth-only is outside adapter scope', async () => {
  for (const account of [{}, { apiProvider: 'firstParty', tokenSource: 'oauth', subscriptionType: 'max' }]) {
    const f = fixture({ account });
    const result = await f.adapter.run(input);
    assert.equal(result.status, 'blocked'); assert.equal(f.messages.filter(m => m.type === 'user').length, 0);
    assert.equal(f.messages.filter(m => m.type === 'control_request').length, 1);
  }
});

test('version or model mismatch blocks the prompt without silent fallback', async () => {
  for (const [fixtureOptions, runOptions] of [[{ version: '2.1.301' }, {}], [{}, { model: 'not-advertised' }]]) {
    const f = fixture(fixtureOptions), result = await f.adapter.run({ ...input, ...runOptions });
    assert.equal(result.status, 'blocked'); assert.equal(f.messages.filter(m => m.type === 'user').length, 0); assert.equal(f.spawns.length, 1);
  }
});

test('cancel pending permission invalidates its answer and awaits the full managed range', async () => {
  const controller = new AbortController(), asked = deferred(), answer = deferred();
  const f = fixture({ onUser: f => f.permission() });
  const task = f.adapter.run({ ...input, signal: controller.signal, requestPermission: () => { asked.resolve(); return answer.promise; } });
  await asked.promise; controller.abort(); answer.resolve({ optionId: 'allow' });
  const result = await task;
  assert.equal(result.status, 'cancelled'); assert.ok(!f.messages.some(m => m.type === 'control_response' && m.response.response?.behavior === 'allow'));
  assert.ok(f.children.every(child => child.terminated === 1 && child.waited === 1));
});

test('unknown managed range cleanup throws the quarantine code, including on discovery', async () => {
  for (const method of ['run', 'discover', 'discoverModels']) {
    const f = fixture({ waitForExit: async () => false });
    await assert.rejects(f.adapter[method](input), { code: 'AGENTS_CLEANUP_UNCONFIRMED' });
  }
});

test('a rejected host spawn preserves explicit cleanup uncertainty for discovery and run', async () => {
  for (const method of ['run', 'discover', 'discoverModels']) {
    for (const code of ['AGENTS_CLEANUP_UNCONFIRMED', 'ENOENT']) {
      const adapter = createClaudeAdapter({
        spawn: async () => { throw Object.assign(new Error('Synthetic host spawn rejection'), { code }); },
        config: { executable, configDir: '/tmp/claude-fixture-config', requestTimeoutMs: 200, cleanupTimeoutMs: 200 },
      });
      if (code === 'AGENTS_CLEANUP_UNCONFIRMED') {
        await assert.rejects(adapter[method](input), { code });
      } else {
        const result = await adapter[method](input);
        assert.equal(method === 'run' ? result.status : result.available, method === 'run' ? 'failed' : false);
      }
    }
  }
});

test('ambient credentials are tombstoned and never hashed into backend identity', async () => {
  const key = 'DSH_CLAUDE_TEST_SECRET'; process.env[key] = 'synthetic-secret';
  try {
    const f = fixture({ config: { env: { ANTHROPIC_API_KEY: 'synthetic-api-key' } } });
    const g = fixture({ config: { env: { ANTHROPIC_API_KEY: 'other-synthetic-api-key' } } });
    assert.equal(f.adapter.backendIdentity, g.adapter.backendIdentity);
    await f.adapter.run(input); assert.equal(f.spawns[0].env[key], undefined); assert.equal(f.spawns[0].env.ANTHROPIC_API_KEY, 'synthetic-api-key');
    assert.ok(!f.adapter.backendIdentity.includes('synthetic-api-key'));
  } finally { delete process.env[key]; }
});

test('checkpoint reservation is awaited before prompt dispatch and failed persistence sends no prompt', async () => {
  for (const shouldFail of [false, true]) {
    const checkpoint = deferred(), release = deferred(), f = fixture();
    const task = f.adapter.run({ ...input, onEvent: async event => {
      if (event.type === 'session' && event.data.nativeConfirmed === false) {
        checkpoint.resolve(event); await release.promise; if (shouldFail) throw new Error('Synthetic store unavailable');
      }
    } });
    const event = await checkpoint.promise;
    assert.equal(event.data.provenance, 'host-reserved'); assert.match(event.data.nativeSessionId, /^[\da-f-]{36}$/);
    assert.equal(f.messages.filter(m => m.type === 'user').length, 0);
    release.resolve(); const result = await task;
    assert.equal(result.status, shouldFail ? 'failed' : 'completed');
    assert.equal(f.messages.filter(m => m.type === 'user').length, shouldFail ? 0 : 1);
  }
});

test('streamed multipart text uses stable assistant/part IDs; raw thinking never escapes', async () => {
  const f = fixture({ onUser(f) {
    f.frame({ type: 'stream_event', event: { type: 'message_start', message: { id: 'native-answer' } } });
    f.frame({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } } });
    f.frame({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world' } } });
    f.frame({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'PRIVATE-REASONING-FIXTURE' } } });
    f.frame({ type: 'assistant', message: { id: 'native-answer', role: 'assistant', content: [
      { type: 'text', text: 'Hello world' }, { type: 'thinking', thinking: 'PRIVATE-REASONING-FIXTURE', signature: 'private-signature' }, { type: 'text', text: 'Second paragraph' },
    ] } });
    f.frame({ type: 'result', subtype: 'success', is_error: false, result: 'Hello world\nSecond paragraph', num_turns: 1 });
  } }), events = [];
  const result = await f.adapter.run({ ...input, onEvent: event => events.push(event) });
  assert.equal(result.status, 'completed');
  const messages = events.filter(e => e.type === 'assistant');
  assert.deepEqual(messages.map(e => [e.data.messageId, e.data.partId, e.data.delta]), [
    ['native-answer', '0', true], ['native-answer', '0', true], ['native-answer', '0', false], ['native-answer', '2', false],
  ]);
  assert.ok(!JSON.stringify(events).includes('PRIVATE-REASONING')); assert.ok(!JSON.stringify(events).includes('private-signature'));
});

test('configured credential values and stderr are never published; sensitive approval scopes are denied', async () => {
  const secret = 'synthetic-opaque-credential-value';
  const f = fixture({ config: { env: { ANTHROPIC_API_KEY: secret } }, onUser(f) { f.permission('Bash', { command: `echo ${secret}` }); },
    onResponse(f) { f.finish(`Result ${secret}`); }, onSpawn(spec, child) { child.stderr.write(`stderr ${secret}`); } });
  let asked = false; const events = [];
  const result = await f.adapter.run({ ...input, requestPermission: () => { asked = true; return { optionId: 'allow' }; }, onEvent: event => events.push(event) });
  assert.equal(asked, false); assert.equal(result.status, 'blocked');
  assert.ok(!JSON.stringify([result, events, f.adapter.backendIdentity]).includes(secret)); assert.ok(result.summary.includes('[redacted]'));
});

test('secret, duplicated, unsupported-preview and incomplete questions cannot be answered', async () => {
  const basic = { question: 'Choose output', header: 'Output', options: [{ label: 'One', description: 'One line' }, { label: 'Two', description: 'Two lines' }], multiSelect: false };
  for (const questions of [[{ ...basic, question: 'Enter your password' }], [basic, basic], [{ ...basic, options: [{ label: 'One', preview: '<div>unsafe</div>' }, { label: 'Two' }] }]]) {
    let asked = false, response;
    const f = fixture({ onUser: f => f.permission('AskUserQuestion', { questions }), onResponse(f, message) { response = message.response.response; f.finish(); } });
    const result = await f.adapter.run({ ...input, requestInput: () => { asked = true; return { answers: [] }; } });
    assert.equal(result.status, 'blocked'); assert.equal(asked, false); assert.equal(response.behavior, 'deny');
  }
  for (const answers of [[], [{ id: 'q1', selected: ['not-offered'] }], [{ id: 'q1', selected: [] }], [{ id: 'q1', selected: ['One', 'Two'] }]]) {
    const f = fixture({ onUser: f => f.permission('AskUserQuestion', { questions: [basic] }), onResponse: f => f.finish() });
    assert.equal((await f.adapter.run({ ...input, requestInput: () => ({ answers }) })).status, 'blocked');
  }
});

test('permanent-mode transitions are blocked and callbacks cannot upgrade to session-wide grants', async () => {
  for (const toolName of ['EnterPlanMode', 'ExitPlanMode']) {
    let asked = false, response;
    const f = fixture({ onUser: f => f.permission(toolName, { allowedPrompts: [{ tool: 'Bash', prompt: 'write all files' }] }), onResponse(f, message) { response = message.response.response; f.finish(); } });
    const result = await f.adapter.run({ ...input, requestPermission: () => { asked = true; return { optionId: 'allow' }; } });
    assert.equal(result.status, 'blocked'); assert.equal(asked, false); assert.equal(response.behavior, 'deny');
  }
});

test('malformed, oversized and unknown control frames terminate the managed runtime', async () => {
  for (const raw of ['not-json\n', `${JSON.stringify({ type: 'control_request', request_id: 'unknown', request: { subtype: 'unrecognized-action' } })}\n`, `${'x'.repeat(8193)}\n`]) {
    const f = fixture({ config: { maxFrameBytes: 8192 }, onUser() {}, onSpawn(spec, child) {
      const original = child.protocol.receive;
      child.protocol.receive = async message => { await original(message); if (message.type === 'user') child.raw(raw); };
    } });
    const result = await f.adapter.run(input);
    assert.equal(result.status, 'failed'); assert.equal(f.children[0].waited, 1); assert.equal(f.spawns.length, 1);
  }
});

test('other-session output, native permission-mode drift and missing terminal result fail closed', async () => {
  for (const kind of ['wrong-session', 'mode-drift', 'early-exit']) {
    const f = fixture({ onUser(f) {
      if (kind === 'wrong-session') f.frame({ type: 'result', subtype: 'success', is_error: false, result: 'Wrong', session_id: '99999999-2222-4333-8444-555555555555' });
      if (kind === 'mode-drift') f.frame({ type: 'system', subtype: 'init', permissionMode: 'bypassPermissions' });
    }, onSpawn(spec, child) { if (kind === 'early-exit') { const receive = child.protocol.receive; child.protocol.receive = async message => { await receive(message); if (message.type === 'user') child.exit(); }; } } });
    const result = await f.adapter.run(input); assert.equal(result.status, 'failed'); assert.equal(f.spawns.length, 1);
  }
});

test('permission replay or another request reusing a tool identity is not approved twice', async () => {
  let count = 0, responses = 0;
  const f = fixture({ onUser: f => f.permission(), onResponse(f, message) {
    responses++; if (responses === 1) f.permission('Bash', { command: 'printf changed' }, 'permission-2', 'tool-1'); else f.finish();
  } });
  const result = await f.adapter.run({ ...input, requestPermission: () => { count++; return { optionId: 'allow' }; } });
  assert.equal(result.status, 'blocked'); assert.equal(count, 1); assert.equal(responses, 2);
});

test('aborted native permission request invalidates the late host answer', async () => {
  const asked = deferred(), answer = deferred(), cancelled = deferred();
  const f = fixture({ onUser: f => f.permission() });
  const task = f.adapter.run({ ...input, requestPermission: request => {
    request.signal.addEventListener('abort', () => cancelled.resolve(), { once: true }); asked.resolve(); return answer.promise;
  } });
  await asked.promise;
  f.children[0].frame({ type: 'control_cancel_request', request_id: 'permission-1' });
  await cancelled.promise; answer.resolve({ optionId: 'allow' }); await tick(); f.children[0].protocol.finish();
  const result = await task;
  assert.equal(result.status, 'blocked'); assert.ok(!f.messages.some(m => m.type === 'control_response' && m.response.response?.behavior === 'allow'));
});

test('question answers echoed in native tool results are not persisted as tool output', async () => {
  const privateAnswer = 'Private preference fixture marker';
  const f = fixture({ onUser(f) {
    f.frame({ type: 'assistant', message: { id: 'question-message', content: [{ type: 'tool_use', id: 'question-tool', name: 'AskUserQuestion', input: { answers: { 'Not displayed': privateAnswer } } }] } });
    f.frame({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'question-tool', content: privateAnswer }] } });
    f.frame({ type: 'tool_use_summary', summary: privateAnswer, preceding_tool_use_ids: ['question-tool'] });
    f.finish();
  } }), events = [];
  const result = await f.adapter.run({ ...input, onEvent: event => events.push(event) });
  assert.equal(result.status, 'completed'); assert.ok(!JSON.stringify(events).includes(privateAnswer));
  assert.ok(events.some(event => event.type === 'input' && event.data.phase === 'answered'));
});
