import { fail } from './store.js';
const BASE = ['git', '--no-pager', '--no-optional-locks', '--no-replace-objects'];
const GUARDS = ['-c', 'protocol.allow=never', '-c', 'diff.suppressBlankEmpty=false', '-c', 'color.ui=false', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false'];
/** Exact argv: literal pathspecs everywhere except ignore matching, then the fixed guards. */
const argvFor = (args, overrides) => [...BASE, ...(args[0] === 'check-ignore' ? [] : ['--literal-pathspecs']), ...GUARDS, ...overrides, ...args];
/** Fixed argv only; never invoke a shell, textconv, hooks, or configured filters. */
export function createGit(spawn) {
    async function capture(cwd, argv, signal, maxBytes = 2_000_000, configLookup = false, binary = false) {
        signal?.throwIfAborted();
        const control = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)]);
        const env = { ...Object.fromEntries(Object.keys(process.env).filter(key => /^GIT_/i.test(key)).map(key => [key, undefined])), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' };
        // Read only the effective ignore-path setting from ordinary config sources.
        // All runtime Git operations still discard global/system routing and executables.
        if (configLookup) {
            env.GIT_CONFIG_GLOBAL = process.env.GIT_CONFIG_GLOBAL;
            env.GIT_CONFIG_SYSTEM = process.env.GIT_CONFIG_SYSTEM;
            env.GIT_CONFIG_NOSYSTEM = process.env.GIT_CONFIG_NOSYSTEM;
        }
        const child = await spawn({ argv, cwd, env, signal: control, graceMs: 500,
            stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' } });
        let truncated = false;
        async function read(stream, limit) {
            let size = 0;
            const parts = [];
            for await (const chunk of stream ?? []) {
                const bytes = Buffer.from(chunk);
                size += bytes.length;
                if (size > limit) {
                    truncated = true;
                    continue;
                }
                ;
                parts.push(bytes);
            }
            return Buffer.concat(parts);
        }
        const [stdout, stderr, done] = await Promise.all([read(child.stdout, maxBytes), read(child.stderr, 8000), child.done]);
        signal?.throwIfAborted();
        return { output: binary ? '' : stdout.toString('utf8'), bytes: binary ? stdout : undefined, error: stderr.toString('utf8'), ok: done.exitCode === 0 && !done.signal && !truncated, code: done.exitCode, truncated };
    }
    /** Preserve the effective global/system ignore file instead of inheriting full Git routing. */
    async function ignoreOverrides(cwd, signal) {
        const excludes = await capture(cwd, argvFor(['config', '--path', '--null', '--get', 'core.excludesFile'], []), signal, 8192, true);
        if (excludes.code !== 0 && excludes.code !== 1 || excludes.truncated || excludes.code === 1 && excludes.output || excludes.code === 0 && (!excludes.output.endsWith('\0') || excludes.output.slice(0, -1).includes('\0')))
            throw fail('CODE_GIT', 'Global ignore rules could not be checked safely.');
        return excludes.code === 0 ? ['-c', `core.excludesFile=${excludes.output.slice(0, -1)}`] : [];
    }
    /** Neutralize every configured clean/process filter instead of executing it. */
    async function filterOverrides(cwd, signal) {
        const config = await capture(cwd, argvFor(['config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|process|required)$'], []), signal, 8000);
        if (config.code !== 0 && config.code !== 1 || config.truncated || (config.code === 1 && config.output))
            throw fail('CODE_GIT', 'Unsafe or incomplete Git filter configuration.');
        const keys = config.output ? config.output.replace(/\0$/, '').split('\0') : [];
        if (keys.some(key => !/^filter\.[A-Za-z0-9_.-]+\.(clean|process|required)$/.test(key)))
            throw fail('CODE_GIT', 'Unsupported Git filter configuration.');
        return [...new Set(keys.map(key => key.replace(/\.(clean|process|required)$/, '')))].flatMap(driver => ['-c', `${driver}.clean=`, '-c', `${driver}.process=`, '-c', `${driver}.required=false`]);
    }
    async function git(cwd, args, signal, maxBytes, binary = false) {
        const overrides = ['ls-files', 'check-ignore'].includes(args[0]) ? await ignoreOverrides(cwd, signal) : [];
        if (['diff', 'status'].includes(args[0]))
            overrides.push(...await filterOverrides(cwd, signal));
        return capture(cwd, argvFor(args, overrides), signal, maxBytes, false, binary);
    }
    /**
     * Resolve the safety lookups once for a whole operation, then let its
     * independent reads run together. Every read keeps the same fixed argv, the
     * same guards, and the same byte bound it would have had on its own; only the
     * repeated configuration reads and the serial process starts are avoided.
     */
    async function prepare(cwd, signal, needs = {}) {
        const [ignore, filters] = await Promise.all([
            needs.ignore ? ignoreOverrides(cwd, signal) : Promise.resolve([]),
            needs.filters ? filterOverrides(cwd, signal) : Promise.resolve([]),
        ]);
        const overrides = [...ignore, ...filters];
        const read = (command) => capture(cwd, argvFor(command.args, overrides), signal, command.maxBytes, false, command.binary === true);
        return { read, parallel: commands => Promise.all(commands.map(read)) };
    }
    return Object.assign(git, { prepare });
}
