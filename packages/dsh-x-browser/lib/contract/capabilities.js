import { CDP_ACTIONS, EMBEDDED_ACTIONS } from './commands.js';
import { fail } from './errors.js';
/** Actions the embedded webview backend implements today. */
export const EMBEDDED_CAPABILITIES = new Set(EMBEDDED_ACTIONS);
/** Actions the agent-browser (CDP) backend exposes to the model. */
export const CDP_CAPABILITIES = new Set(CDP_ACTIONS);
export function capabilitiesOf(kind) {
    return kind === 'embedded' ? EMBEDDED_CAPABILITIES : CDP_CAPABILITIES;
}
export function supports(capabilities, action) {
    return capabilities.has(action);
}
/** Refuse the action before any backend work; callers never branch on backend kind. */
export function assertCapability(capabilities, action) {
    if (!capabilities.has(action))
        throw fail('BROWSER_UNSUPPORTED', `This browser backend does not support ${action}.`);
}
