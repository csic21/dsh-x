/** How strong the glass reads: more blur and more fill as it increases. */
export declare const GLASS_LEVELS: readonly ['clear', 'regular', 'dense'];
export type GlassLevel = typeof GLASS_LEVELS[number];
/** One persisted appearance choice. Every field has a defined default. */
export interface UiAppearance {
    version: 1;
    /** The whole treatment can be switched off without uninstalling. */
    enabled: boolean;
    /** Blur and fill strength. */
    level: GlassLevel;
    /** The living gradient behind the columns. Without it the glass has nothing to show. */
    backdrop: boolean;
    /** The specular rim and highlight that make a surface read as glass rather than as a flat tint. */
    refraction: boolean;
}
export declare const DEFAULT_APPEARANCE: UiAppearance;
/** The fields a user can change; `version` is owned by the store. */
export type UiAppearanceFields = Omit<UiAppearance, 'version'>;
export type UiAppearancePatch = Partial<UiAppearanceFields>;
export interface UiStore {
    /** What was persisted, or null when this profile has never stored a choice. */
    read(): Promise<UiAppearance | null>;
    /** Merge one patch over `base` and persist the complete result. */
    write(patch: UiAppearancePatch, base: UiAppearance): Promise<UiAppearance>;
    /** Where the choice lives, for diagnostics. */
    readonly directory: string;
}
/**
 * Normalize an untrusted record into a complete appearance. Unknown fields are
 * dropped and out-of-range values fall back to the default, so a hand-edited or
 * older file never leaves the UI half-styled.
 */
export declare function normalizeAppearance(value: unknown): UiAppearance;
/**
 * Read one patch from an untrusted payload. A key that is present must carry a
 * legal value: silently ignoring a bad value would save less than the user
 * asked for while the UI already showed the change.
 */
export declare function readPatch(value: unknown): UiAppearancePatch;
/**
 * Resolve the appearance to apply. The shipped default is the floor, the
 * composition's Config seeds the first run, and a stored choice wins over both
 * — so an upgrade that changes the default never flips a user's decision.
 */
export declare function resolveAppearance(stored: UiAppearance | null, config?: UiAppearancePatch): UiAppearance;
/**
 * A small JSON file under the profile directory. The appearance is one user's
 * choice for this profile, so it never touches the official session store.
 */
export declare function createUiStore(profileDirectory: string): UiStore;
