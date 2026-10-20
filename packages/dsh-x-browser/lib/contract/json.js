import { fail } from './errors.js';
import { MAX_RESULT_BYTES } from './limits.js';
/** Serialize once, enforce the byte budget, then return a detached copy. */
export function boundedJson(value, maxBytes = MAX_RESULT_BYTES) {
    let json;
    try {
        json = JSON.stringify(value);
    }
    catch {
        throw fail('BROWSER_RESULT', 'Invalid browser result.');
    }
    if (!json || new TextEncoder().encode(json).length > maxBytes)
        throw fail('BROWSER_RESULT', 'Browser result exceeds the size limit.');
    return JSON.parse(json);
}
