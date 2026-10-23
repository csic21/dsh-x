// The plugin used to be called `dsh-x-stock` and kept its profile state in
// `.dsh-x-stock`. That directory holds the random scope identifier the browser
// storage key is derived from, so adopting it during the rename is what makes
// an existing watchlist keep working instead of looking like a fresh install.
// Nothing is deleted: the old directory is renamed in place, once.
import { rename } from 'node:fs/promises';
import path from 'node:path';
export const STORE_DIRECTORY = '.dsh-x-finance';
/** Pre-rename directory; only ever renamed, never read directly. */
export const PREVIOUS_STORE_DIRECTORY = '.dsh-x-stock';
const adopted = new Set();
/**
 * Returns the profile-scoped store directory, adopting the pre-rename one the
 * first time it is called. A concurrent host start that loses the race simply
 * keeps the directory the winner created.
 */
export async function profileStoreDirectory(profileDirectory) {
    if (typeof profileDirectory !== 'string' || !path.isAbsolute(profileDirectory))
        throw new Error('无效的 profile 目录。');
    const current = path.join(profileDirectory, STORE_DIRECTORY);
    if (adopted.has(current))
        return current;
    const previous = path.join(profileDirectory, PREVIOUS_STORE_DIRECTORY);
    try {
        await rename(previous, current);
    }
    catch { /* Nothing to adopt, or the destination already exists. */ }
    adopted.add(current);
    return current;
}
