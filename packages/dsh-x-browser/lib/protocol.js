import { ACTION_SPEC, EMBEDDED_ACTIONS, EMBEDDED_REF_PATTERN, NAVIGATION } from './contract/commands.js';
import { fail } from './contract/errors.js';
import { identifier } from './contract/ids.js';
import { boundedJson } from './contract/json.js';
import { modelUrl } from './contract/observation.js';
import { parseAddress } from './contract/url.js';
export { boundedJson as boundedResult, fail, identifier, modelUrl, NAVIGATION, parseAddress };
export { MAX_RESULT_BYTES } from './contract/limits.js';
/** Shared finite protocol. Never accepts JavaScript, selectors, CDP or arbitrary IPC. */
export const ACTIONS = Object.freeze([...EMBEDDED_ACTIONS]);
/** Untrusted value restricted to a plain object; class instances, arrays and primitives fail. */
function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}
export function validateCommand(raw, applicationOrigin, refPattern = EMBEDDED_REF_PATTERN, actions = ACTIONS) {
    if (!plainObject(raw) || typeof raw.action !== 'string' || !actions.includes(raw.action))
        throw fail('BROWSER_INPUT', 'Choose a supported browser action.');
    const fields = ACTION_SPEC[raw.action].fields;
    if (Object.keys(raw).some(key => key !== 'action' && !fields.includes(key)))
        throw fail('BROWSER_INPUT', 'Unknown browser command field.');
    const result = { action: raw.action };
    if (raw.action === 'navigate')
        result.url = parseAddress(raw.url, applicationOrigin);
    if (['click', 'type'].includes(raw.action)) {
        if (typeof raw.target !== 'string' || !refPattern.test(raw.target))
            throw fail('BROWSER_TARGET', 'Use an exact target from the latest observation.');
        result.target = raw.target;
    }
    if (raw.action === 'select') {
        if (typeof raw.target !== 'string' || !refPattern.test(raw.target))
            throw fail('BROWSER_TARGET', 'Use an exact target from the latest observation.');
        if (typeof raw.value !== 'string' || !raw.value || raw.value.length > 500 || /\u0000/.test(raw.value))
            throw fail('BROWSER_INPUT', 'Select value must contain 1–500 characters.');
        result.target = raw.target;
        result.value = raw.value;
    }
    if (raw.action === 'type') {
        if (typeof raw.text !== 'string' || !raw.text || raw.text.length > 2000 || /\u0000/.test(raw.text))
            throw fail('BROWSER_INPUT', 'Text must contain 1–2000 characters.');
        if (/-----BEGIN [A-Z ]*PRIVATE KEY|\b(?:sk-|gh[pousr]_|github_pat_|AKIA)[A-Za-z0-9_\-]{10,}|\bBearer\s+[A-Za-z0-9._\-]{12,}/i.test(raw.text))
            throw fail('BROWSER_SECRET', 'Credentials must be entered manually.');
        if (/^\s*\d{4,8}\s*$/.test(raw.text) || /(?:\d[ -]?){13,19}/.test(raw.text))
            throw fail('BROWSER_SECRET', 'Verification codes and card-like numbers must be entered manually.');
        result.text = raw.text;
    }
    if (raw.action === 'scroll') {
        for (const key of ['x', 'y']) {
            if (!Number.isInteger(raw[key]) || Math.abs(raw[key]) > 2000)
                throw fail('BROWSER_INPUT', 'Scroll distance must be an integer between -2000 and 2000.');
            result[key] = raw[key];
        }
    }
    if (raw.action === 'press') {
        if (!['Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(raw.key))
            throw fail('BROWSER_INPUT', 'This key is not supported. Use an explicitly approved click to submit.');
        result.key = raw.key;
    }
    return result;
}
