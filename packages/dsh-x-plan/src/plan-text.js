import { MAX_ACCEPTANCE_COMMANDS, MAX_COMMAND_CHARS } from './limits.js'

const ACCEPTANCE_FENCE = /```dsh-x-acceptance[^\n]*\n([\s\S]*?)```/g
const VERDICT_FENCE = /```dsh-x-verdict[^\n]*\n([\s\S]*?)```/g

/**
 * Pull acceptance commands from the last `dsh-x-acceptance` fence.
 * Empty or missing fences mean there is nothing to run.
 * @param {string} text
 * @returns {{ commands: string[] } | { error: string }}
 */
export function parseAcceptance(text) {
  const body = lastFence(text, ACCEPTANCE_FENCE)
  if (body === undefined) return { commands: [] }
  const commands = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    if (line.length > MAX_COMMAND_CHARS) {
      return { code: 'ACCEPTANCE_LENGTH', error: `验收命令超过 ${MAX_COMMAND_CHARS} 个字符。` }
    }
    commands.push(line)
  }
  if (commands.length > MAX_ACCEPTANCE_COMMANDS) {
    return { code: 'ACCEPTANCE_COUNT', error: `验收命令超过 ${MAX_ACCEPTANCE_COMMANDS} 条。` }
  }
  return { commands }
}

/**
 * Pull `pass` or `fail` from the last verdict fence.
 * A missing or unknown verdict is a failure, and the gap text says so.
 * @param {string} text
 * @returns {{ verdict: 'pass' | 'fail', gaps: string }}
 */
export function parseVerdict(text) {
  const body = lastFence(text, VERDICT_FENCE)
  const gaps = text.replace(new RegExp(VERDICT_FENCE.source, 'g'), '').trim()
  const verdict = body?.trim()
  if (verdict === 'pass' || verdict === 'fail') return { verdict, gaps, body: gaps, missingVerdict: false }
  const note = '验收结论缺少只含 pass 或 fail 的 dsh-x-verdict 代码块。'
  return { verdict: 'fail', body: gaps, missingVerdict: true, gaps: gaps === '' ? note : `${gaps}\n\n${note}` }
}

function lastFence(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const expression = new RegExp(pattern.source, flags)
  let match = expression.exec(text)
  let body
  while (match !== null) {
    body = match[1]
    match = expression.exec(text)
  }
  return body
}
