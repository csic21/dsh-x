import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { createCodexAdapter } from '../src/adapters/codex.ts';
import { deferred } from '../src/adapters/codex-rpc.ts';

const cwd = '/workspace/project';
const sandboxPolicy: any = { mode: 'workspace-write', workspaceRoot: cwd };
const input: any = { prompt: 'Inspect the fixture.', cwd, sandboxPolicy };
const tick = () => new Promise<any>(resolve => setImmediate(resolve));

function fixture({ onMessage, onTurn, account = { account: { type: 'chatgpt' }, requiresOpenaiAuth: true }, version = 'codex-cli 0.153.4', waitForExit, stallWrites = false, stallReply = false }: any = {}) {
  const spawns: any = [], messages: any = [], children: any = [], errors: any = [];
  function spawn(spec: any) {
    spawns.push(spec);
    const exited = deferred();
    const stdout = new PassThrough(), stderr = new PassThrough();
    const child: any = {
      stdout, stderr, done: exited.promise, terminated: 0, waited: 0,
      terminate() { this.terminated++; exited.resolve({ exitCode: null, signal: 'SIGTERM' }); },
      async waitForExit(signal: any) { this.waited++; return waitForExit ? waitForExit(signal, child) : this.terminated > 0; },
      frame(value: any) { stdout.write(`${JSON.stringify(value)}\n`); },
      notification(method: any, params: any) { child.frame({ method, params }); },
      reply(request: any, result: any) { child.frame({ id: request.id, result }); },
      exit(code = 0) { stdout.end(); exited.resolve({ exitCode: code, signal: null }); },
    };
    ;(child as any).stdin = new Writable({ write(chunk, encoding, callback) {
      if (stallWrites) return;
      const message = JSON.parse(String(chunk));
      if (stallReply && Object.hasOwn(message, 'result')) return;
      callback();
      messages.push(message);
      void Promise.resolve().then(async () => {
        if (await onMessage?.(message, child)) return;
        if (!message.method || !Object.hasOwn(message, 'id')) return;
        switch (message.method) {
          case 'initialize': child.reply(message, { userAgent: 'codex/0.153.4' }); break;
          case 'account/read': child.reply(message, account); break;
          case 'model/list': child.reply(message, { data: [{ id: 'picker-model', model: 'native-model', displayName: 'Native model' }], nextCursor: null }); break;
          case 'thread/start': child.reply(message, { thread: { id: 'thread-fixture', ephemeral: false } }); break;
          case 'thread/resume': child.reply(message, { thread: { id: message.params.threadId, ephemeral: false } }); break;
          case 'turn/start':
            child.reply(message, { turn: { id: 'turn-fixture', status: 'inProgress' } });
            if (onTurn) await onTurn(child, message);
            else finish(child, message.params.threadId);
            break;
          case 'turn/interrupt': child.reply(message, {}); break;
        }
      }).catch(error => errors.push(error));
    } });
    children.push(child);
    if (spec.argv.at(-1) === '--version') queueMicrotask(() => { stdout.write(`${version}\n`); exited.resolve({ exitCode: 0, signal: null }); });
    return child;
  }
  const adapter = createCodexAdapter({ spawn, config: { requestTimeoutMs: 80, cleanupTimeoutMs: 80 } });
  return { spawn, adapter, spawns, messages, children, errors };
}

function finish(child: any, threadId = 'thread-fixture', status = 'completed', text = 'Fixture answer.') {
  child.notification('item/completed', { threadId, turnId: 'turn-fixture', item: { type: 'agentMessage', id: 'answer', phase: 'final_answer', text } });
  child.notification('turn/completed', { threadId, turn: { id: 'turn-fixture', status } });
}

function approval(child: any, extra: any = {}, requestId = 77) {
  child.frame({ id: requestId, method: 'item/commandExecution/requestApproval', params: {
    threadId: 'thread-fixture', turnId: 'turn-fixture', itemId: 'command-1', command: 'git status', cwd,
    availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'], ...extra,
  } });
}

