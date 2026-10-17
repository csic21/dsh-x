#!/usr/bin/env node
// EXECUTABLE SYNTHETIC FIXTURE. Not Claude, no credentials and no model calls.
// Test prompts: fixture:permission, fixture:input, fixture:cancel; otherwise completes.
import { createInterface } from 'node:readline';
import { createClaudeFixture } from './claude-protocol.mjs';
if (process.argv.includes('--version')) { console.log('2.1.302 (Claude Code)'); process.exit(0); }
const output = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const fixture = createClaudeFixture({ argv: process.argv.slice(2), send: output,
  onUser(f, message) {
    const prompt = typeof message.message?.content === 'string' ? message.message.content : JSON.stringify(message.message?.content);
    if (prompt.includes('fixture:permission')) f.permission();
    else if (prompt.includes('fixture:input')) f.permission('AskUserQuestion', { questions: [{ question: 'Which fixture output?', header: 'Output', options: [{ label: 'Short', description: 'One line' }, { label: 'Long', description: 'Two lines' }], multiSelect: false }] });
    else if (prompt.includes('fixture:cancel')) return;
    else f.finish();
  },
  onResponse(f, message) { f.finish(message.response?.response?.behavior === 'allow' ? 'Synthetic one-time approval/input accepted.' : 'Synthetic native request denied.'); },
});
createInterface({ input: process.stdin }).on('line', line => { Promise.resolve().then(() => fixture.receive(JSON.parse(line))).catch(() => process.exit(2)); }).on('close', () => process.exit(0));
