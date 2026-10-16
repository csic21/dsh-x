import { SUBPROCESS_GRACE_MS } from './limits.js'

/**
 * Run one argv through the host subprocess seam and capture capped text.
 * @param {(spec: object) => object} spawn
 * @param {{ argv: string[], cwd: string, signal?: AbortSignal, timeoutMs: number, maxChars: number }} options
 */
export async function runCaptured(spawn, { argv, cwd, signal, timeoutMs, maxChars }) {
  const bound = AbortSignal.any([
    ...(signal === undefined ? [] : [signal]),
    AbortSignal.timeout(timeoutMs),
  ])
  let handle
  try {
    handle = spawn({
      argv,
      cwd,
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      graceMs: SUBPROCESS_GRACE_MS,
      signal: bound,
    })
  } catch (error) {
    return {
      exitCode: null,
      signal: null,
      output: error instanceof Error ? error.message : String(error),
      truncated: false,
    }
  }
  const [stdout, stderr, outcome] = await Promise.all([
    readCapped(handle.stdout, maxChars),
    readCapped(handle.stderr, Math.min(maxChars, 8_000)),
    handle.done.then(
      value => value,
      error => ({ exitCode: null, signal: null, error }),
    ),
  ])
  const parts = []
  if (stdout.text !== '') parts.push(stdout.text)
  if (stderr.text !== '') parts.push(stderr.text)
  if (outcome.error !== undefined) {
    parts.push(outcome.error instanceof Error ? outcome.error.message : String(outcome.error))
  }
  return {
    exitCode: outcome.exitCode ?? null,
    signal: outcome.signal ?? null,
    output: parts.join('\n'),
    truncated: stdout.truncated || stderr.truncated,
  }
}

async function readCapped(stream, maxChars) {
  if (stream === undefined || stream === null) return { text: '', truncated: false }
  stream.setEncoding('utf8')
  let text = ''
  let truncated = false
  try {
    for await (const chunk of stream) {
      if (truncated) continue
      const next = text.length + chunk.length
      if (next > maxChars) {
        text += chunk.slice(0, maxChars - text.length)
        text += '\n…[已截断]'
        truncated = true
        stream.destroy()
      } else {
        text += chunk
      }
    }
  } catch (error) {
    if (!truncated) text += error instanceof Error ? `\n${error.message}` : `\n${String(error)}`
  }
  return { text, truncated }
}
