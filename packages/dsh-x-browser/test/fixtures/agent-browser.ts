import type { CliResult, CliRunner } from '../../src/backends/agent-browser/cli.ts'

/**
 * Scripted agent-browser CLI used by the conformance and backend tests.
 * Shapes follow the fixtures captured from agent-browser 0.39.1 (see contract tests).
 */
export function createScriptedCli() {
  const calls: string[][] = []
  type Session = { targetId: string, tabId: string, url: string, sequence: number, closed: boolean }
  const sessions = new Map<string, Session>()
  const state = (name: string): Session => {
    let value = sessions.get(name)
    if (!value) { value = { targetId: 'T0', tabId: 't1', url: 'about:blank', sequence: 0, closed: true }; sessions.set(name, value) }
    return value
  }
  const ok = (data: unknown): CliResult => ({ code: 0, stdout: JSON.stringify({ success: true, data, error: null }), stderr: '' })
  const runner: CliRunner = async ({ args }) => {
    calls.push(args)
    if (args.includes('--version')) return { code: 0, stdout: 'agent-browser 0.39.1', stderr: '' }
    const session = state(args[args.indexOf('--session') + 1])
    const known = ['open', 'tab', 'snapshot', 'click', 'fill', 'press', 'scroll', 'select', 'back', 'forward', 'reload', 'close']
    const start = args.findIndex(arg => known.includes(arg))
    const command = start >= 0 ? args.slice(start) : []
    if (command[0] === 'open') {
      session.sequence += 1
      session.targetId = `T${session.sequence}`
      session.url = command[1]
      session.closed = false
      return ok({ targetId: session.targetId, url: session.url, title: 'Fixture' })
    }
    if (command[0] === 'tab' && command[1] === 'new') {
      session.sequence += 1
      session.targetId = `T${session.sequence}`
      session.tabId = `t${session.sequence}`
      session.url = command[2]
      session.closed = false
      return ok({ tabId: session.tabId, targetId: session.targetId, url: session.url, total: session.sequence })
    }
    if (command[0] === 'tab' && command[1] === 'list') {
      return ok({ tabs: session.closed ? [] : [{ tabId: session.tabId, targetId: session.targetId, url: session.url, title: 'Fixture', active: true }] })
    }
    if (command[0] === 'tab' && command[1] === 'close') { session.closed = true; return ok({ closed: true }) }
    if (command[0] === 'tab') return ok({ active: true })
    if (command[0] === 'snapshot') {
      return ok({ origin: session.url, refs: { e1: { role: 'button', name: 'Go' }, e2: { role: 'textbox', name: 'Query' } }, snapshot: '- button "Go" [ref=e1]\n- textbox "Query" [ref=e2]' })
    }
    if (command[0] === 'close') { session.closed = true; return ok({ closed: true }) }
    return ok({ acknowledged: command[0] })
  }
  const argv = () => calls.filter(args => !args.includes('--version')).map(args => args.slice(args.indexOf('--session') + 2))
  return { runner, calls, argv }
}
