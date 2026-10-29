export const WATCH_SIGNALS_CSS = `
.dxs-signal{margin:0 0 16px;padding:16px;border:1px solid var(--dxs-line);border-radius:10px;background:var(--dxs-bg)}
.dxs-signal-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.dxs-signal-head h2{margin:0;font-size:16px}.dxs-signal-head p{margin:3px 0 0;color:var(--dxs-muted)}
.dxs-signal-progress,.dxs-signal-meta{font-size:12px;color:var(--dxs-muted)}
.dxs-signal-list{list-style:none;margin:10px 0;padding:0;display:grid;gap:8px}
.dxs-signal-row{padding:10px 12px;border:1px solid var(--dxs-line-soft);border-radius:8px;background:var(--dxs-soft)}
.dxs-signal-row-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dxs .dxs-signal-name{height:auto;padding:0;border:0;background:transparent;text-align:left;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;white-space:normal}
.dxs-signal-name small{color:var(--dxs-muted)}
.dxs-signal-status{font-size:12px;font-weight:650;text-align:right;color:var(--dxs-muted)}
.dxs-signal-status[data-status=buy]{color:var(--dsw-alias-state-error-primary,var(--dxs-fg))}
.dxs-signal-status[data-status=sell]{color:var(--dsw-alias-state-warn-primary,var(--dxs-fg))}
.dxs-signal-row p{margin:4px 0 0}.dxs-signal-warning{color:var(--dsw-alias-state-warn-primary,var(--dxs-fg))}
.dxs-signal-reason{line-height:1.6}.dxs-signal-method{margin-top:10px;color:var(--dxs-muted);font-size:12px}
.dxs-signal-method p{line-height:1.6}
.dxs-schedule{margin-top:14px;padding-top:12px;border-top:1px solid var(--dxs-line-soft);font-size:12px}
.dxs-schedule h3{margin:0;font-size:14px}.dxs-schedule p{line-height:1.6;color:var(--dxs-muted)}
.dxs-schedule-actions{display:flex;gap:8px;flex-wrap:wrap}.dxs-schedule-results{margin-top:10px}
`
