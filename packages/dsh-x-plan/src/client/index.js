import { PlanToolRow } from './PlanToolRow.jsx'
import { NS, zh, en } from './locales.js'
export const inject = ['slots', 'locale']
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plan: dictionaries')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-x-plan'
    style.textContent = '.dxp-tool { padding: 12px; color: var(--dsw-alias-label-primary); } .dxp-tool p { margin: 8px 0; } .dxp-body { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; } .dxp-tool button { margin-inline-start: 8px; color: inherit; font: inherit; }'
    document.head.appendChild(style)
    return () => style.remove()
  }, 'plan: styles')
  const formatCount = value => {
    const locale = ctx.locale.getLocale().active
    const tag = locale === 'zh' ? 'zh-CN' : locale
    return new Intl.NumberFormat(Intl.NumberFormat.supportedLocalesOf([tag])[0] ?? 'en', { maximumFractionDigits: 0 }).format(value)
  }
  for (const key of ['dsh_x_plan', 'dsh_x_approve_plan', 'dsh_x_discard_plan', 'dsh_x_review']) {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key, locale: NS, inject: () => ({ formatCount }) }, PlanToolRow))
  }
}
