/**
 * The native pet shell.
 *
 * A DOM overlay cannot leave the app window, and the Desktop shell does not
 * expose a window to plugins yet. So the plugin builds its own: a small AppKit
 * panel (transparent, floating, non-activating) that loads the same
 * `/api/dsh-x-pet/frame` document as the browser fallback.
 *
 * Everything here is macOS-only and degrades loudly: without `swiftc` the route
 * answers `PET_NATIVE_UNAVAILABLE`, and the Client falls back to a popup.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
/** Where the compiled shell lives: the profile's own plugin directory. */
export function shellBinary(profileDir) {
    return path.join(profileDir, '.dsh-x-pet', 'pet-window');
}
/** Whether the binary has to be rebuilt from the shipped source. */
export function needsCompile(source, binary) {
    if (!existsSync(binary))
        return true;
    try {
        return statSync(source).mtimeMs > statSync(binary).mtimeMs;
    }
    catch {
        return true;
    }
}
/**
 * The exact argv the shell runs with. The bootstrap URL carries the launch
 * token, which mints the browser cookie; the page is loaded after it lands.
 */
export function shellArguments(frameURL, bootstrapURL) {
    return ['--bootstrap', bootstrapURL, '--page', frameURL];
}
/** The frame document under the Host's own origin. */
export function frameURL(baseURL) {
    return new URL('api/dsh-x-pet/frame', baseURL).href;
}
/** Build once, then keep the process for as long as the user wants the pet out. */
export function createShell() {
    let child;
    const alive = () => child !== undefined && child.exitCode === null && child.signalCode === null;
    return {
        async open(options) {
            if (alive())
                return true;
            if (process.platform !== 'darwin')
                return false;
            const binary = shellBinary(options.profileDir);
            if (needsCompile(options.source, binary)) {
                try {
                    mkdirSync(path.dirname(binary), { recursive: true });
                    execFileSync('swiftc', ['-O', '-o', binary, options.source], { stdio: 'ignore', timeout: 120_000 });
                }
                catch {
                    return false;
                }
            }
            try {
                child = spawn(binary, shellArguments(options.frameURL, options.bootstrapURL), { detached: true, stdio: 'ignore' });
                child.unref();
                child.once('exit', () => { child = undefined; });
                // A panel that dies on launch (no window server, a bad URL) must fall
                // back to the popup instead of reporting a window nobody can see.
                await new Promise(resolve => setTimeout(resolve, 400));
                if (!alive())
                    return false;
                return true;
            }
            catch {
                child = undefined;
                return false;
            }
        },
        close() {
            if (alive())
                child?.kill();
            child = undefined;
        },
        running: alive,
    };
}
