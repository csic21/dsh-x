import { HarnessError } from '@deepseek-ai/dsh-llm';
export class DshXFinanceError extends HarnessError {
    constructor(code, message) { super(message, `DSH_X_FINANCE_${code}`); }
}
export const quoteError = (code, message) => new DshXFinanceError(code, message);
