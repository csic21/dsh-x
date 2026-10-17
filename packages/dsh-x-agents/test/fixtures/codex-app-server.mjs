#!/usr/bin/env node
// Test-only protocol fixture. No model, credentials, network, tools, or account
// APIs are contacted. Native-looking results below are synthetic test data.
import { createInterface } from 'node:readline';

if (process.argv.includes('--version')) {
  process.stdout.write('codex-cli 0.153.4-fixture\n');
} else {
  const lines = createInterface({ input: process.stdin });
  let threadId, turnId, count = 0, pending;
  const frame = value => process.stdout.write(`${JSON.stringify(value)}\n`);
  const notify = (method, params) => frame({ method, params });
  const reply = (request, result) => frame({ id: request.id, result });
  const ids = () => ({ threadId, turnId });
  const complete = (status = 'completed', text = 'Codex fixture finished. No model or command was run.') => {
    notify('item/completed', { ...ids(), item: { id: 'fixture-answer', type: 'agentMessage', phase: 'final_answer', text } });
    notify('thread/tokenUsage/updated', { ...ids(), tokenUsage: { total: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, last: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } });
    notify('turn/completed', { threadId, turn: { id: turnId, status, error: status === 'failed' ? { message: 'Synthetic fixture failure.' } : null } });
  };
  lines.on('line', line => {
    let request;
    try { request = JSON.parse(line); }
    catch { process.exitCode = 1; lines.close(); return; }
    if (!request.method) {
      if (pending && request.id === pending) {
        notify('serverRequest/resolved', { threadId, requestId: pending });
        pending = null;
        complete('completed', `Codex fixture received a host response. No command was run. ${JSON.stringify(request.result)}`);
      }
      return;
    }
    switch (request.method) {
      case 'initialize': reply(request, { userAgent: 'codex/0.153.4-fixture' }); break;
      case 'initialized': break;
      case 'account/read': reply(request, { account: { type: 'chatgpt', email: 'fixture@example.invalid', planType: 'fixture' }, requiresOpenaiAuth: true }); break;
      case 'model/list': reply(request, { data: [{ id: 'codex-fixture', model: 'codex-fixture', displayName: 'Codex fixture (no model)' }], nextCursor: null }); break;
      case 'thread/start':
        threadId = `codex-fixture-thread-${process.pid}`;
        reply(request, { thread: { id: threadId, ephemeral: false } });
        break;
      case 'thread/resume':
        threadId = request.params.threadId;
        reply(request, { thread: { id: threadId, ephemeral: false } });
        break;
      case 'turn/start': {
        turnId = `codex-fixture-turn-${++count}`;
        reply(request, { turn: { id: turnId, status: 'inProgress' } });
        notify('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
        notify('item/started', { ...ids(), item: { id: 'fixture-answer', type: 'agentMessage', text: '', phase: 'final_answer' } });
        notify('item/agentMessage/delta', { ...ids(), itemId: 'fixture-answer', delta: 'Codex fixture is active. ' });
        notify('turn/plan/updated', { ...ids(), explanation: 'Synthetic protocol exercise.', plan: [{ step: 'Exercise fixture events', status: 'completed' }] });
        const prompt = request.params.input.map(item => item.text ?? '').join('\n');
        if (prompt.includes('fixture:hang')) break;
        if (prompt.includes('fixture:approval')) {
          pending = 'fixture-approval';
          notify('item/started', { ...ids(), item: { id: 'fixture-command', type: 'commandExecution', command: 'echo fixture-only', cwd: request.params.cwd, status: 'inProgress' } });
          frame({ id: pending, method: 'item/commandExecution/requestApproval', params: { ...ids(), itemId: 'fixture-command', command: 'echo fixture-only', cwd: request.params.cwd,
            reason: 'Synthetic fixture approval; no command will run.', availableDecisions: ['accept', 'decline', 'cancel'] } });
          break;
        }
        if (prompt.includes('fixture:input')) {
          pending = 'fixture-input';
          frame({ id: pending, method: 'item/tool/requestUserInput', params: { ...ids(), itemId: 'fixture-question', questions: [{ id: 'colour', header: 'Fixture', question: 'Which fixture colour?', isSecret: false, isOther: true,
            options: [{ label: 'Blue', description: 'Synthetic option.' }, { label: 'Green', description: 'Another synthetic option.' }] }] } });
          break;
        }
        notify('item/completed', { ...ids(), item: { id: 'fixture-tool', type: 'commandExecution', command: 'fixture-only', status: 'completed', aggregatedOutput: 'Synthetic output; no command ran.', exitCode: 0 } });
        complete(prompt.includes('fixture:fail') ? 'failed' : 'completed');
        break;
      }
      case 'turn/interrupt':
        reply(request, {});
        if (pending) notify('serverRequest/resolved', { threadId, requestId: pending });
        pending = null;
        complete('interrupted', 'Codex fixture was interrupted.');
        break;
      default: frame({ id: request.id, error: { code: -32601, message: 'Fixture method unsupported.' } });
    }
  });
}
