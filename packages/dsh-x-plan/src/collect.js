import { COMMAND_TIMEOUT_MS, MAX_COMMAND_OUTPUT_CHARS, MAX_DIFF_CHARS } from './limits.js'
import { runCaptured } from './command.js'

/**
 * Evidence for the reviewer: git status, the diff against HEAD, untracked
 * names, and the output of the acceptance commands named in the approved plan.
 * @param {(spec: object) => object} spawn
 * @param {{ cwd: string, commands: string[], signal?: AbortSignal }} options
 */
export async function collectEvidence(spawn, { cwd, commands, signal }) {
  const status = await git(spawn, cwd, ['status', '--short'], signal)
  const diff = await git(spawn, cwd, ['diff', 'HEAD'], signal)
  const untracked = await git(spawn, cwd, ['ls-files', '--others', '--exclude-standard'], signal)
  const runs = []
  for (const command of commands) {
    if (signal?.aborted) break
    const result = await runCaptured(spawn, {
      argv: shellArgv(command),
      cwd,
      signal,
      timeoutMs: COMMAND_TIMEOUT_MS,
      maxChars: MAX_COMMAND_OUTPUT_CHARS,
    })
    runs.push({ command, ...result })
  }
  return { status, diff, untracked, runs }
}

/** Render the packet the reviewer actually sees. */
export function renderEvidence(planText, evidence) {
  const sections = [
    '## 已批准的计划',
    planText.trim(),
    '## git status --short',
    block(evidence.status),
    '## git diff HEAD',
    block(evidence.diff),
    '## 未跟踪文件',
    block(evidence.untracked),
    '## 验收命令',
  ]
  if (evidence.runs.length === 0) sections.push('计划里没有验收命令。')
  for (const run of evidence.runs) {
    const code = run.exitCode === null ? '无退出码' : String(run.exitCode)
    sections.push(`$ ${run.command}`, `退出码: ${code}`, run.output.trim() === '' ? '（无输出）' : run.output.trim())
  }
  return sections.join('\n\n')
}

async function git(spawn, cwd, args, signal) {
  const result = await runCaptured(spawn, {
    argv: ['git', ...args],
    cwd,
    signal,
    timeoutMs: 30_000,
    maxChars: MAX_DIFF_CHARS,
  })
  const header = result.exitCode === 0 ? '' : `git ${args.join(' ')} 退出码 ${result.exitCode ?? '无'}\n`
  return `${header}${result.output}`.trim()
}

function shellArgv(command) {
  if (process.platform === 'win32') return ['powershell.exe', '-NoProfile', '-Command', command]
  return ['/bin/bash', '-lc', command]
}

function block(text) {
  return text.trim() === '' ? '（空）' : text.trim()
}
