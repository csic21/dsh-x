#!/usr/bin/env node
// Synthetic ACP agent for managed-subprocess/DSH UI tests. No models, network,
// filesystem effects or credential reads. It is NOT an xAI executable.
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

if (process.argv.includes('--version')) {
  process.stdout.write('grok 1.0.62 (1474f9cbdd91)\n');
  process.exit(0);
}
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['agent', '--no-leader', 'stdio'])) process.exit(2);
const models = { currentModelId: 'grok-fixture', availableModels: [{ modelId: 'grok-fixture', name: 'Grok fixture' }] };
let sessionId, activePrompt, pending, reverseId = 100;
const send = value => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...value })}\n`);
const reply = (request, result) => send({ id: request.id, result });
const update = value => send({ method: 'session/update', params: { sessionId, update: value } });
function finish(text, stopReason = 'end_turn') {
  if (!activePrompt) return;
  if (text) update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
  reply(activePrompt, { stopReason, _meta: { sessionId, usage: { inputTokens: 7, outputTokens: 3 } } });
  activePrompt = null;
}
for await (const line of createInterface({ input: process.stdin })) {
  let request;
  try { request = JSON.parse(line); } catch { process.exitCode = 3; break; }
  if (request.jsonrpc !== '2.0') { process.exitCode = 3; break; }
  if (!request.method) {
    if (request.id !== pending?.id) continue;
    if (pending.kind === 'permission') {
      const accepted = request.result?.outcome?.outcome === 'selected' && request.result.outcome.optionId === 'allow-once';
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'fixture-tool', status: accepted ? 'completed' : 'failed' });
      finish(accepted ? 'Synthetic Grok permission accepted once.' : 'Synthetic Grok permission rejected.');
    } else if (pending.kind === 'input') {
      const accepted = request.result?.outcome === 'accepted';
      // Native Grok puts submitted answers/notes in the question tool result.
      // The adapter must omit this echo from durable host events.
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'fixture-question', status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: `Synthetic question result: ${JSON.stringify(request.result)}` } }],
        rawOutput: request.result });
      finish(accepted ? 'Synthetic Grok input received.' : 'Synthetic Grok input cancelled.');
    }
    pending = null; continue;
  }
  switch (request.method) {
    case 'initialize':
      reply(request, { protocolVersion: 1, agentCapabilities: { loadSession: true }, authMethods: [{ id: 'cached_token', name: 'Synthetic cached token' }],
        _meta: { grokShell: true, agentVersion: '1.0.62', defaultAuthMethodId: 'cached_token', modelState: models } }); break;
    case 'session/new': sessionId = `grok-fixture-${randomUUID()}`; reply(request, { sessionId, models }); break;
    case 'session/load': sessionId = request.params.sessionId; reply(request, { models }); break;
    case 'session/set_model':
      if (request.params.sessionId === sessionId && request.params.modelId === 'grok-fixture') reply(request, {});
      else send({ id: request.id, error: { code: -32602, message: 'Unknown fixture model or session' } });
      break;
    case 'session/prompt': {
      if (request.params.sessionId !== sessionId) { send({ id: request.id, error: { code: -32602, message: 'Wrong session' } }); break; }
      activePrompt = request;
      const text = request.params.prompt.map(part => part.text ?? '').join('');
      update({ sessionUpdate: 'plan', entries: [{ content: 'Exercise the synthetic Grok protocol.', priority: 'high', status: 'in_progress' }] });
      if (text.includes('fixture:permission')) {
        update({ sessionUpdate: 'tool_call', toolCallId: 'fixture-tool', title: 'printf fixture', status: 'pending', kind: 'execute', rawInput: { command: 'printf fixture' } });
        pending = { id: reverseId++, kind: 'permission' };
        send({ id: pending.id, method: 'session/request_permission', params: { sessionId,
          toolCall: { toolCallId: 'fixture-tool', title: 'printf fixture', kind: 'execute', rawInput: { command: 'printf fixture' } },
          options: [{ optionId: 'always-allow', name: 'Always allow', kind: 'allow_always' }, { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' }] } });
      } else if (text.includes('fixture:input')) {
        pending = { id: reverseId++, kind: 'input' };
        send({ id: pending.id, method: '_x.ai/ask_user_question', params: { sessionId, toolCallId: 'fixture-question', mode: 'default',
          questions: [{ question: 'Which fixture color?', multiSelect: false, options: [{ label: 'Blue', description: 'Cool fixture color.' }, { label: 'Red', description: 'Warm fixture color.' }] }] } });
      } else if (!text.includes('fixture:cancel')) {
        finish('Synthetic Grok answer. No model was called.');
      }
      break;
    }
    case 'session/cancel': pending = null; finish('', 'cancelled'); break;
    default: if (Object.hasOwn(request, 'id')) send({ id: request.id, error: { code: -32601, message: 'Unsupported fixture method' } });
  }
}