test('discovery verifies version, handshake, account and model catalog without a turn or login', async () => {
  const f = fixture();
  const found = await f.adapter.discover({ cwd });
  assert.equal(found.available, true);
  assert.equal(found.version, '0.153.4');
  assert.equal(found.authenticated, true);
  assert.deepEqual(found.models, [{ id: 'native-model', label: 'Native model' }]);
  assert.deepEqual(f.spawns.map((value: any) => value.argv), [['codex', '--version'], ['codex', 'app-server']]);
  assert.deepEqual(f.messages.map((value: any) => value.method), ['initialize', 'initialized', 'account/read', 'model/list']);
  assert.deepEqual(f.messages.find((value: any) => value.method === 'account/read').params, { refreshToken: false });
  assert.ok(f.children.every((child: any) => child.terminated === 1 && child.waited === 1));
});

test('discovery distinguishes missing auth, provider-specific unknown auth and unsupported account API', async () => {
  for (const [account, expected] of [[{ account: null, requiresOpenaiAuth: true }, false], [{ account: null, requiresOpenaiAuth: false }, null], [{ account: { type: 'amazonBedrock', credentialSource: 'awsManaged' }, requiresOpenaiAuth: false }, null]] as const) {
    const f = fixture({ account });
    assert.equal((await f.adapter.discover({ cwd })).authenticated, expected);
  }
  const f = fixture({ onMessage(message: any, child: any) {
    if (message.method !== 'account/read') return;
    child.frame({ id: message.id, error: { code: -32601, message: 'SECRET=do-not-display' } });
    return true;
  } });
  const result = await f.adapter.discover({ cwd });
  assert.equal(result.authenticated, null);
  assert.ok(!JSON.stringify(result).includes('do-not-display'));
});

test('model discovery follows cursors and preserves the native model identifier', async () => {
  const f = fixture({ onMessage(message: any, child: any) {
    if (message.method !== 'model/list') return;
    child.reply(message, message.params.cursor ? { data: [{ id: 'two', displayName: 'Second' }], nextCursor: null }
      : { data: [{ id: 'one' }], nextCursor: 'next' });
    return true;
  } });
  assert.deepEqual((await f.adapter.discover({ cwd })).models, [{ id: 'one', label: 'one' }, { id: 'two', label: 'Second' }]);
});

test('an unrelated executable or missing CLI is unavailable and never treated as authenticated', async () => {
  const f = fixture({ version: 'another-program 9.0.0' });
  assert.equal((await f.adapter.discover({ cwd })).available, false);
  assert.equal(f.spawns.length, 1);
  const adapter = createCodexAdapter({ spawn() { throw new Error('ENOENT credential=private'); } });
  assert.equal((await adapter.discover({ cwd })).authenticated, null);
});

test('new run checkpoints a persistent native thread before starting its turn', async () => {
  const f = fixture();
  const events: any = [];
  const result = await f.adapter.run({ ...input, model: 'chosen-model', onEvent: async (event: any) => {
    if (event.type === 'session') {
      await tick();
      assert.ok(!f.messages.some((value: any) => value.method === 'turn/start'));
    }
    events.push(event);
  } });
  assert.equal(result.status, 'completed');
  assert.equal(result.nativeSessionId, 'thread-fixture');
  assert.equal(result.summary, 'Fixture answer.');
  assert.equal(events[0].type, 'session');
  const start = f.messages.find((value: any) => value.method === 'thread/start').params;
  assert.equal(start.ephemeral, false);
  assert.equal(start.approvalPolicy, 'on-request');
  assert.equal(start.approvalsReviewer, 'user');
  assert.equal(start.sandbox, 'workspace-write');
  const turn = f.messages.find((value: any) => value.method === 'turn/start').params;
  assert.equal(turn.model, 'chosen-model');
  assert.deepEqual(turn.sandboxPolicy, { type: 'workspaceWrite', writableRoots: [cwd], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true });
  assert.ok(f.children[0].waited === 1);
});

