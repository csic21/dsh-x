import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fail } from '../../contract/errors.js';
import { assertVersion, classifyError, parseEnvelope } from './contract.js';
const MAX_CAPTURE = 256 * 1024;
function excerpt(value) {
    return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 500) || 'agent-browser failed.';
}
/** Spawn without a shell: arguments never pass through command-line parsing. */
export const spawnRunner = ({ command, args, signal, timeoutMs, env }) => new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let overflow = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true, env: env ?? process.env });
    const finish = (settle) => {
        if (settled)
            return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        settle();
    };
    const kill = () => { try {
        child.kill('SIGKILL');
    }
    catch { } };
    const timer = setTimeout(() => { timedOut = true; kill(); }, Math.max(1, timeoutMs));
    const onAbort = () => { kill(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted)
        onAbort();
    child.stdout?.on('data', (chunk) => {
        if (overflow)
            return;
        if (stdout.length + chunk.length > MAX_CAPTURE) {
            overflow = true;
            kill();
            return;
        }
        stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-MAX_CAPTURE); });
    child.on('error', (error) => {
        finish(() => reject(error.code === 'ENOENT'
            ? fail('BROWSER_BINARY_MISSING', `Cannot run ${command}. Install agent-browser and retry.`)
            : fail('BROWSER_DAEMON', `agent-browser could not start: ${excerpt(error.message)}`)));
    });
    child.on('close', (code) => {
        finish(() => {
            if (overflow)
                return reject(fail('BROWSER_RESULT', 'agent-browser output exceeded the capture limit.'));
            if (timedOut)
                return reject(fail('BROWSER_TIMEOUT', `agent-browser did not finish within ${timeoutMs} ms.`));
            if (signal?.aborted)
                return reject(fail('BROWSER_REVOKED', 'The browser command was cancelled.'));
            resolve({ code: code ?? 1, stdout, stderr });
        });
    });
});
/** One CLI facade per plugin instance; version checks and session names are shared. */
export function createAgentBrowserCli(options = {}) {
    const command = options.command?.trim() || 'agent-browser';
    const sessionPrefix = options.sessionPrefix?.trim() || 'dsh';
    const extraArgs = [...(options.extraArgs ?? [])];
    const runner = options.runner ?? spawnRunner;
    let checked = null;
    /** Opaque, collision-free session name: profile and session id never become raw CLI arguments. */
    function sessionName(profile, sessionId) {
        return `${sessionPrefix}-${createHash('sha256').update(`${profile}\u0000${sessionId}`).digest('hex').slice(0, 16)}`;
    }
    function version() {
        if (!checked) {
            checked = (async () => {
                let result;
                try {
                    result = await runner({ command, args: ['--version'], timeoutMs: options.versionTimeoutMs ?? 8000, env: options.env });
                }
                catch (error) {
                    if (error.code)
                        throw error;
                    throw fail('BROWSER_BINARY_MISSING', `Cannot run ${command}. Install agent-browser and retry.`);
                }
                if (result.code !== 0)
                    throw fail('BROWSER_BINARY_MISSING', `Cannot run ${command} (exit ${result.code}). Install agent-browser and retry.`);
                assertVersion(result.stdout || result.stderr);
            })().catch((error) => { checked = null; throw error; });
        }
        return checked;
    }
    async function invoke(session, args, invokeOptions = {}) {
        await version();
        const result = await runner({
            command,
            args: ['--json', '--session', session, ...extraArgs, ...args],
            signal: invokeOptions.signal,
            timeoutMs: invokeOptions.timeoutMs ?? options.timeoutMs ?? 30_000,
            env: options.env,
        });
        let envelope;
        try {
            envelope = parseEnvelope(result.stdout);
        }
        catch (error) {
            if (result.code !== 0)
                throw fail('BROWSER_DAEMON', excerpt(result.stderr || `agent-browser exited with ${result.code}.`));
            throw error;
        }
        if (!envelope.success) {
            const message = excerpt(envelope.error ?? 'agent-browser command failed.');
            throw fail(errorCodeOf(envelope.code, message), message);
        }
        if (envelope.data === null)
            throw fail('BROWSER_PROTOCOL', 'agent-browser returned no data.');
        return envelope.data;
    }
    return { command, extraArgs, sessionName, version, invoke };
}
function errorCodeOf(code, message) {
    if (code === 'tab_gone')
        return 'BROWSER_TARGET';
    if (code === 'stale_ref')
        return 'BROWSER_STALE';
    return classifyError(message);
}
