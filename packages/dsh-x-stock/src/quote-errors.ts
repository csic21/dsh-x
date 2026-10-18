import { HarnessError } from '@deepseek-ai/dsh-llm'
export class DshXStockError extends HarnessError {
  constructor(code: any, message: any) { super(message, `DSH_X_STOCK_${code}`) }
}
export const quoteError = (code: any, message: any) => new DshXStockError(code, message)