test('follow-up resumes only the explicitly selected native thread', async () => {
  const f = fixture();
  const result = await f.adapter.run({ ...input, nativeSessionId: 'existing-thread' });
  assert.equal(result.nativeSessionId, 'existing-thread');
  assert.equal(result.status, 'completed');
  assert.ok(!f.messages.some((value: any) => value.method === 'thread/start'));
  assert.equal(f.messages.find((value: any) => value.method === 'thread/resume').params.threadId, 'existing-thread');
});

test('a failed resume or changed native identity never falls back to a fresh thread', async () => {
  for (const wrongId of [true, false] as const) {
    const f = fixture({ onMessage(message: any, child: any) {
      if (message.method !== 'thread/resume') return;
      child.frame(wrongId ? { id: message.id, result: { thread: { id: 'different-thread' } } }
        : { id: message.id, error: { code: -32000, message: 'not found' } });
      return true;
    } });
    const result = await f.adapter.run({ ...input, nativeSessionId: 'original-thread' });
    assert.equal(result.status, 'failed');
    assert.equal(result.nativeSessionId, 'original-thread');
    assert.ok(!f.messages.some((value: any) => ['thread/start', 'turn/start'].includes(value.method)));
  }
});

test('missing policy and paths outside the host root block before any spawn', async () => {
  const f = fixture();
  for (const patch of [{ sandboxPolicy: undefined }, { cwd: '/workspace/project-other' }, { cwd: '/workspace/project/../../etc' }] as const) {
    assert.equal((await f.adapter.run({ ...input, ...patch })).status, 'blocked');
  }
  assert.equal(f.spawns.length, 0);
});

test('host read-only remains read-only and unrestricted host mode is capped to workspace-write', async () => {
  for (const [mode, expected] of [['read-only', 'read-only'], ['danger-full-access', 'workspace-write']] as const) {
    const f = fixture();
    await f.adapter.run({ ...input, sandboxPolicy: { ...sandboxPolicy, mode } });
    assert.equal(f.messages.find((value: any) => value.method === 'thread/start').params.sandbox, expected);
    assert.ok(!JSON.stringify(f.messages).includes('dangerFullAccess'));
  }
  assert.throws(() => createCodexAdapter({ spawn() {}, config: { args: ['--dangerously-bypass-approvals-and-sandbox'] } }));
});

test('assistant, tool, plan and usage events retain native identities and ignore foreign turns', async () => {
  const events: any = [];
  const f = fixture({ onTurn(child: any) {
    const ids: any = { threadId: 'thread-fixture', turnId: 'turn-fixture' };
    child.notification('item/agentMessage/delta', { ...ids, itemId: 'answer', delta: 'Hi ' });
    child.notification('item/agentMessage/delta', { ...ids, itemId: 'answer', delta: 'there' });
    child.notification('item/completed', { ...ids, turnId: 'foreign', item: { id: 'wrong', type: 'agentMessage', text: 'wrong' } });
    child.notification('item/started', { ...ids, item: { id: 'cmd', type: 'commandExecution', command: 'git status', status: 'inProgress' } });
    child.notification('item/commandExecution/outputDelta', { ...ids, itemId: 'cmd', delta: 'clean\n' });
    child.notification('item/completed', { ...ids, item: { id: 'cmd', type: 'commandExecution', aggregatedOutput: 'clean\n', exitCode: 0, status: 'completed' } });
    child.notification('turn/plan/updated', { ...ids, plan: [{ step: 'Inspect', status: 'completed' }] });
    child.notification('thread/tokenUsage/updated', { ...ids, tokenUsage: { total: { inputTokens: 12, outputTokens: 7, totalTokens: 19 } } });
    finish(child, ids.threadId, 'completed', 'Hi there');
  } });
  const result = await f.adapter.run({ ...input, onEvent: (event: any) => events.push(event) });
  assert.deepEqual(events.filter((event: any) => event.type === 'assistant' && event.data.delta).map((event: any) => event.text), ['Hi ', 'there']);
  assert.equal(events.filter((event: any) => event.type === 'tool').length, 3);
  assert.equal(events.find((event: any) => event.type === 'plan').data.plan[0].status, 'completed');
  assert.equal(result.usage.total.totalTokens, 19);
  assert.equal(result.summary, 'Hi there');
  assert.ok(!JSON.stringify(events).includes('wrong'));
});

