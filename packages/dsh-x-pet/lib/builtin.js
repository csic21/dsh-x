import { inspectAtlas } from './atlas.js';
import { listAsar, readAsar } from './asar.js';
/**
 * The pets Codex ships in the desktop app. Names and descriptions are the
 * labels the app itself shows; the spritesheets stay inside the user's
 * installed app and are never copied into this package.
 */
const KNOWN = {
    codex: { displayName: 'Codex', description: 'The original Codex companion.', order: 0 },
    dewey: { displayName: 'Dewey', description: 'A calm companion for focused workspace days', order: 1 },
    fireball: { displayName: 'Fireball', description: 'Hot path energy for fast iteration.', order: 2 },
    hoots: { displayName: 'Hoots', description: 'A sharp-eyed owl for polished work in a blink.', order: 3 },
    rocky: { displayName: 'Rocky', description: 'A steady rock when the diff gets large.', order: 4 },
    seedy: { displayName: 'Seedy', description: 'Small green shoots for new ideas.', order: 5 },
    stacky: { displayName: 'Stacky', description: 'A balanced stack for deep work.', order: 6 },
    bsod: { displayName: 'BSOD', description: 'A tiny blue-screen gremlin.', order: 7 },
    'null-signal': { displayName: 'Null Signal', description: 'Quiet signal from the void.', order: 8 },
};
const SHEET = /(?:^|\/)([a-z0-9-]+)-spritesheet-v(\d+)-[a-f0-9]+\.webp$/;
export const codexPetId = (slug) => `codex:${slug}`;
/**
 * Every built-in pet whose spritesheet is inside this asar. A newer
 * `spritesheet-vN` for the same id replaces an older one. Sheets that are
 * not a Codex atlas are skipped.
 */
export async function discoverBuiltin(asarPath) {
    const files = await listAsar(asarPath, SHEET);
    const best = new Map();
    for (const file of files) {
        const match = SHEET.exec(file.path);
        if (!match)
            continue;
        const slug = match[1];
        const version = Number(match[2]);
        const current = best.get(slug);
        if (!current || version > current.version)
            best.set(slug, { version, file });
    }
    const pets = [];
    for (const [slug, found] of best) {
        try {
            const bytes = await readAsar(asarPath, found.file);
            const atlas = inspectAtlas(bytes);
            const known = KNOWN[slug];
            pets.push({
                file: found.file,
                entry: {
                    id: codexPetId(slug),
                    displayName: known?.displayName ?? slug,
                    description: known?.description ?? '',
                    source: 'codex',
                    rows: atlas.rows,
                    mime: atlas.mime,
                    bytes: bytes.byteLength,
                },
            });
        }
        catch { /* Not a pet sheet: leave it out of the picker. */ }
    }
    pets.sort((a, b) => {
        const left = KNOWN[a.entry.id.slice('codex:'.length)]?.order ?? 100;
        const right = KNOWN[b.entry.id.slice('codex:'.length)]?.order ?? 100;
        return left - right || a.entry.displayName.localeCompare(b.entry.displayName);
    });
    return pets;
}
