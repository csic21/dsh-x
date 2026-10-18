import { HarnessError } from '@deepseek-ai/dsh-llm';
export declare class DshXStockError extends HarnessError {
    constructor(code: any, message: any);
}
export declare const quoteError: (code: any, message: any) => DshXStockError;