test('an approval invokes one callback and replies exactly once with the original RPC id', async () => {
  let calls = 0;
  const f = fixture({ onTurn(child: any) { approval(child); approval(child); }, onMessage(message: any, child: any) {
    if (message.id === 77 && message.result) { finish(child); return true; }
  } });
  const result = await f.adapter.run({ ...input, requestPermission: async (request: any) => {
    calls++;
    assert.deepEqual(request.options.map((option: any) => option.id), ['accept', 'decline', 'cancel']);
    assert.ok(request.options.every((option: any) => !option.kind.endsWith('always')));
    assert.equal(request.details.nativeSessionId, 'thread-fixture');
    assert.equal(request.details.turnId, 'turn-fixture');
    assert.equal(request.details.itemId, 'command-1');
    assert.ok(request.details.connectionEpoch);
    await tick();
    return { optionId: 'accept' };
  } });
  assert.equal(result.status, 'completed');
  assert.equal(calls, 1);
  assert.deepEqual(f.messages.filter((message: any) => message.id === 77), [{ id: 77, result: { decision: 'accept' } }]);
});

test('broad, absent and unknown approval choices fail closed instead of upgrading a grant', async () => {
  for (const callback of [undefined, async () => ({ optionId: 'acceptForSession' }), async () => ({ optionId: 'not-offered' }), async () => null] as const) {
    const f = fixture({ onTurn: (child: any) => approval(child) });
    const result = await f.adapter.run({ ...input, requestPermission: callback });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(f.messages.find((message: any) => message.id === 77)?.result, { decision: 'decline' });
    assert.equal(f.children[0].waited, 1);
  }
});

test('network approvals retain their destination and use a network-specific prompt', async () => {
  const f = fixture({ onTurn: (child: any) => approval(child, { networkApprovalContext: { host: 'example.test', protocol: 'https', port: 443 } }), onMessage(message: any, child: any) {
    if (message.id === 77 && message.result) finish(child);
  } });
  await f.adapter.run({ ...input, requestPermission: (request: any) => {
    assert.equal(request.kind, 'network');
    assert.equal(request.details.networkApprovalContext.host, 'example.test');
    return { optionId: 'decline' };
  } });
});

test('out-of-scope filesystem grants and additional permissions are declined without a callback', async () => {
  for (const extra of [{ grantRoot: '/outside' }, { additionalPermissions: { fileSystem: { write: ['/outside'] } } }] as const) {
    const f = fixture({ onTurn: (child: any) => approval(child, extra) });
    const result = await f.adapter.run({ ...input, requestPermission() { assert.fail('must not ask for an unsupported grant'); } });
    assert.equal(result.status, 'blocked');
    assert.equal(f.messages.find((message: any) => message.id === 77).result.decision, 'decline');
  }
});

test('resolved or completed server requests cannot receive a stale affirmative reply', async () => {
  for (const resolved of [true, false] as const) {
    const answer = deferred(), asked = deferred();
    const f = fixture({ onTurn: (child: any) => approval(child) });
    const running = f.adapter.run({ ...input, requestPermission: () => { asked.resolve(); return answer.promise; } });
    await asked.promise;
    if (resolved) f.children[0].notification('serverRequest/resolved', { threadId: 'thread-fixture', requestId: 77 });
    finish(f.children[0]);
    const result = await running;
    answer.resolve({ optionId: 'accept' });
    await tick();
    assert.equal(result.status, 'completed');
    assert.equal(f.messages.filter((message: any) => message.id === 77).length, 0);
  }
});

