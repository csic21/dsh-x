import type { Context } from '@deepseek-ai/cordis';
import type { ChatConfig } from './chat.ts';
export declare const name = "dsh-x-chat";
export declare const inject: string[];
export declare function apply(ctx: Context, config?: ChatConfig): void;
