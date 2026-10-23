import { HarnessError } from '@deepseek-ai/dsh-llm';
export declare class DshXFinanceError extends HarnessError {
    constructor(code: any, message: any);
}
export declare const quoteError: (code: any, message: any) => DshXFinanceError;