test('unsupported user input and permission requests visibly block with empty grants', async () => {
  for (const [method, expected] of [['item/tool/requestUserInput', { answers: {} }], ['item/permissions/requestApproval', { permissions: {}, scope: 'turn' }]] as const) {
    const events: any = [];
    const f = fixture({ onTurn(child: any) { child.frame({ id: 'request-1', method, params: { threadId: 'thread-fixture', turnId: 'turn-fixture', itemId: 'input-1', questions: [] } }); } });
    const result = await f.adapter.run({ ...input, onEvent: (event: any) => events.push(event) });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(f.messages.find((message: any) => message.id === 'request-1').result, expected);
    assert.ok(events.some((event: any) => event.type === 'status' && event.data.status === 'blocked'));
  }
});

function questionRequest(child: any, questions: any, requestId = 'question-rpc') {
  child.frame({ id: requestId, method: 'item/tool/requestUserInput', params: {
    threadId: 'thread-fixture', turnId: 'turn-fixture', itemId: 'question-tool', questions,
  } });
}

const questions = [
  { id: 'colour', header: 'Colour', question: 'Which colour?', isOther: false, options: [{ label: 'Blue', description: 'A blue theme.' }, { label: 'Green', description: 'A green theme.' }] },
  { id: 'title', header: 'Title', question: 'Which title?', isOther: true, options: null },
];

test('user questions preserve identity and map structured host answers to native arrays', async () => {
  const f = fixture({ onTurn: (child: any) => questionRequest(child, questions), onMessage(message: any, child: any) {
    if (message.id === 'question-rpc' && message.result) finish(child);
  } });
  const result = await f.adapter.run({ ...input, requestInput: (request: any) => {
    assert.equal(request.nativeSessionId, 'thread-fixture');
    assert.equal(request.details.itemId, 'question-tool');
    assert.equal(request.questions[0].options[0].label, 'Blue');
    assert.equal(request.questions[0].multiSelect, false);
    assert.ok(request.signal instanceof AbortSignal);
    return { answers: [{ id: 'title', selected: [], custom: 'A clear title' }, { id: 'colour', selected: ['Blue'] }] };
  } });
  assert.equal(result.status, 'completed');
  assert.deepEqual(f.messages.find((message: any) => message.id === 'question-rpc').result, {
    answers: { title: { answers: ['A clear title'] }, colour: { answers: ['Blue'] } },
  });
});

test('secret, credential, malformed and unsupported questions never invoke the input handler', async () => {
  for (const requestQuestions of [[{ ...questions[0], isSecret: true }], [{ ...questions[0], question: 'Enter your API key' }], [{ ...questions[0], options: ['unsupported'] }], [questions[0], questions[0]]] as const) {
    const f = fixture({ onTurn: (child: any) => questionRequest(child, requestQuestions) });
    const result = await f.adapter.run({ ...input, requestInput() { assert.fail('unsafe input callback'); } });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(f.messages.find((message: any) => message.id === 'question-rpc').result, { answers: {} });
  }
});

test('cancelled, invalid and credential-bearing answers are never invented or sent', async () => {
  const invalid = [null, { answers: [] }, { answers: [{ id: 'colour', selected: ['not-offered'] }] },
    { answers: [{ id: 'colour', selected: ['Blue'], custom: 'secret alternative' }] }];
  for (const answer of invalid) {
    const f = fixture({ onTurn: (child: any) => questionRequest(child, [questions[0]]) });
    const result = await f.adapter.run({ ...input, requestInput: () => answer });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(f.messages.find((message: any) => message.id === 'question-rpc').result, { answers: {} });
  }
  const f = fixture({ onTurn: (child: any) => questionRequest(child, [questions[1]]) });
  assert.equal((await f.adapter.run({ ...input, requestInput: () => ({ answers: [{ id: 'title', selected: [], custom: 'sk-1234567890abcdef' }] }) })).status, 'blocked');
  assert.ok(!JSON.stringify(f.messages.filter((message: any) => message.id === 'question-rpc')).includes('1234567890abcdef'));
});

