import { HarnessError } from '@deepseek-ai/dsh-llm'
export class DshXFinanceError extends HarnessError {
  constructor(code: any, message: any) { super(message, `DSH_X_FINANCE_${code}`) }
}
export const quoteError = (code: any, message: any) => new DshXFinanceError(code, message)
