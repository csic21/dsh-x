import { fail } from './store.ts'

/** One managed subprocess request: fixed argv, scrubbed environment, per-stream stdio. */
export interface SpawnSpec {
  argv: string[]
  cwd: string
  env: Record<string, string | undefined>
  signal: AbortSignal
  graceMs: number
  stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }
}
/** One settled managed subprocess; its streams deliver raw output bytes. */
export interface SpawnHandle {
  stdout: AsyncIterable<Uint8Array> | null
  stderr: AsyncIterable<Uint8Array> | null
  done: Promise<{ exitCode: number | null, signal: string | null }>
}
export type Spawn = (spec: SpawnSpec) => SpawnHandle | Promise<SpawnHandle>
/** One bounded Git read; `code` stays nullable because a signal can end the process. */
export interface GitCapture { output: string, error: string, ok: boolean, code: number | null, truncated: boolean }

/** Fixed argv only; never invoke a shell, textconv, hooks, or configured filters. */
export function createGit(spawn: Spawn) {
  async function capture(cwd: string, args: string[], signal: AbortSignal | undefined, maxBytes = 2_000_000, configLookup = false): Promise<GitCapture> {
    signal?.throwIfAborted()
    const control = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)])
    const env: Record<string, string | undefined>={...Object.fromEntries(Object.keys(process.env).filter(key=>/^GIT_/i.test(key)).map(key=>[key,undefined])),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_CONFIG_COUNT:'0',GIT_TERMINAL_PROMPT:'0',GIT_NO_LAZY_FETCH:'1'}
    // Read only the effective ignore-path setting from ordinary config sources.
    // All runtime Git operations still discard global/system routing and executables.
    if (configLookup) {
      env.GIT_CONFIG_GLOBAL = process.env.GIT_CONFIG_GLOBAL
      env.GIT_CONFIG_SYSTEM = process.env.GIT_CONFIG_SYSTEM
      env.GIT_CONFIG_NOSYSTEM = process.env.GIT_CONFIG_NOSYSTEM
    }
    const child = await spawn({ argv: args, cwd, env, signal: control, graceMs: 500,
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' } })
    let truncated = false
    async function read(stream: AsyncIterable<Uint8Array> | null, limit: number): Promise<string> {
      let size = 0; const parts: Buffer[] = []
      for await (const chunk of stream ?? []) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > limit) { truncated = true; continue }; parts.push(bytes) }
      return Buffer.concat(parts).toString('utf8')
    }
    const [output, error, done] = await Promise.all([read(child.stdout, maxBytes), read(child.stderr, 8000), child.done])
    signal?.throwIfAborted()
    return { output, error, ok: done.exitCode === 0 && !done.signal && !truncated, code: done.exitCode, truncated }
  }
  return async function git(cwd: string, args: string[], signal: AbortSignal | undefined, maxBytes?: number): Promise<GitCapture> {
    const prefix: string[] = ['git', '--no-pager', '--no-optional-locks', '--no-replace-objects', ...(args[0] === 'check-ignore' ? [] : ['--literal-pathspecs']), '-c', 'protocol.allow=never', '-c', 'diff.suppressBlankEmpty=false', '-c', 'color.ui=false', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false']
    if (['ls-files','check-ignore'].includes(args[0])) {
      const excludes = await capture(cwd, [...prefix, 'config', '--path', '--null', '--get', 'core.excludesFile'], signal, 8192, true)
      if (excludes.code !== 0 && excludes.code !== 1 || excludes.truncated || excludes.code === 1 && excludes.output || excludes.code === 0 && (!excludes.output.endsWith('\0') || excludes.output.slice(0,-1).includes('\0'))) throw fail('CODE_GIT', 'Global ignore rules could not be checked safely.')
      if (excludes.code === 0) prefix.push('-c', `core.excludesFile=${excludes.output.slice(0,-1)}`)
    }
    if (['diff','status'].includes(args[0])) {
      const config = await capture(cwd, [...prefix, 'config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|process|required)$'], signal, 8000)
      if (config.code !== 0 && config.code !== 1 || config.truncated || (config.code === 1 && config.output)) throw fail('CODE_GIT', 'Unsafe or incomplete Git filter configuration.')
      const keys = config.output ? config.output.replace(/\0$/, '').split('\0') : []
      if (keys.some(key => !/^filter\.[A-Za-z0-9_.-]+\.(clean|process|required)$/.test(key))) throw fail('CODE_GIT', 'Unsupported Git filter configuration.')
      for (const driver of new Set(keys.map(key => key.replace(/\.(clean|process|required)$/, '')))) prefix.push('-c', `${driver}.clean=`, '-c', `${driver}.process=`, '-c', `${driver}.required=false`)
    }
    return capture(cwd, [...prefix, ...args], signal, maxBytes)
  }
}