test('native resolution aborts the host question and suppresses the late answer', async () => {
  const asked = deferred(), answered = deferred();
  let inputSignal: any;
  const f = fixture({ onTurn: (child: any) => questionRequest(child, [questions[0]]) });
  const running = f.adapter.run({ ...input, requestInput: (request: any) => { inputSignal = request.signal; asked.resolve(); return answered.promise; } });
  await asked.promise;
  f.children[0].notification('serverRequest/resolved', { threadId: 'thread-fixture', requestId: 'question-rpc' });
  finish(f.children[0]);
  await running;
  assert.equal(((inputSignal)! as any).aborted, true);
  answered.resolve({ answers: [{ id: 'colour', selected: ['Blue'] }] });
  await tick();
  assert.ok(!f.messages.some((message: any) => message.id === 'question-rpc'));
});

test('an unsupported unscoped server request gets an error and visibly blocks', async () => {
  const f = fixture({ onTurn(child: any) { child.frame({ id: 123, method: 'account/chatgptAuthTokens/refresh', params: {} }); } });
  const result = await f.adapter.run(input);
  assert.equal(result.status, 'blocked');
  assert.ok(f.messages.find((message: any) => message.id === 123).error);
});

test('turn events missing identity fail rather than polluting the active stream', async () => {
  const f = fixture({ onTurn(child: any) { child.notification('item/agentMessage/delta', { threadId: 'thread-fixture', itemId: 'invalid', delta: 'unscoped' }); } });
  const events: any = [];
  const result = await f.adapter.run({ ...input, onEvent: (event: any) => events.push(event) });
  assert.equal(result.status, 'failed');
  assert.ok(!events.some((event: any) => event.text === 'unscoped'));
});

test('assistant deltas and completed items share a mergeable messageId', async () => {
  const events: any = [];
  const f = fixture({ onTurn(child: any) {
    child.notification('item/agentMessage/delta', { threadId: 'thread-fixture', turnId: 'turn-fixture', itemId: 'answer', delta: 'hello' });
    finish(child, 'thread-fixture', 'completed', 'hello');
  } });
  await f.adapter.run({ ...input, onEvent: (event: any) => events.push(event) });
  assert.deepEqual(events.filter((event: any) => event.type === 'assistant').map((event: any) => event.data.messageId), ['answer', 'answer']);
});

