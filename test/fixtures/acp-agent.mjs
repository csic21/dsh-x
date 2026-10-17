#!/usr/bin/env node
// Mock ACP adapter for local integration tests only. It never contacts a model,
// authenticates, or edits the task repository. Trace output is test-owned.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import readline from 'node:readline'
const configFile = new URL('./acp-fixture-config.json', import.meta.url)
const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {}

const send = value => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...value })}\n`)
const trace = value => {
  const traceFile = config.traceFile ?? process.env.DSH_X_TEST_ACP_TRACE
  if (traceFile) appendFileSync(traceFile, `${JSON.stringify(value)}\n`)
}
const versionFile = config.versionFile ?? process.env.DSH_X_TEST_ACP_VERSION_FILE
const version = versionFile ? readFileSync(versionFile, 'utf8').trim() : process.env.DSH_X_TEST_ACP_VERSION ?? '1.0.0-fixture'
const modes = config.noSafeMode === true || process.env.DSH_X_TEST_ACP_NO_SAFE_MODE === '1' ? [] : [
  { id: 'read-only', name: 'Mock read-only mode' },
  { id: 'plan', name: 'Mock plan mode' },
]
for await (const line of readline.createInterface({ input: process.stdin })) {
  const message = JSON.parse(line)
  trace({ method: message.method })
  if (message.method === 'initialize') send({ id: message.id, result: { protocolVersion: 1, authMethods: [], agentInfo: { name: 'dsh-x-mock-acp-fixture', version } } })
  else if (message.method === 'session/new') send({ id: message.id, result: { sessionId: 'mock-fixture-session', modes: { currentModeId: 'read-only', availableModes: modes } } })
  else if (message.method === 'session/set_mode') {
    if (!modes.some(mode => mode.id === message.params.modeId)) send({ id: message.id, error: { code: -32602, message: 'Mock safe mode unavailable' } })
    else send({ id: message.id, result: {} })
  } else if (message.method === 'session/prompt') {
    const prompt = message.params.prompt.map(item => item.text ?? '').join('\n')
    const reviewer = prompt.startsWith('You are a read-only independent reviewer')
    trace({ role: reviewer ? 'reviewer' : 'planner' })
    const manifest = {
      version: 1, goal: 'Mock fixture task', files: ['note.txt'],
      steps: [{ id: 'step-1', title: 'Update the fixture note' }], questions: [],
      checks: [{ id: 'check-1', command: config.checkCommand ?? process.env.DSH_X_TEST_CHECK_COMMAND ?? 'node --version', required: true }],
    }
    const text = reviewer
      ? 'Mock fixture review only.\n\n```dsh-x-verdict\npass\n```'
      : `Mock fixture plan only.\n\n\`\`\`dsh-x-plan\n${JSON.stringify(manifest)}\n\`\`\``
    send({ method: 'session/update', params: { sessionId: 'mock-fixture-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } } })
    send({ id: message.id, result: { stopReason: 'end_turn' } })
  }
}
