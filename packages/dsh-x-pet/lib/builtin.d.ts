import type { AsarFile } from './asar.ts';
import type { PetEntry } from './store.ts';
export declare const codexPetId: (slug: string) => string;
export interface BuiltinPet {
    entry: PetEntry;
    file: AsarFile;
}
/**
 * Every built-in pet whose spritesheet is inside this asar. A newer
 * `spritesheet-vN` for the same id replaces an older one. Sheets that are
 * not a Codex atlas are skipped.
 */
export declare function discoverBuiltin(asarPath: string): Promise<BuiltinPet[]>;
