// The settings drawer and the quiet-mode palette. Both live in one sheet so a
// mode change never depends on a second release of the market or chart styles.
//
// Quiet mode works in two layers:
//   1. the shared state tokens are remapped inside the finance subtree, which
//      quiets every text tone, accent, banner and live badge at once;
//   2. the few colours that are not tokens (heatmap tiles, gauge gradients,
//      chart canvases, hot-screen tags) are overridden below.
// The page is never desaturated wholesale: direction stays readable in the
// chart and the heatmap, only the volume of colour is turned down.
export const SETTINGS_CSS = `
.dxs-page{position:relative}
.dxs .dxs-settings-button{color:var(--dxs-muted)}
.dxs .dxs-settings-button svg{flex:none;opacity:.8}
.dxs-set-layer{position:absolute;inset:0;z-index:40;display:flex;justify-content:flex-end;background:color-mix(in srgb,#10141c 34%,transparent)}
.dxs-set-panel{display:flex;flex-direction:column;width:min(432px,100%);height:100%;min-height:0;border-left:1px solid var(--dxs-line);background:var(--dxs-bg);box-shadow:-14px 0 44px rgba(0,0,0,.16);animation:dxs-set-in .16s ease-out}
@keyframes dxs-set-in{from{opacity:.55;transform:translateX(14px)}to{opacity:1;transform:none}}
.dxs-set-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 12px;border-bottom:1px solid var(--dxs-line-soft)}
.dxs-set-head h2{margin:0;font-size:16px;font-weight:650;line-height:1.25}
.dxs-set-head p{margin:5px 0 0;color:var(--dxs-muted);font-size:11px;line-height:1.55}
.dxs .dxs-set-close{flex:none;width:28px;height:28px;padding:0;border-color:transparent;background:transparent;color:var(--dxs-muted);font-size:14px}
.dxs .dxs-set-close:hover:not(:disabled){background:var(--dxs-soft);color:var(--dxs-fg)}
.dxs-set-body{flex:1;min-height:0;overflow:auto;padding:4px 18px 20px}
.dxs-set-section{padding:16px 0;border-bottom:1px solid var(--dxs-line-soft)}
.dxs-set-section:last-child{border-bottom:0}
.dxs-set-section h3{margin:0 0 10px;font-size:11px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--dxs-muted)}
.dxs-set-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:14px}
.dxs-set-copy{min-width:0}
.dxs-set-copy label,.dxs-set-name{display:block;font-size:13px;font-weight:600;line-height:1.35;cursor:pointer}
.dxs-set-copy p,.dxs-set-source p{margin:4px 0 0;color:var(--dxs-muted);font-size:11px;line-height:1.55}
.dxs-set-control{display:flex;align-items:center;justify-content:flex-end;padding-top:2px}
.dxs-set-switch{position:relative;display:inline-flex;flex:none;cursor:pointer}
.dxs-set-switch input{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.dxs-set-switch-track{position:relative;display:block;width:34px;height:19px;border:1px solid var(--dxs-line);border-radius:999px;background:var(--dxs-soft);transition:background .15s ease,border-color .15s ease}
.dxs-set-switch-track span{position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:var(--dxs-muted);transition:transform .15s ease,background .15s ease}
.dxs-set-switch input:checked+.dxs-set-switch-track{border-color:var(--dxs-fg);background:var(--dxs-fg)}
.dxs-set-switch input:checked+.dxs-set-switch-track span{transform:translateX(15px);background:var(--dxs-bg)}
.dxs-set-switch input:focus-visible+.dxs-set-switch-track{outline:2px solid var(--dxs-accent);outline-offset:2px}
.dxs-set-switch input:disabled+.dxs-set-switch-track{opacity:.45}
.dxs-set-switch:has(input:disabled){cursor:not-allowed}
.dxs-set-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:9px 0 0;color:var(--dxs-muted);font-size:11px}
.dxs-set-badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border:1px solid var(--dxs-line);border-radius:999px;background:var(--dxs-soft);font-size:10px;white-space:nowrap}
.dxs-set-keys{display:inline-flex;align-items:center;gap:3px}
.dxs-set-keys kbd{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:19px;padding:0 5px;border:1px solid var(--dxs-line);border-bottom-width:2px;border-radius:4px;background:var(--dxs-soft);color:var(--dxs-muted);font:inherit;font-size:10px;line-height:1}
.dxs-set-status{margin:8px 0 0;padding:7px 9px;border-left:2px solid var(--dxs-line);border-radius:0 6px 6px 0;background:var(--dxs-soft);color:var(--dxs-muted);font-size:11px;line-height:1.5}
.dxs-set-source{display:grid;gap:2px}
.dxs-set-source-control{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}
.dxs-set-state{color:var(--dxs-muted);font-size:11px}
.dxs-set-note{margin:8px 0 0;color:var(--dxs-muted);font-size:11px;line-height:1.5}
.dxs-set-error{margin:8px 0 0;color:var(--dxs-up);font-size:11px;font-weight:600;line-height:1.5}
.dxs-set-shortcuts{display:grid;gap:7px}
.dxs-set-shortcut{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:26px;font-size:12px}
.dxs-set-foot{flex:none;display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--dxs-line-soft);background:var(--dxs-bg)}
.dxs .dxs-set-foot .dxs-primary{min-width:88px}

/* ── Quiet mode ─────────────────────────────────────────────────────────── */
.dxs.dxs-discreet{
  --dxs-up:color-mix(in srgb,var(--dxs-fg) 58%,#b07a82);
  --dxs-down:color-mix(in srgb,var(--dxs-fg) 58%,#6f8f7f);
  --dxs-accent:color-mix(in srgb,var(--dxs-fg) 58%,#6b7280);
  --dsw-alias-state-error-primary:var(--dxs-up);
  --dsw-alias-state-success-primary:var(--dxs-down);
  --dsw-alias-brand-primary:var(--dxs-accent);
  --dsw-alias-state-warn-primary:color-mix(in srgb,var(--dxs-fg) 58%,#9a8a6a);
}
.dxs.dxs-discreet .dxs-mkt-gauge-track{background:linear-gradient(90deg,var(--dxs-down) 0%,#8b9299 46%,#91888c 54%,var(--dxs-up) 100%)}
.dxs.dxs-discreet .dxs-mkt-range-track{background:linear-gradient(90deg,var(--dxs-down),#8b9299,var(--dxs-up))}
.dxs.dxs-discreet .dxs-mkt-status.is-live{border-color:var(--dxs-line);background:var(--dxs-soft)}
.dxs.dxs-discreet .dxs-mkt-status.is-live .dxs-mkt-dot{background:var(--dxs-muted);box-shadow:none}
.dxs.dxs-discreet .dxs-mkt-tile,.dxs.dxs-discreet .dxs-mkt-group-label{text-shadow:none}
.dxs.dxs-discreet .dxs-hot-tag[data-category=capital]{border-color:var(--dxs-line);color:var(--dxs-muted)}
.dxs.dxs-discreet .dxs-chart-canvas,.dxs.dxs-discreet .dxs-intraday-canvas{filter:saturate(.32) contrast(.97)}
.dxs.dxs-discreet .dxs-chart-swatch,.dxs.dxs-discreet .dxs-intraday-legend i{filter:saturate(.32)}
.dxs.dxs-discreet .dxs-chart-watermark{opacity:.18}
.dxs.dxs-discreet .dxs-bar{backdrop-filter:none;-webkit-backdrop-filter:none}

@media(max-width:820px){
.dxs .dxs-settings-button{width:28px;padding:0}
.dxs-settings-button-label{display:none}
}
@media(max-width:560px){
.dxs-set-panel{width:100%;border-left:0}
.dxs-set-row{grid-template-columns:1fr;gap:8px}
.dxs-set-control{justify-content:flex-start;padding-top:0}
}
@media(prefers-reduced-motion:reduce){
.dxs-set-panel{animation:none}
.dxs-set-switch-track,.dxs-set-switch-track span{transition:none}
}
`
