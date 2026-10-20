#!/usr/bin/env node
// Scripted agent-browser used by tool-level tests. Speaks the captured 0.39.1 contract.
const args = process.argv.slice(2)
const known = ['open', 'tab', 'snapshot', 'click', 'fill', 'press', 'scroll', 'select', 'back', 'forward', 'reload', 'close']
if (args.includes('--version')) {
  console.log('agent-browser 0.39.1')
  process.exit(0)
}
const start = args.findIndex(arg => known.includes(arg))
const command = start >= 0 ? args.slice(start) : []
const ok = data => console.log(JSON.stringify({ success: true, data, error: null }))
if (command[0] === 'open') ok({ targetId: 'T1', url: command[1], title: 'Fixture' })
else if (command[0] === 'tab' && command[1] === 'list') ok({ tabs: [{ tabId: 't1', targetId: 'T1', url: 'https://example.test/', title: 'Fixture', active: true }] })
else if (command[0] === 'tab') ok({ active: true })
else if (command[0] === 'snapshot') ok({ origin: 'https://example.test/', refs: { e1: { role: 'button', name: 'Go' } }, snapshot: '- button "Go" [ref=e1]' })
else if (command[0] === 'close') ok({ closed: true })
else ok({ acknowledged: command[0] })
