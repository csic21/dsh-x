import { PlanToolRow } from './PlanToolRow.tsx'
import { NS, zh, en } from './locales.ts'
export const inject = ['slots', 'locale']
export function apply(ctx: any) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plan: dictionaries')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-x-plan'
    style.textContent = `
.dxp-tool{box-sizing:border-box;max-width:100%;min-width:0;padding:14px;color:var(--dsw-alias-label-primary,#202124);font:13px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}
.dxp-tool *{box-sizing:border-box;min-width:0}.dxp-tool p{margin:8px 0}.dxp-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.dxp-title{display:grid;gap:3px;flex:1 1 180px}.dxp-title strong{font-size:15px;line-height:1.4}.dxp-eyebrow,.dxp-muted,.dxp-meta,.dxp-snapshot{color:var(--dsw-alias-label-secondary,#62666d);font-size:12px}.dxp-eyebrow{font-weight:500}.dxp-meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px}
.dxp-status{display:inline-flex;align-items:center;max-width:100%;border:1px solid var(--dsw-alias-border-l2,#d8dadd);border-radius:6px;padding:3px 8px;font-size:12px;font-weight:600;line-height:1.4;background:var(--dsw-alias-bg-layer-2,#f4f5f6)}
.dxp-success{color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16734c) 60%,var(--dsw-alias-label-primary,#202124))}.dxp-error,.dxp-check-failed{color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b3293d) 60%,var(--dsw-alias-label-primary,#202124))}.dxp-warning,.dxp-check-inconclusive{color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#865600) 60%,var(--dsw-alias-label-primary,#202124))}
.dxp-roles{display:flex;flex-wrap:wrap;gap:8px 22px;margin:14px 0 8px}.dxp-roles>div{display:flex;gap:7px;align-items:baseline}.dxp-roles dt{color:var(--dsw-alias-label-secondary,#62666d);font-size:12px}.dxp-roles dd{margin:0;font-weight:500}.dxp-counts{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#62666d)}
.dxp-next{padding:10px 12px;border-inline-start:3px solid var(--dsw-alias-border-l2,#d8dadd);background:var(--dsw-alias-bg-layer-2,#f4f5f6);border-radius:0 6px 6px 0}.dxp-evidence,.dxp-reason{margin-top:12px}.dxp-evidence strong,.dxp-reason strong{font-size:12px}.dxp-evidence p,.dxp-reason p{margin:4px 0;white-space:pre-wrap}
.dxp-details{border-top:1px solid var(--dsw-alias-border-l2,#dedfe2);margin-top:10px}.dxp-details>summary{padding:11px 0;cursor:pointer;font-weight:600;list-style-position:inside}.dxp-technical>summary{font-weight:400;color:var(--dsw-alias-label-secondary,#62666d)}.dxp-detail-content{padding:0 0 8px}.dxp-detail-content h4{margin:12px 0 6px;font-size:13px}.dxp-detail-content ol,.dxp-detail-content ul{margin:6px 0;padding-inline-start:22px}.dxp-detail-content li{padding:3px 0}.dxp-item-id{color:var(--dsw-alias-label-secondary,#62666d);margin-inline-end:8px;font-size:12px}.dxp-tag{display:inline-block;border:1px solid var(--dsw-alias-border-l2,#dedfe2);border-radius:4px;font-size:11px;margin-inline-end:7px;padding:0 5px}.dxp-checks{list-style:none;padding:0!important}.dxp-checks li{padding:9px 0}.dxp-check-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px}.dxp-check-state{font-weight:600}.dxp-check-passed{color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16734c) 60%,var(--dsw-alias-label-primary,#202124))}
.dxp-body,.dxp-command{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:inherit;margin:8px 0;max-height:360px;overflow:auto}.dxp-command{font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--dsw-alias-bg-layer-2,#f4f5f6);border-radius:6px;padding:8px 10px;max-height:180px}.dxp-record{display:grid;grid-template-columns:minmax(70px,auto) minmax(0,1fr);gap:8px;margin:8px 0;font-size:12px}.dxp-record dt{color:var(--dsw-alias-label-secondary,#62666d)}.dxp-record dd{margin:0;overflow-wrap:anywhere}.dxp-path{overflow-wrap:anywhere}
.dxp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.dxp-tool button{max-width:100%;color:inherit;font:inherit;border:1px solid var(--dsw-alias-border-l2,#cfd2d6);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);padding:6px 10px;cursor:pointer;white-space:normal;text-align:start}.dxp-tool button:hover{background:var(--dsw-alias-bg-layer-2,#f4f5f6)}.dxp-tool button:focus-visible,.dxp-details>summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:3px}.dxp-path button{margin:6px}.dxp-tool>.dxp-inspect{margin-top:10px}
@media(max-width:420px){.dxp-tool{padding:10px}.dxp-record{grid-template-columns:1fr;gap:3px}.dxp-record dd{margin-bottom:8px}.dxp-roles{gap:6px 14px}}
`
    document.head.appendChild(style)
    return () => style.remove()
  }, 'plan: styles')
  const formatCount = (value: any) => {
    const locale = ctx.locale.getLocale().active
    const tag = locale === 'zh' ? 'zh-CN' : locale
    return new Intl.NumberFormat(Intl.NumberFormat.supportedLocalesOf([tag])[0] ?? 'en', { maximumFractionDigits: 0 }).format(value)
  }
  for (const key of ['dsh_x_plan', 'dsh_x_approve_plan', 'dsh_x_discard_plan', 'dsh_x_review', 'dsh_x_plan_status', 'dsh_x_revise_plan', 'dsh_x_recover_plan']) {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key, locale: NS, inject: () => ({ formatCount }) }, PlanToolRow))
  }
}