test('file approval receives the preceding complete change details even with slow persistence', async () => {
  const f = fixture({ onTurn(child: any) {
    child.notification('item/started', { threadId: 'thread-fixture', turnId: 'turn-fixture', item: { id: 'file-item', type: 'fileChange', status: 'inProgress', changes: [{ path: `${cwd}/index.js`, kind: { type: 'update' }, diff: '-old\n+new' }] } });
    child.frame({ id: 45, method: 'item/fileChange/requestApproval', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', itemId: 'file-item', grantRoot: cwd } });
  }, onMessage(message: any, child: any) { if (message.id === 45 && message.result) finish(child); } });
  await f.adapter.run({ ...input, onEvent: async () => { await tick(); }, requestPermission: (request: any) => {
    assert.equal(request.nativeSessionId, 'thread-fixture');
    assert.equal(request.defaultRejectOptionId, 'decline');
    assert.equal(request.details.item.changes[0].diff, '-old\n+new');
    return { optionId: 'accept' };
  } });
  assert.equal(f.messages.find((message: any) => message.id === 45).result.decision, 'accept');
});

test('foreign approval scope fails without invoking the callback', async () => {
  const f = fixture({ onTurn: (child: any) => approval(child, { turnId: 'another-turn' }) });
  const result = await f.adapter.run({ ...input, requestPermission() { assert.fail('foreign approval'); } });
  assert.equal(result.status, 'failed');
  assert.ok(f.messages.find((message: any) => message.id === 77).error);
});

test('cancellation interrupts a known turn, stops late callbacks and awaits managed cleanup', async () => {
  const controller = new AbortController(), asked = deferred(), answer = deferred();
  const f = fixture({ onTurn: (child: any) => approval(child) });
  const pending = f.adapter.run({ ...input, signal: controller.signal, requestPermission: () => { asked.resolve(); return answer.promise; } });
  await asked.promise;
  controller.abort();
  const result = await pending;
  answer.resolve({ optionId: 'accept' });
  await tick();
  assert.equal(result.status, 'cancelled');
  assert.ok(f.messages.some((message: any) => message.method === 'turn/interrupt'));
  assert.ok(!f.messages.some((message: any) => message.result?.decision === 'accept'));
  assert.equal(f.children[0].waited, 1);
});

test('cancellation before starting does not spawn a process', async () => {
  const f = fixture();
  assert.equal((await f.adapter.run({ ...input, signal: AbortSignal.abort() })).status, 'cancelled');
  assert.equal(f.spawns.length, 0);
});

test('protocol timeout covers a stalled stdin write and never retries the request', async () => {
  const f = fixture({ stallWrites: true });
  const result = await f.adapter.run(input);
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /timeout/);
  assert.equal(f.spawns.length, 1);
  assert.equal(f.children[0].terminated, 1);
});

test('a stalled approval reply is bounded and still cleans up the full process range', async () => {
  const f = fixture({ stallReply: true, onTurn: (child: any) => approval(child) });
  const result = await f.adapter.run({ ...input, requestPermission: () => ({ optionId: 'accept' }) });
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /timeout/);
  assert.equal(f.children[0].waited, 1);
  assert.equal(f.spawns.length, 1);
});

test('approval details requiring redaction cannot authorize an incompletely displayed operation', async () => {
  const f = fixture({ onTurn: (child: any) => approval(child, { command: 'curl -H "Authorization: Bearer private.credential.value" https://example.test' }) });
  const result = await f.adapter.run({ ...input, requestPermission() { assert.fail('incomplete approval details must not reach approval UI'); } });
  assert.equal(result.status, 'blocked');
  assert.equal(f.messages.find((message: any) => message.id === 77).result.decision, 'decline');
});

test('malformed protocol and early exit fail safely without forwarding stderr or raw errors', async () => {
  for (const malformed of [true, false] as const) {
    const events: any = [];
    const f = fixture({ onTurn(child: any) {
      child.stderr.write('AUTH_TOKEN=private-token-value');
      if (malformed) child.stdout.write('not-json SECRET=private-token-value\n');
      else child.exit(7);
    } });
    const result = await f.adapter.run({ ...input, onEvent: (event: any) => events.push(event) });
    assert.equal(result.status, 'failed');
    assert.ok(!JSON.stringify({ result, events }).includes('private-token-value'));
    assert.equal(f.children[0].waited, 1);
  }
});

test('credential-shaped fields and output text are redacted while token usage remains numeric', async () => {
  const events: any = [];
  const f = fixture({ onTurn(child: any) {
    child.notification('item/completed', { threadId: 'thread-fixture', turnId: 'turn-fixture', item: { type: 'mcpToolCall', id: 'tool', arguments: { env: { KEY: 'private' }, apiKey: 'private' }, result: 'AUTH_TOKEN=private' } });
    finish(child, 'thread-fixture', 'completed', 'Bearer abc.def.ghi and sk-1234567890abcdef');
  } });
  const result = await f.adapter.run({ ...input, onEvent: (event: any) => events.push(event) });
  assert.ok(!JSON.stringify({ result, events }).includes('private'));
  assert.ok(!JSON.stringify({ result, events }).includes('abc.def.ghi'));
  assert.match(result.summary, /redacted/);
});

