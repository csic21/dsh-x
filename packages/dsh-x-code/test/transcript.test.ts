import test from 'node:test'
import assert from 'node:assert/strict'
import { chatRows, chatSessionView, projectTranscript, readTranscript, sendConversation } from '../src/transcript.ts'

test('conversation transcript keeps user and assistant text and drops tool arguments', () => {
  const rows = projectTranscript([
    { id: 's', role: 'system', content: [{ type: 'text', text: 'hidden prompt' }] },
    { id: 'u', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hello' }, { type: 'image' }] },
    { id: 'clock', role: 'user', source: { kind: 'context' }, content: [{ type: 'text', text: 'Time sampled while preparing turn 9' }] },
    { id: 'a', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: 'hi' }, { type: 'tool-call', name: 'read', arguments: '{"path":"secret"}' }] },
    { id: 't', role: 'tool', content: [{ type: 'text', text: 'file body' }] },
    { role: 'assistant', source: { kind: 'model' }, content: [{ type: 'tool-call', name: 'grep' }] },
  ])
  assert.deepEqual(rows, [
    { id: 'u', role: 'user', text: 'hello' },
    { id: 'a', role: 'assistant', text: 'hi', tools: ['read'] },
    { id: 'assistant:2', role: 'assistant', text: '', tools: ['grep'] },
  ])
  assert.deepEqual(readTranscript({ messages: rows }), rows)
  assert.equal(readTranscript(null), null)
  let draft = '', sent = 0
  assert.equal(sendConversation({ setDraft(text) { draft = text }, submit() { sent++ } }, '  ping '), true)
  assert.equal(draft, 'ping')
  assert.equal(sent, 1)
  assert.equal(sendConversation({ send() {} }, '   '), false)
  assert.deepEqual(chatRows(rows).map(row => row.kind === 'tools' ? row.names.join('+') : row.text), ['hello', 'hi', 'read', 'grep'])
  const view = chatSessionView(
    { byId: { a: { title: 'Older', updatedAt: 1 }, b: { title: '  ', blank: true, updatedAt: 3 }, c: { title: 'Other', updatedAt: 9 }, d: { title: 'Gone', updatedAt: 8 }, e: { title: 'Child', origin: 'subagent', updatedAt: 7 } } },
    { archivedSessionIds: ['d'], items: [{ workspaceId: 'ws', cwd: '/repo/', sessionIds: ['b', 'a', 'd', 'e'] }] },
    'a',
    '/repo',
  )
  assert.deepEqual(view.sessions.map(item => item.id), ['a'])
  assert.equal(view.workspaceId, 'ws')
  assert.equal(view.sessions[0].blank, false)
})
