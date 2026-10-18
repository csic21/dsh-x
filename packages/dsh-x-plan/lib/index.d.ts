import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-x-plan";
export declare const inject: string[];
export declare function apply(context: Context): void;
export declare function requestApproval(ctx: any, exec: any, displayReason: any): Promise<void>;
