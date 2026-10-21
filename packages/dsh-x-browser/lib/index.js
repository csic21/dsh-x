import { createAgentBrowserBackend } from './backends/agent-browser/backend.js';
import { createBrowserBroker } from './backends/embedded/broker.js';
import { registerEmbeddedRoutes } from './backends/embedded/register.js';
import { createAuthority } from './authority.js';
import { createBrowserOwnership } from './ownership.js';
import { cdpRuntime, embeddedRuntime } from './runtime.js';
import { registerBrowserTools } from './tools.js';
export const name = 'dsh-x-browser';
export const inject = ['tools', 'workingDirectory', 'profileContext', 'systemPrompt'];
/** Composition root: authority + one backend + optional renderer routes + model-facing tools. */
export function apply(ctx, config = {}) {
    const services = ctx;
    const authority = createAuthority(services, { approval: config.approval });
    let runtime;
    let ownership;
    if (config.backend === 'cdp') {
        const domains = config.cdp?.allowedDomains ?? [];
        const backend = createAgentBrowserBackend({
            command: config.cdp?.command,
            headed: config.cdp?.headed,
            timeoutMs: config.cdp?.timeoutMs,
            extraArgs: [...(config.cdp?.extraArgs ?? []), ...(domains.length ? ['--allowed-domains', domains.join(',')] : [])],
        });
        runtime = cdpRuntime(backend, { allowedDomains: domains });
    }
    else {
        const broker = createBrowserBroker({ profile: authority.profile, contextOf: authority.contextOf, turnOf: authority.turnOf, stickyGrants: config.persistentGrant === true, onTrace: event => ctx.emit('dsh-x-browser/trace', event) });
        ownership = createBrowserOwnership({ onClose: token => broker.revokeOwner(token) });
        ctx.provide('dshXBrowserOwnership', { bind: ownership.bind });
        ctx.effect(() => () => { ownership.dispose(); broker.dispose(); }, 'browser: broker lifetime');
        registerEmbeddedRoutes(ctx, broker);
        runtime = embeddedRuntime(broker);
    }
    ctx.effect(() => () => { void runtime.dispose(); }, 'browser: runtime lifetime');
    registerBrowserTools(ctx, { name, authority, runtime, ownership, approval: config.approval, persistentGrant: config.persistentGrant === true, systemPrompt: services.systemPrompt });
}
