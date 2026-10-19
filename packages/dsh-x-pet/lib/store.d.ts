/** One selectable pet, already validated against the Codex atlas contract. */
export interface PetEntry {
    /** Stable id: the folder name for a local pet, or `dsh-x-pet:default`. */
    id: string;
    displayName: string;
    description: string;
    /** `codex` is a built-in pet read from the installed app; `local` is `~/.codex/pets`. */
    source: 'bundled' | 'local' | 'codex';
    rows: 9 | 11;
    mime: 'image/png' | 'image/webp';
    bytes: number;
}
export interface PetPosition {
    x: number;
    y: number;
}
export interface PetSelection {
    version: 1;
    /** Pet id, or `off` when the companion is hidden. */
    active: string;
    /** The pet to restore when the switch is turned back on. */
    chosen: string | null;
    /** Last dragged position in CSS pixels from the frame's bottom-right corner. */
    position: PetPosition | null;
}
export declare const DEFAULT_PET_ID = "dsh-x-pet:default";
export declare const PET_OFF = "off";
/** One atlas is a few MiB at most; anything larger is not a pet sheet. */
export declare const MAX_ATLAS_BYTES: number;
export interface PetStore {
    /** Every pet the user can pick, bundled first. */
    list(): Promise<PetEntry[]>;
    /** The selected pet's atlas bytes plus the header that describes them. */
    atlas(id: string): Promise<{
        entry: PetEntry;
        bytes: Uint8Array;
    }>;
    /** Current selection, falling back to the bundled pet. */
    selection(): Promise<PetSelection>;
    /** Persist one selection and return what was stored. */
    select(id: string): Promise<PetSelection>;
    /** Persist the dragged position (bounded to sane pixel values). */
    move(position: PetPosition): Promise<PetSelection>;
    /** Where the selection lives, for diagnostics. */
    readonly directory: string;
}
export declare function createPetStore(options: {
    /** Official profile directory: plugin state lives under it, never in sessions. */
    profileDirectory: string;
    /** Where the bundled pet ships inside this package. */
    bundledDirectory: string;
    /** `${CODEX_HOME:-~/.codex}`. Absent means local pets are simply unavailable. */
    codexHome: string | undefined;
    /** Installed Codex/ChatGPT `app.asar`. Absent means the built-in pets are unavailable. */
    codexAsar?: string;
}): PetStore;
