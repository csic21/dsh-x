import { HarnessError } from '@deepseek-ai/dsh-llm'
export class DshXPlanError extends HarnessError {
  constructor(code: any, message: any) { super(message, `DSH_X_PLAN_${code}`) }
}
export const planError = (code: any, message: any) => new DshXPlanError(code, message)
