import type { Context } from '@deepseek-ai/cordis';
import type { UpdateConfig } from './types.ts';
export declare const name = "dsh-x-update";
export declare const inject: string[];
/**
 * Host half of the updater. Every transport is optional so a headless profile
 * keeps the tool and the automatic check, while the Desktop page only appears
 * when the shell exposes Connection.
 */
export declare function apply(ctx: Context, config?: UpdateConfig): void;
