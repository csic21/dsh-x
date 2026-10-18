import type { Context } from '@deepseek-ai/cordis';
import type { UpdateConfig } from './types.ts';
export declare const name = "dsh-x-update";
export declare const inject: string[];
/**
 * Host half of the updater. It only reads the public release index and the
 * installed versions; installation remains owned by the official plugin
 * manager, so no download, profile edit, or extra home directory is needed.
 */
export declare function apply(ctx: Context, config?: UpdateConfig): void;
