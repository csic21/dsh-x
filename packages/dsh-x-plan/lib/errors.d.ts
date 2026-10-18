import { HarnessError } from '@deepseek-ai/dsh-llm';
export declare class DshXPlanError extends HarnessError {
    constructor(code: any, message: any);
}
export declare const planError: (code: any, message: any) => DshXPlanError;