test('cleanup uncertainty is thrown for false, rejected and unresponsive managed-range checks', async () => {
  for (const waitForExit of [async () => false, async () => { throw new Error('lost range'); }, async () => new Promise<any>(() => {})] as const) {
    const f = fixture({ waitForExit });
    await assert.rejects(f.adapter.run(input), { code: 'AGENTS_CLEANUP_UNCONFIRMED' });
  }
});

test('discovery never swallows a version-probe cleanup failure', async () => {
  const f = fixture({ waitForExit: async () => false });
  await assert.rejects(f.adapter.discover({ cwd }), { code: 'AGENTS_CLEANUP_UNCONFIRMED' });
});

test('backend identity binds executable, native profile and lookup path without credential material', () => {
  const spawn = () => { assert.fail('identity must not spawn'); };
  const make = (config: any) => createCodexAdapter({ spawn, config });
  const first = make({ executable: '/tools/codex', codexHome: '/profiles/one' });
  const same = make({ executable: '/tools/codex', codexHome: '/profiles/one', requestTimeoutMs: 12345 });
  assert.equal(first.backendIdentity, same.backendIdentity);
  assert.notEqual(first.backendIdentity, make({ executable: '/other/codex', codexHome: '/profiles/one' }).backendIdentity);
  assert.notEqual(first.backendIdentity, make({ executable: '/tools/codex', codexHome: '/profiles/two' }).backendIdentity);
  assert.deepEqual(JSON.parse(first.backendIdentity), { runtime: 'codex', transport: 'app-server-stdio-v2', executable: '/tools/codex', codexHome: '/profiles/one', searchPath: null, approvalPolicy: 'on-request', sandboxCeiling: 'workspace-write' });
  assert.throws(() => make({ codexHome: 'relative-profile' }));
});

test('the native profile is frozen into both discovery and execution spawn environments', async () => {
  const f = fixture();
  const adapter = createCodexAdapter({ spawn: f.spawn, config: { codexHome: '/profiles/explicit', requestTimeoutMs: 80, cleanupTimeoutMs: 80 } });
  await adapter.discover({ cwd });
  await adapter.run(input);
  assert.ok(f.spawns.every((spec: any) => spec.env.CODEX_HOME === '/profiles/explicit'));
  assert.ok(f.spawns.every((spec: any) => !Object.hasOwn(spec.env, 'OPENAI_API_KEY')));
});

test('aggregate queued protocol bytes are bounded even when every frame and event count fits', async () => {
  const f = fixture({ onTurn(child: any) {
    for (let index = 0; index < 4; index++) child.notification('item/commandExecution/outputDelta', { threadId: 'thread-fixture', turnId: 'turn-fixture', itemId: 'many', delta: 'a'.repeat(1100) });
  } });
  const adapter = createCodexAdapter({ spawn: f.spawn, config: { maxFrameBytes: 4096, maxQueuedEvents: 4096, maxQueuedBytes: 3000, requestTimeoutMs: 80, cleanupTimeoutMs: 80 } });
  const result = await adapter.run({ ...input, onEvent: async () => tick() });
  assert.equal(result.status, 'failed');
  assert.equal(f.children[0].waited, 1);
});

test('a reused RPC id with different scope fails without a second approval', async () => {
  let calls = 0;
  const f = fixture({ onTurn(child: any) { approval(child); approval(child, { command: 'different command' }); } });
  const result = await f.adapter.run({ ...input, requestPermission: async () => { calls++; return { optionId: 'accept' }; } });
  assert.equal(result.status, 'failed');
  assert.ok(calls <= 1);
  assert.ok(!f.messages.some((message: any) => message.result?.decision === 'accept'));
});

test('failed pagination discards partial directory rather than presenting it as complete',async()=>{
 const f=fixture({onMessage(message: any,child: any){if(message.method!=='model/list')return;child.reply(message,{data:[{id:'partial'}],nextCursor:'repeat'});return true;}})
 const result=await f.adapter.discover({cwd,sandboxPolicy});assert.deepEqual(result.models,[]);assert.equal((result.modelCatalog)!.status,'failed');
})
