export const MARKET_CSS = `
.dxs-view-tabs{display:flex;align-items:center;gap:2px;height:28px;padding:2px;border:1px solid var(--dsw-alias-border-l1,#eceef1);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);flex:none}
.dxs .dxs-view-tabs button{height:24px;border:0;border-radius:6px;background:transparent;padding:0 10px;font-size:12px;color:var(--dsw-alias-label-secondary,#717885);line-height:1;white-space:nowrap;box-shadow:none}
.dxs .dxs-view-tabs button:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary,#202124) 7%,transparent)}
.dxs .dxs-view-tabs button[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#202124);font-weight:600;box-shadow:0 1px 2px #00000014}
.dxs-mkt{display:flex;flex-direction:column;gap:12px;min-width:0;padding:2px 0 24px;color:var(--dsw-alias-label-primary,#202124)}
.dxs-mkt *{box-sizing:border-box}
.dxs-mkt button{font:inherit}
.dxs-mkt-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;min-height:36px;margin:0 0 12px;padding:0}
.dxs-mkt-head>div:first-child{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.dxs-mkt-eyebrow{display:none}
.dxs-mkt-head h2{font-size:13px;font-weight:600;line-height:1.3;margin:0}
.dxs-mkt-head p{margin:0;color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.dxs-mkt-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.dxs-mkt-updated{font-size:10px;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap}
.dxs-mkt-status{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);padding:3px 9px;font-size:10px;line-height:1.6;white-space:nowrap}
.dxs-mkt-status strong{font-size:11px}
.dxs-mkt-status.is-live{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 8%,var(--dsw-alias-bg-layer-1,#fff))}
.dxs-mkt-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-secondary,#888);flex:none}
.dxs-mkt-status.is-live .dxs-mkt-dot,.dxs-mkt-dot.is-live{background:var(--dsw-alias-state-error-primary,#bc2737);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 18%,transparent)}
.dxs-mkt-warn{color:var(--dsw-alias-state-warn-primary,#a15c00);font-weight:600}
.dxs-mkt-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.dxs-mkt-kpi{position:relative;min-width:0;min-height:84px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);padding:9px 11px;overflow:hidden}
.dxs-mkt-kpi-label{font-size:9px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt-kpi-value{font-size:20px;font-weight:680;line-height:1.32;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt-kpi-note{font-size:10px;line-height:1.4;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt-kpi-status .dxs-mkt-status{margin-top:5px;max-width:100%;overflow:hidden}
.dxs-mkt-kpi-status .dxs-mkt-kpi-note{white-space:normal}
.dxs-mkt-slash{margin:0 4px;color:var(--dsw-alias-label-secondary,#888)}
.dxs-mkt-card{min-width:0;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);padding:12px 14px}
.dxs-mkt-card h3{font-size:14px;line-height:1.3;margin:0}
.dxs-mkt-card p{margin:3px 0;color:var(--dsw-alias-label-secondary,#666);font-size:11px}
.dxs-mkt-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:9px}
.dxs-mkt-muted{color:var(--dsw-alias-label-secondary,#666);font-size:10px;line-height:1.5}
.dxs-mkt-note{margin:8px 0;padding:7px 10px;border-left:3px solid var(--dsw-alias-brand-primary,#4169e1);border-radius:0 7px 7px 0;background:var(--dsw-alias-bg-layer-2,#f4f4f5);font-size:11px;line-height:1.5}
.dxs-mkt-error{color:var(--dsw-alias-state-error-primary,#bc2737)}
.dxs-up{color:var(--dsw-alias-state-error-primary,#bc2737)}
.dxs-down{color:var(--dsw-alias-state-success-primary,#16784e)}
.dxs-mkt-change{font-variant-numeric:tabular-nums;font-weight:650;white-space:nowrap}
.dxs-mkt-sentiment-score{display:flex;flex-direction:column;align-items:flex-end;line-height:1.1}
.dxs-mkt-sentiment-score strong{font-size:34px;font-variant-numeric:tabular-nums}
.dxs-mkt-sentiment-score span{font-size:12px;font-weight:600}
.dxs-mkt-gauge{margin:4px 0 8px}
.dxs-mkt-gauge-track{position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,#16784e 0%,#6b7c74 46%,#9a6a60 54%,#bc2737 100%)}
.dxs-mkt-gauge-track span{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-layer-1,#fff);border:3px solid var(--dsw-alias-label-primary,#202124);transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.3)}
.dxs-mkt-gauge-labels{display:flex;justify-content:space-between;margin-top:4px;color:var(--dsw-alias-label-secondary,#666);font-size:9px}
.dxs-mkt-factors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px;margin-top:8px}
.dxs-mkt-factor{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;align-items:center;font-size:11px}
.dxs-mkt-factor>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-mkt-factor strong{font-size:13px;font-variant-numeric:tabular-nums}
.dxs-mkt-factor-weight{font-size:10px;color:var(--dsw-alias-label-secondary,#666)}
.dxs-mkt-factor-bar{grid-column:1/-1;height:4px;border-radius:2px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);overflow:hidden}
.dxs-mkt-factor-bar i{display:block;height:100%;border-radius:2px}
.dxs-mkt-factor-bar i.is-up{background:var(--dsw-alias-state-error-primary,#bc2737)}
.dxs-mkt-factor-bar i.is-down{background:var(--dsw-alias-state-success-primary,#16784e)}
.dxs-mkt-index-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.dxs-mkt-index{min-width:0;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:9px;background:var(--dsw-alias-bg-layer-2,#f7f7f8);padding:9px 10px}
.dxs-mkt-index header{display:flex;justify-content:space-between;align-items:flex-start;gap:5px}
.dxs-mkt-index h4{font-size:11px;line-height:1.3;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-mkt-index header span{font-size:9px;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap}
.dxs-mkt-index-price{font-size:21px;font-weight:680;line-height:1.2;font-variant-numeric:tabular-nums;margin-top:5px}
.dxs-mkt-index-sub{display:flex;justify-content:space-between;gap:5px;font-size:10px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums}
.dxs-mkt-range{margin-top:7px}
.dxs-mkt-range-track{position:relative;height:5px;border-radius:3px;background:linear-gradient(90deg,var(--dsw-alias-state-success-primary,#16784e),#8a928c,var(--dsw-alias-state-error-primary,#bc2737));opacity:.85}
.dxs-mkt-range-track span{position:absolute;top:50%;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-primary,#202124);transform:translate(-50%,-50%);border:1px solid var(--dsw-alias-bg-layer-1,#fff)}
.dxs-mkt-range-labels{display:flex;justify-content:space-between;color:var(--dsw-alias-label-secondary,#666);font-size:8px;margin-top:3px;font-variant-numeric:tabular-nums}
.dxs-mkt-ohlc{display:flex;justify-content:space-between;gap:6px;margin:6px 0 0;font-size:9px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums}
.dxs-mkt-ohlc div{display:flex;gap:2px;min-width:0}
.dxs-mkt-ohlc dt,.dxs-mkt-ohlc dd{margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt-index footer{display:flex;justify-content:space-between;gap:6px;font-size:8px;color:var(--dsw-alias-label-secondary,#666);margin-top:5px;min-width:0}
.dxs-mkt-index footer>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-mkt-index-open{flex:none;color:var(--dsw-alias-brand-primary,#4169e1);white-space:nowrap}
.dxs-mkt-index.is-clickable{cursor:pointer;transition:border-color .15s,box-shadow .15s}
.dxs-mkt-index-chart-actions{display:flex;align-items:center;gap:6px;flex:none}
.dxs-mkt-index.is-clickable:hover{border-color:var(--dsw-alias-brand-primary,#4169e1);box-shadow:0 2px 8px rgba(0,0,0,.08)}
.dxs-mkt-index.is-clickable:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:2px}
.dxs-mkt-legend{display:flex;align-items:center;gap:3px;color:var(--dsw-alias-label-secondary,#666);font-size:9px;white-space:nowrap}
.dxs-mkt-legend i{display:block;width:14px;height:8px;border-radius:2px}
.dxs-mkt-map{position:relative;width:100%;height:clamp(340px,42vw,560px);border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#f4f4f5)}
.dxs-mkt-group-box{position:absolute;z-index:0;border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#202124) 22%,transparent);border-radius:3px;pointer-events:none}
.dxs-mkt-group-box.is-selected{border-color:var(--dsw-alias-brand-primary,#4169e1);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary,#4169e1)}
.dxs .dxs-mkt-group-label{position:absolute;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:4px;margin:0;border:0;border-radius:3px 3px 0 0;padding:1px 5px;color:#fff;text-align:left;font-size:10px;line-height:1.5;overflow:hidden;white-space:nowrap;cursor:pointer}
.dxs .dxs-mkt-group-label span:first-child{font-weight:650;overflow:hidden;text-overflow:ellipsis}
.dxs .dxs-mkt-group-label span:last-child{font-variant-numeric:tabular-nums;opacity:.92}
.dxs .dxs-mkt-group-label:disabled{cursor:default}
.dxs .dxs-mkt-tile{position:absolute;z-index:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:0;margin:0;border:1px solid rgba(255,255,255,.14);border-radius:2px;padding:2px 4px;color:#fff;text-align:left;line-height:1.12;overflow:hidden;cursor:pointer;text-shadow:0 1px 2px rgba(0,0,0,.32);transition:filter .12s ease}
.dxs .dxs-mkt-tile:hover{filter:brightness(1.14);z-index:3}
.dxs .dxs-mkt-tile:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:1px;z-index:4}
.dxs .dxs-mkt-tile.is-selected{outline:2px solid #fff;outline-offset:-2px;z-index:3}
.dxs-mkt-tile-name{display:block;max-width:100%;font-size:10px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-mkt-tile-pct{display:block;font-size:11px;font-variant-numeric:tabular-nums;opacity:.94}
.dxs-mkt-tile-leader{display:block;max-width:100%;font-size:8px;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs .dxs-mkt-tile.size-xs{padding:1px 2px}
.dxs .dxs-mkt-tile.size-xs .dxs-mkt-tile-name{font-size:7px;font-weight:500}
.dxs .dxs-mkt-tile.size-sm .dxs-mkt-tile-name{font-size:8px}
.dxs .dxs-mkt-tile.size-md .dxs-mkt-tile-name{font-size:9px}
.dxs .dxs-mkt-tile.size-lg .dxs-mkt-tile-name{font-size:11px}
.dxs .dxs-mkt-tile.size-lg .dxs-mkt-tile-pct{font-size:13px}
.dxs .dxs-mkt-tile.size-xl{justify-content:center;align-items:center;text-align:center;padding:8px}
.dxs .dxs-mkt-tile.size-xl .dxs-mkt-tile-name{font-size:15px;font-weight:700;white-space:normal;line-height:1.2}
.dxs .dxs-mkt-tile.size-xl .dxs-mkt-tile-pct{font-size:20px}
.dxs .dxs-mkt-tile.size-xl .dxs-mkt-tile-leader{font-size:10px;white-space:normal}
.dxs-mkt-tile-amount{display:block;font-size:9px;opacity:.8;font-variant-numeric:tabular-nums}
.dxs-mkt-table-details{margin-top:7px}
.dxs-mkt-table-details summary,.dxs-mkt-footer summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#666);font-size:10px}
.dxs-mkt-table-wrap{max-width:100%;overflow:auto;margin-top:6px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px}
.dxs-mkt table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}
.dxs-mkt caption{text-align:left;padding:6px 8px;color:var(--dsw-alias-label-secondary,#666);font-size:10px}
.dxs-mkt th{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-2,#f4f4f5);padding:5px 8px;text-align:left;color:var(--dsw-alias-label-secondary,#666);font-size:9px;font-weight:650;white-space:nowrap}
.dxs-mkt td{padding:4px 8px;border-top:1px solid var(--dsw-alias-border-l2,#eee);white-space:nowrap}
.dxs-mkt td>span{display:block;max-width:180px;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt td>small{display:block;color:var(--dsw-alias-label-secondary,#888);font-size:9px}
.dxs-mkt tbody tr:hover td{background:var(--dsw-alias-bg-layer-2,#f7f7f8)}
.dxs-mkt tbody tr.is-selected td{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4169e1) 10%,transparent)}
.dxs-mkt-breadth-totals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:4px 0 8px}
.dxs-mkt-breadth-totals div{display:flex;flex-direction:column;min-width:0}
.dxs-mkt-breadth-totals strong{font-size:18px;line-height:1.2;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt-breadth-totals span{font-size:9px;color:var(--dsw-alias-label-secondary,#666)}
.dxs-mkt-stack{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#eee);margin:4px 0 12px}
.dxs-mkt-stack span{display:block;height:100%}
.dxs-mkt-stack .is-up,.dxs-mkt-bucket.is-up i{background:var(--dsw-alias-state-error-primary,#bc2737)}
.dxs-mkt-stack .is-down,.dxs-mkt-bucket.is-down i{background:var(--dsw-alias-state-success-primary,#16784e)}
.dxs-mkt-stack .is-flat,.dxs-mkt-bucket.is-flat i{background:#6b7280}
.dxs-mkt-distribution{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:4px;height:108px;align-items:end}
.dxs-mkt-bucket{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:3px;min-width:0}
.dxs-mkt-bucket-count{font-size:8px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums;min-height:11px;white-space:nowrap}
.dxs-mkt-bucket i{display:block;width:100%;min-height:2px;border-radius:2px 2px 0 0}
.dxs-mkt-bucket-labels{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:4px;text-align:center;font-size:8px;margin-top:3px}
.dxs-mkt-movers-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.dxs-mkt-movers-grid .dxs-mkt-card{padding:10px 12px}
.dxs-mkt-detail{border-color:var(--dsw-alias-brand-primary,#4169e1)}
.dxs-mkt-detail-stats{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,#202124)!important;font-variant-numeric:tabular-nums}
.dxs-mkt-stock-map{position:relative;width:100%;height:280px;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#f4f4f5);margin:6px 0}
.dxs-mkt-selected-stock{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
.dxs-mkt-detail-table{max-height:360px;margin-top:8px}
.dxs-mkt-detail-table tbody tr{cursor:pointer;outline-offset:-2px}
.dxs-mkt-detail-table tbody tr:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1)}
.dxs-mkt-setup{max-width:760px;padding:18px}
.dxs-mkt-setup h3{font-size:17px;margin-bottom:6px}
.dxs-mkt-setup p{font-size:12px;line-height:1.6}
.dxs-mkt-setup pre{margin:10px 0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);font-size:11px;line-height:1.5;overflow:auto}
.dxs-mkt-loading{display:flex;align-items:center;gap:8px;min-height:54px;color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.dxs-mkt-footer{display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--dsw-alias-border-l2,#ddd);padding-top:8px;color:var(--dsw-alias-label-secondary,#666);font-size:10px}
.dxs-mkt-footer p{margin:3px 0;line-height:1.5}
/*
 * The switch must read as on/off in both themes. It cannot use the host accent
 * against a fixed white knob: in a dark theme the brand-primary token can
 * resolve to near-white, and the on state then becomes a blank white pill. The
 * track takes the foreground and the knob takes the page background instead, so
 * the two never collapse into one colour no matter what the theme does.
 */
.dxs-mkt-source-switch{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--dxs-muted,#666);cursor:pointer;user-select:none;white-space:nowrap}
.dxs-mkt-source-switch:hover .dxs-mkt-switch-track{border-color:var(--dxs-muted,#888)}
.dxs-mkt-source-switch input{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.dxs-mkt-switch-track{position:relative;display:block;width:28px;height:16px;flex:none;border-radius:999px;border:1px solid var(--dxs-line,#bbb);background:var(--dxs-soft,#eee);transition:background .15s ease,border-color .15s ease}
.dxs-mkt-switch-track span{position:absolute;top:1px;left:1px;width:12px;height:12px;border-radius:50%;background:var(--dxs-muted,#888);transition:transform .15s ease,background .15s ease}
.dxs-mkt-source-switch input:checked+.dxs-mkt-switch-track{background:var(--dxs-fg,#20252e);border-color:var(--dxs-fg,#20252e)}
.dxs-mkt-source-switch input:checked+.dxs-mkt-switch-track span{transform:translateX(12px);background:var(--dxs-bg,#fff)}
.dxs-mkt-source-switch input:focus-visible+.dxs-mkt-switch-track{outline:2px solid var(--dxs-accent,#4169e1);outline-offset:2px}
.dxs-mkt-source-switch input:disabled+.dxs-mkt-switch-track{opacity:.45}
.dxs-mkt-source-switch input:disabled~.dxs-mkt-switch-label{opacity:.55}
.dxs-mkt-source-switch.is-large{font-size:13px;gap:9px;color:var(--dxs-fg,#202124)}
.dxs-mkt-source-switch.is-large .dxs-mkt-switch-track{width:40px;height:22px}
.dxs-mkt-source-switch.is-large .dxs-mkt-switch-track span{width:18px;height:18px}
.dxs-mkt-source-switch.is-large input:checked+.dxs-mkt-switch-track span{transform:translateX(18px)}
.dxs-mkt-setup-switch{display:flex;align-items:center;gap:12px;margin:16px 0 4px;flex-wrap:wrap}
.dxs-mkt-manual-config{margin:10px 0}
.dxs-mkt-manual-config summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#666);font-size:10px}
.dxs-mkt-manual-config pre{margin:8px 0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);font-size:11px;line-height:1.5;overflow:auto}
.dxs-tail{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4169e1) 28%,var(--dsw-alias-border-l2,#ddd))}
.dxs-tail-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.dxs-tail-run{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-brand-primary,#4169e1);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-brand-primary,#4169e1);font-size:12px;white-space:nowrap}
.dxs-tail-run:hover:not(:disabled){background:var(--dsw-alias-brand-primary,#4169e1);color:#fff}
.dxs-tail-run:disabled{opacity:.6;cursor:wait}
.dxs-tail-loading{display:flex;align-items:center;gap:8px;min-height:34px;color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.dxs-tail-summary{display:flex;flex-wrap:wrap;gap:4px 16px;margin:2px 0 8px;color:var(--dsw-alias-label-secondary,#666);font-size:10px;font-variant-numeric:tabular-nums}
.dxs-tail-controls{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:6px 0}
.dxs-tail-controls label{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-primary,#202124);cursor:pointer}
.dxs-tail-controls input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary,#4169e1)}
.dxs-tail-table{max-height:420px}
.dxs-tail-table td{vertical-align:top}
.dxs-tail-table tbody tr.is-consecutive td{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 6%,transparent)}
.dxs-tail-badges{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px}
.dxs-tail-badge{display:inline-flex;align-items:center;height:16px;padding:0 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);color:var(--dsw-alias-label-secondary,#666);font-size:9px;line-height:1;white-space:nowrap}
.dxs-tail-badge.is-consecutive{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 12%,transparent);color:var(--dsw-alias-state-error-primary,#bc2737);font-weight:650}
.dxs-tail-method{margin-top:8px}
.dxs-tail-method summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#666);font-size:10px}
.dxs-tail-method p{max-width:980px}
@media(max-width:1180px){
.dxs-mkt-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
.dxs-mkt-index-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.dxs-mkt-movers-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:820px){
.dxs-mkt-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
.dxs-mkt-index-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.dxs-mkt-factors{grid-template-columns:1fr}
.dxs-mkt-movers-grid{grid-template-columns:1fr}
.dxs-mkt-map{height:420px}
.dxs-mkt-head{flex-direction:column}
.dxs-mkt-head-actions{justify-content:flex-start}
}
@media(max-width:540px){
.dxs-mkt-kpis,.dxs-mkt-index-grid{grid-template-columns:1fr}
.dxs-mkt-card{padding:10px}
.dxs-mkt-map{height:360px}
.dxs-mkt-distribution{height:88px}
.dxs-mkt-bucket-labels{font-size:6px}
.dxs-mkt-breadth-totals{grid-template-columns:repeat(2,minmax(0,1fr))}
.dxs-mkt-index-price{font-size:19px}
.dxs-mkt-sentiment-score strong{font-size:28px}
}
@media(prefers-reduced-motion:reduce){
.dxs .dxs-mkt-tile{transition:none}
}

.dxs .dxs-mkt-link{display:inline-flex;flex-direction:column;align-items:flex-start;gap:0;height:auto;margin:0;padding:0;border:0;background:none;text-align:left;color:inherit;cursor:pointer;min-width:0}
.dxs-mkt-link:hover h4,.dxs-mkt-link:hover span{text-decoration:underline}
.dxs-mkt-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:2px;border-radius:4px}
.dxs-mkt-index header .dxs-mkt-link h4{font-size:11px;line-height:1.3;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-mkt-index header .dxs-mkt-link span{font-size:9px;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap}
.dxs-mkt tbody tr.is-drillable{cursor:pointer}
.dxs .dxs-mkt-drill{height:28px;padding:0 10px;font-size:12px;border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);white-space:nowrap}
.dxs-mkt-drill:hover{border-color:var(--dsw-alias-brand-primary,#4169e1);color:var(--dsw-alias-brand-primary,#4169e1)}
.dxs .dxs-mkt-open-stock{height:28px;margin-left:10px;padding:0 10px;font-size:12px;border:1px solid var(--dsw-alias-brand-primary,#4169e1);border-radius:6px;color:var(--dsw-alias-brand-primary,#4169e1);background:var(--dsw-alias-bg-layer-1,#fff);white-space:nowrap}
.dxs-mkt-open-stock:hover{background:var(--dsw-alias-brand-primary,#4169e1);color:#fff}
.dxs-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.dxs-data-actions .dxs-view-tabs{align-self:center}
.dxs-adjustment{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.dxs-adjustment select{width:auto;min-width:0;height:28px;padding:0 8px;font-size:12px}
.dxs-data-banner.is-market{border-color:var(--dsw-alias-brand-primary,#4169e1);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4169e1) 7%,transparent)}

/* Hot screen */
.dxs .dxs-hot-run{height:30px;padding:0 14px;font-size:12px;font-weight:600;border:1px solid var(--dsw-alias-brand-primary,#4169e1);border-radius:8px;background:var(--dsw-alias-brand-primary,#4169e1);color:#fff;white-space:nowrap}
.dxs .dxs-hot-run:disabled{opacity:.6}
.dxs-hot-industries{display:flex;flex-wrap:wrap;gap:6px}
.dxs .dxs-hot-industries button{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;font-size:11px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:999px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#202124);white-space:nowrap}
.dxs-hot-industries button small{font-size:10px}
.dxs .dxs-hot-industries button[aria-pressed="true"]{border-color:var(--dsw-alias-brand-primary,#4169e1);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4169e1) 10%,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-brand-primary,#4169e1);font-weight:600}
.dxs-hot-hint{margin:-4px 0 0;font-size:10px}
.dxs-hot-loading{display:flex;align-items:center;gap:8px;margin:0;font-size:12px}
.dxs-hot-summary{display:flex;flex-wrap:wrap;gap:6px 14px;padding:9px 11px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);font-size:11px;color:var(--dsw-alias-label-secondary,#666)}
.dxs-hot-summary b{opacity:.45;font-weight:400}
.dxs-hot-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dxs-hot-filter{flex:1 1 220px;min-width:0;display:flex}
.dxs-hot-filter input{width:100%;height:30px;padding:0 10px;font-size:12px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff)}
.dxs .dxs-hot-add-all{height:30px;padding:0 12px;font-size:12px;border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);white-space:nowrap}
.dxs .dxs-hot-add-all:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary,#4169e1);color:var(--dsw-alias-brand-primary,#4169e1)}
.dxs-hot-list{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.dxs-hot-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#e2e2e2);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff)}
.dxs-hot-score{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:60px;padding:5px 8px;border:1px solid transparent;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f4f4f5)}
.dxs-hot-score span{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#666)}
.dxs-hot-score strong{font-size:17px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
.dxs-hot-score[data-level="hot"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 8%,var(--dsw-alias-bg-layer-1,#fff))}
.dxs-hot-score[data-level="hot"] strong{color:var(--dsw-alias-state-error-primary,#bc2737)}
.dxs-hot-score[data-level="warm"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#a15c00) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#a15c00) 7%,var(--dsw-alias-bg-layer-1,#fff))}
.dxs-hot-score[data-level="warm"] strong{color:var(--dsw-alias-state-warn-primary,#a15c00)}
.dxs-hot-body{min-width:0;display:flex;flex-direction:column;gap:5px}
.dxs-hot-headline{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0}
.dxs-hot-name{display:inline-flex;flex-direction:column;align-items:flex-start;min-width:0}
.dxs-hot-name strong{font-size:14px;line-height:1.25}
.dxs-hot-name small{font-size:10px;color:var(--dsw-alias-label-secondary,#666)}
.dxs-hot-headline .dxs-mkt-link span{font-size:14px;font-weight:600;line-height:1.25}
.dxs-hot-headline .dxs-mkt-link small{font-size:10px}
.dxs-hot-quote{display:inline-flex;align-items:baseline;gap:8px;white-space:nowrap;font-variant-numeric:tabular-nums}
.dxs-hot-quote strong{font-size:14px}
.dxs-hot-quote em{font-style:normal;font-size:12px;font-weight:600}
.dxs-hot-tags{display:flex;flex-wrap:wrap;gap:4px}
.dxs-hot-tag{display:inline-flex;align-items:center;height:19px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f6f6f7);font-size:10px;line-height:1;color:var(--dsw-alias-label-secondary,#555);white-space:nowrap}
.dxs-hot-tag[data-category="heat"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 30%,transparent);color:var(--dsw-alias-state-error-primary,#bc2737)}
.dxs-hot-tag[data-category="volume"]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4169e1) 28%,transparent);color:var(--dsw-alias-brand-primary,#4169e1)}
.dxs-hot-tag[data-category="trend"]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#1a7f5a) 30%,transparent);color:var(--dsw-alias-state-success-primary,#1a7f5a)}
.dxs-hot-tag[data-category="capital"]{border-color:#9b6dd6;color:#7a4fbe}
.dxs-hot-tag.is-more{color:var(--dsw-alias-label-secondary,#666)}
.dxs-hot-meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;font-size:10px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums}
.dxs .dxs-hot-add{width:26px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);font-size:15px;line-height:1;color:var(--dsw-alias-label-secondary,#666)}
.dxs .dxs-hot-add:hover{border-color:var(--dsw-alias-brand-primary,#4169e1);color:var(--dsw-alias-brand-primary,#4169e1)}
.dxs-hot-method summary{cursor:pointer;font-size:11px;color:var(--dsw-alias-label-secondary,#666)}
.dxs-hot-method p{margin:6px 0 0;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary,#666)}
@media(max-width:720px){
.dxs-hot-row{grid-template-columns:auto minmax(0,1fr)}
.dxs .dxs-hot-add{grid-column:2;justify-self:end}
.dxs-hot-summary{gap:4px 10px}
}
`
