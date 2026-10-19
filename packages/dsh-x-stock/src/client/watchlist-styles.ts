/** Watchlist desk. Later than the base sheet so it can quiet the old form layout. */
export const WATCHLIST_CSS = `
.dxs-page{background:var(--dxs-soft)}
.dxs-body{display:flex;flex-direction:column;padding:0}
.dxs-titlebar{background:var(--dxs-bg)}
.dxs .dxs-header-actions button{border-color:transparent;background:transparent;color:var(--dxs-muted)}
.dxs .dxs-header-actions button:hover:not(:disabled){background:var(--dxs-soft);color:var(--dxs-fg)}
.dxs-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;margin:0;padding:10px 16px;border-radius:0;background:var(--dxs-bg);border-bottom:1px solid var(--dxs-line-soft)}
.dxs-banner.is-warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#a15c00) 8%,var(--dxs-bg))}
.dxs-banner strong{font-size:13px}
.dxs-banner p{margin:2px 0 0}
.dxs-banner .dxs-source-enable{flex:none}
.dxs-layout{flex:1;min-height:0;grid-template-columns:minmax(268px,320px) minmax(0,1fr);gap:0;margin:0;align-items:stretch}
.dxs-layout>aside.dxs-rail{max-height:none;overflow:hidden}
.dxs-rail{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--dxs-bg);border-right:1px solid var(--dxs-line-soft)}
.dxs-rail-head{flex:none;padding:14px 14px 6px}
.dxs-rail-head h2{margin:0;font-size:14px;font-weight:650}
.dxs-counts{margin:2px 0 0;color:var(--dxs-muted);font-size:12px;font-variant-numeric:tabular-nums}
.dxs-rail-list{flex:1;min-height:0;overflow:auto;padding:4px 8px 8px}
.dxs-list{margin:0}
.dxs-list li{position:relative;margin:1px 0;border-radius:8px}
.dxs-list li.is-selected{background:color-mix(in srgb,var(--dxs-accent) 10%,var(--dxs-bg))}
.dxs-list li.is-selected::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:2px;background:var(--dxs-accent)}
.dxs .dxs-list .dxs-select{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:1px;width:100%;height:auto;min-height:46px;margin:0;padding:7px 10px 7px 12px;border:0;border-radius:8px;background:transparent;box-shadow:none;text-align:left;white-space:normal;line-height:1.25}
.dxs .dxs-list .dxs-select:hover:not(:disabled){background:transparent}
.dxs .dxs-list li:hover:not(.is-selected){background:color-mix(in srgb,var(--dxs-fg) 4%,var(--dxs-bg))}
.dxs-row-name{display:flex;align-items:center;gap:6px;min-width:0;max-width:100%}
.dxs-row-name strong{font-size:13px;font-weight:640;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-row-meta{display:flex;align-items:center;gap:6px;min-height:16px;font-size:11px;font-variant-numeric:tabular-nums}
.dxs-row-meta:empty{display:none}
.dxs-fixed-mark{display:inline-flex;align-items:center;height:16px;margin:0;padding:0 5px;border-radius:999px;background:color-mix(in srgb,var(--dxs-accent) 12%,var(--dxs-bg));color:var(--dxs-accent);font-size:10px;font-weight:650;line-height:1}
.dxs .dxs-list .dxs-controls{position:absolute;right:4px;top:50%;transform:translateY(-50%);display:flex;gap:1px;margin:0;padding:2px;border-radius:8px;background:color-mix(in srgb,var(--dxs-bg) 92%,transparent);opacity:0;pointer-events:none}
.dxs .dxs-list li:hover .dxs-controls,.dxs .dxs-list li:focus-within .dxs-controls,.dxs .dxs-list li.is-selected .dxs-controls{opacity:1;pointer-events:auto}
.dxs .dxs-list li:hover .dxs-select,.dxs .dxs-list li:focus-within .dxs-select,.dxs .dxs-list li.is-selected .dxs-select{padding-right:132px}
.dxs .dxs-list .dxs-controls button{height:24px;padding:0 6px;border-color:transparent;background:transparent;color:var(--dxs-muted);font-size:11px;border-radius:6px}
.dxs .dxs-list .dxs-controls .dxs-icon-button{width:24px;padding:0}
.dxs .dxs-list .dxs-controls button:hover:not(:disabled){background:var(--dxs-soft);color:var(--dxs-fg)}
.dxs .dxs-list .dxs-controls button[aria-pressed=true]{border-color:transparent;color:var(--dxs-accent);background:color-mix(in srgb,var(--dxs-accent) 12%,var(--dxs-bg))}
.dxs .dxs-list .dxs-remove:hover:not(:disabled){color:var(--dxs-up);background:color-mix(in srgb,var(--dxs-up) 10%,var(--dxs-bg))}
.dxs-empty{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:8px 6px 12px;padding:14px 12px;border:1px dashed var(--dxs-line);border-radius:10px;background:color-mix(in srgb,var(--dxs-soft) 65%,var(--dxs-bg))}
.dxs-empty p{margin:0}
.dxs .dxs-empty button{border-color:transparent;background:transparent;color:var(--dxs-accent);padding:0;height:auto}
.dxs-rail-foot{flex:none;border-top:1px solid var(--dxs-line-soft);padding:10px 12px 12px;background:var(--dxs-bg)}
.dxs-bar-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}
.dxs-shortcut{display:inline-flex;align-items:center;gap:3px}
.dxs-shortcut kbd{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:18px;margin:0;padding:0 4px;border:1px solid var(--dxs-line);border-bottom-width:2px;border-radius:4px;background:var(--dxs-soft);color:var(--dxs-muted);font:inherit;font-size:10px;line-height:1}
.dxs .dxs-bar-toggle button{height:24px;padding:0 2px;border:0;background:transparent;color:var(--dxs-muted)}
.dxs .dxs-bar-toggle button:hover:not(:disabled){color:var(--dxs-fg);background:transparent}
.dxs-form{margin-top:0;gap:8px}
.dxs-form h2{margin:0;font-size:11px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--dxs-muted)}
.dxs-form-grid{display:grid;grid-template-columns:minmax(96px,112px) minmax(0,1fr);gap:8px}
.dxs-field{display:grid;gap:4px;min-width:0;font-size:11px;color:var(--dxs-muted)}
.dxs-form-submit{display:flex;flex-direction:column;gap:8px}
.dxs .dxs-form-submit .dxs-primary{width:100%}
.dxs-picked{margin:0;padding:6px 8px;border-radius:8px;background:color-mix(in srgb,var(--dxs-accent) 8%,var(--dxs-bg));color:var(--dxs-fg);font-size:12px}
.dxs-search{gap:4px}
.dxs-search-note{margin:0;font-size:11px;line-height:1.45}
.dxs-rail-foot .dxs-search{position:relative}
.dxs-rail-foot .dxs-search-results{position:absolute;z-index:5;left:0;right:0;bottom:calc(100% + 4px);margin:0;border-color:var(--dxs-line);background:var(--dxs-bg);box-shadow:0 10px 28px color-mix(in srgb,var(--dxs-fg) 14%,transparent)}
.dxs-fineprint{font-size:11px;color:var(--dxs-muted)}
.dxs-fineprint summary{cursor:pointer;width:fit-content}
.dxs-fineprint p{margin:6px 0 0;line-height:1.45}
.dxs-stage{min-width:0;min-height:0;overflow:auto;padding:18px 22px 36px;background:var(--dxs-soft)}
.dxs-stage-market{padding-top:14px}
.dxs-stage-hint{margin:8px 0 0}
.dxs-stage-empty{display:flex;flex-direction:column;gap:8px}
.dxs-stage-empty h2{margin:0;font-size:18px}
.dxs-instrument-summary{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px 20px;margin:0 0 8px;padding:2px 2px 12px;border:0;border-radius:0;background:transparent}
.dxs-quote-identity{min-width:0}
.dxs-instrument-summary h2{font-size:22px;font-weight:650;line-height:1.2;letter-spacing:-.01em}
.dxs-symbol-line{display:flex;flex-wrap:wrap;align-items:center;gap:0;margin:4px 0 0;color:var(--dxs-muted);font-size:12px}
.dxs-symbol{font-variant-numeric:tabular-nums;letter-spacing:.02em}
.dxs-quote-figures{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.dxs-instrument-summary .dxs-price{margin:0;font-size:34px;font-weight:650;line-height:1;letter-spacing:-.02em}
.dxs-quote-figures .dxs-change{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;font-size:13px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1}
.dxs-quote-figures .dxs-change.dxs-up{background:color-mix(in srgb,var(--dxs-up) 12%,transparent)}
.dxs-quote-figures .dxs-change.dxs-down{background:color-mix(in srgb,var(--dxs-down) 12%,transparent)}
.dxs-quote-figures .dxs-change:not(.dxs-up):not(.dxs-down){background:var(--dxs-bg);color:var(--dxs-muted)}
.dxs-status-line{margin:0;text-align:right}
.dxs-quote-metadata{grid-column:1/-1}
.dxs-secondary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}
.dxs-secondary .dxs-section{margin:0;padding:10px 12px;border-color:var(--dxs-line-soft);background:var(--dxs-bg)}
.dxs-secondary summary{cursor:pointer;font-weight:600}
.dxs-workbench{margin:8px 0 0;padding:12px 12px 4px;border:1px solid var(--dxs-line-soft);border-radius:12px;background:var(--dxs-bg)}
.dxs-workbench>header{margin-bottom:8px}
.dxs-workbench>header h2{font-size:13px}
.dxs-data-actions{gap:6px}
.dxs-data-banner{border-radius:8px;background:color-mix(in srgb,var(--dxs-accent) 6%,var(--dxs-bg))}
.dxs-chart-empty{margin:10px 0;padding:28px 16px;background:color-mix(in srgb,var(--dxs-soft) 70%,var(--dxs-bg))}
.dxs-chip{height:30px;padding:0 10px;border-color:transparent;border-radius:999px;background:var(--dxs-soft);font-variant-numeric:tabular-nums}
.dxs-chip strong{font-weight:620}
.dxs-bar{min-height:44px;padding:6px 12px;background:var(--dxs-bg)}
@media (hover:none){
.dxs .dxs-list .dxs-controls{position:static;transform:none;opacity:1;pointer-events:auto;background:transparent;margin-top:0;padding:0 8px 6px}
.dxs .dxs-list li .dxs-select{padding-right:12px}
}
@media (max-width:760px){
.dxs-layout,.dxs-layout>aside.dxs-rail{grid-template-columns:1fr}
.dxs-layout>aside.dxs-rail{max-height:48vh;border-right:0;border-bottom:1px solid var(--dxs-line-soft)}
.dxs-stage{padding:14px 12px 28px}
.dxs-instrument-summary{grid-template-columns:1fr}
.dxs-quote-figures{align-items:flex-start}
.dxs-status-line{text-align:left}
.dxs-secondary{grid-template-columns:1fr}
.dxs-instrument-summary .dxs-price{font-size:28px}
}
`
