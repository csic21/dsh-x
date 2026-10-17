import { HarnessError } from '@deepseek-ai/dsh-llm'
export class DshXPlanError extends HarnessError {
  constructor(code, message) { super(message, `DSH_X_PLAN_${code}`) }
}
export const planError = (code, message) => new DshXPlanError(code, message)
