import { HarnessError } from '@deepseek-ai/dsh-llm'
export class DshXStockError extends HarnessError {
  constructor(code, message) { super(message, `DSH_X_STOCK_${code}`) }
}
export const quoteError = (code, message) => new DshXStockError(code, message)
