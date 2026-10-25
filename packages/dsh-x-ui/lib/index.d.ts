import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-x-ui";
export declare const inject: string[];
/**
 * Composition-level defaults. They seed a profile that has never stored a
 * choice; after the first toggle the stored file wins, so a Config change on
 * upgrade never silently reverses what the user picked.
 */
export interface UiConfig {
    /** `false` keeps the shipped palette until the user turns the treatment on. */
    enabled?: boolean;
    /** Blur and fill strength. */
    level?: 'clear' | 'regular' | 'dense';
    /** Paint the living gradient behind the columns. */
    backdrop?: boolean;
    /** Draw the specular rim and highlight on elevated surfaces. */
    refraction?: boolean;
}
export declare const READ_ENDPOINT = "dsh-x-ui/read";
export declare const WRITE_ENDPOINT = "dsh-x-ui/write";
export declare function apply(ctx: Context, config?: UiConfig): void;
export { createUiStore, normalizeAppearance, readPatch, resolveAppearance } from './store.ts';
export type { GlassLevel, UiAppearance, UiAppearanceFields, UiAppearancePatch, UiStore } from './store.ts';
