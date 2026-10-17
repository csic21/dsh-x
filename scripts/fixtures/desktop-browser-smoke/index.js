/** CI-only deterministic model. No network, account, or vendor inference. */
import { writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm';
export const name = 'dsh-x-desktop-browser-smoke';
export const inject = ['llm'];
function recordResult(id, value) { const path = join(process.env.DSH_BROWSER_SMOKE_RESULTS, `${id}.json`); writeFileSync(`${path}.tmp`, JSON.stringify(value)); renameSync(`${path}.tmp`, path); }
const text = m => (m?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n');
function* emit(value) {
  yield { type: 'block-start', index: 0, blockType: 'text' };
  yield { type: 'text-delta', index: 0, text: value };
  yield { type: 'block-end', index: 0, block: { type: 'text', text: value } };
  yield { type: 'finish', reason: { kind: 'stop' } };
}
class Fixture extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: 'Synthetic offline Desktop test' }; }
  async listModels(provider) { return [{ provider, id: 'deterministic-local', name: 'Synthetic offline fixture', inputModalities: ['text'] }]; }
  async resolveModel(provider, model) {
    if (provider !== 'desktop-smoke' || model !== 'deterministic-local') throw Error('Fixture route only');
    return (await this.listModels(provider))[0];
  }
  async *stream(options) {
    const index = options.messages.findLastIndex(m => m.role === 'user' && (!m.source || m.source.kind === 'user'));
    let request;
    try { request = JSON.parse(text(options.messages[index])); } catch { yield* emit('Synthetic offline fixture: send a bounded browser test request.'); return; }
    if (!/^[a-z0-9-]{1,64}$/.test(request.id) || !['dsh_x_browser_tabs', 'dsh_x_browser_action'].includes(request.tool)) throw Error('Invalid test request');
    const subsequent = options.messages.slice(index + 1);
    const nativeResults = subsequent.filter(m => m.role === 'tool');
    if (nativeResults.some(m => !String(m.toolCallId).startsWith(`desktop-smoke-${request.id}`))) throw Error('Unrelated tool result');
    const result = nativeResults.at(-1);
    if (request.scenario === 'visible-flow') {
      const results = nativeResults;
      if (results.some(m => m.isError)) throw Error('Real browser tool failed; refusing replay');
      const values = results.map(m => JSON.parse(text(m)));
      const calls = subsequent.flatMap(m => (m.content ?? []).filter(b => b.type === 'tool-call'));
      if (results.some((m, i) => m.toolCallId !== `desktop-smoke-${request.id}-${i}`)) throw Error('Tool result identity mismatch');
      if (calls.length !== results.length) throw Error('Missing tool result; refusing replay');
      const tab = values[0]?.tabs?.find(t => t.visible && t.granted);
      if (values.length && !tab) throw Error('No visible granted tab');
      const identity = tab && { tabId: tab.tabId, epoch: tab.epoch, grantRevision: tab.grantRevision };
      if (values.length === 0) request = { ...request, tool: 'dsh_x_browser_tabs', arguments: {} };
      else if (values.length === 1 || values.length === 3) request = { ...request, tool: 'dsh_x_browser_action', arguments: { ...identity, action: 'observe' } };
      else if (values.length === 2) {
        const target = (values[1].result ?? values[1]).targets.find(t => /Fixture name/i.test(t.label));
        if (!target) throw Error('Visible input not observed');
        request = { ...request, tool: 'dsh_x_browser_action', arguments: { ...identity, action: 'type', target: target.ref, text: 'native-visible-proof' } };
      } else if (values.length === 4) {
        const target = (values[3].result ?? values[3]).targets.find(t => /Apply fixture value/.test(t.label));
        if (!target) throw Error('Visible button not observed');
        request = { ...request, tool: 'dsh_x_browser_action', arguments: { ...identity, action: 'click', target: target.ref } };
      } else if (values.length === 5) {
        recordResult(request.id, { id: request.id, isError: false, text: JSON.stringify({ tab, completed: 5 }) });
        // Keep this genuine host turn alive for manual takeover verification; no model request occurs.
        if (!options.signal) throw Error('Fixture requires a cancellable host turn');
        await new Promise(resolve => {
          if (options.signal.aborted) return resolve();
          const done = () => { clearTimeout(timer); options.signal.removeEventListener('abort', done); resolve(); };
          const timer = setTimeout(done, 60000); options.signal.addEventListener('abort', done, { once: true });
        });
        return;
      } else throw Error('Unexpected fixture sequence');
      const id = ToolCallId(`desktop-smoke-${request.id}-${values.length}`), args = JSON.stringify(request.arguments);
      yield { type: 'block-start', index: 0, blockType: 'tool-call' };
      yield { type: 'tool-call-delta', index: 0, id, name: request.tool, argumentsDelta: args };
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: request.tool, arguments: args } };
      yield { type: 'finish', reason: { kind: 'tool-calls' } }; return;
    }
    if (result) {
      if (result.toolCallId !== `desktop-smoke-${request.id}`) throw Error('Tool result identity mismatch');
      recordResult(request.id, { id: request.id, isError: result.isError === true, text: text(result) });
      yield* emit(`Synthetic browser test ${request.id} finished. No vendor model was called.`);
      return;
    }
    if (subsequent.some(m => m.content?.some(b => b.type === 'tool-call'))) throw Error('Missing tool result; refusing replay');
    const id = ToolCallId(`desktop-smoke-${request.id}`), args = JSON.stringify(request.arguments ?? {});
    yield { type: 'block-start', index: 0, blockType: 'tool-call' };
    yield { type: 'tool-call-delta', index: 0, id, name: request.tool, argumentsDelta: args };
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: request.tool, arguments: args } };
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  }
}
export function apply(ctx) { ctx.effect(() => ctx.llm.registerAdapter(['desktop-smoke'], new Fixture())); }
