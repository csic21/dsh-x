// Local quantitative panel. It sits under the chart, reuses the workbench's
// theme variables, and keeps every table scrollable instead of widening the page.
export const QUANT_CSS = `
.dxs-quant{margin-top:18px;border-top:1px solid var(--dxs-line);padding-top:14px;display:flex;flex-direction:column;gap:12px;min-width:0}
.dxs-quant-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
.dxs-quant-head h3{font-size:14px;margin:0}
.dxs-quant-head p{margin:2px 0;color:var(--dxs-muted);font-size:11px}
.dxs-quant-badge{flex:none;padding:2px 8px;border:1px solid var(--dxs-line);border-radius:999px;font-size:10px;color:var(--dxs-muted)}
.dxs-quant-muted{color:var(--dxs-muted);font-size:11px;margin:4px 0}
.dxs-quant-stats,.dxs-quant-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.dxs-quant-stat{min-width:0;border:1px solid var(--dxs-line);border-radius:8px;background:var(--dxs-soft);padding:8px 10px}
.dxs-quant-stat-label{font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--dxs-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-quant-stat-value{font-size:16px;font-weight:650;line-height:1.3;margin-top:2px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.dxs-quant-stat-note{font-size:9px;color:var(--dxs-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-quant-card{min-width:0;border:1px solid var(--dxs-line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px}
.dxs-quant-card-head h4{font-size:13px;margin:0}
.dxs-quant-card-head p{margin:2px 0;color:var(--dxs-muted);font-size:10px}
.dxs-quant-table-wrap{overflow:auto;max-width:100%}
.dxs-quant table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}
.dxs-quant caption{text-align:left;color:var(--dxs-muted);font-size:10px;padding-bottom:4px}
.dxs-quant th,.dxs-quant td{padding:4px 6px;border-bottom:1px solid var(--dxs-line-soft);text-align:right;white-space:nowrap}
.dxs-quant th:first-child,.dxs-quant td:first-child{text-align:left}
.dxs-quant thead th{color:var(--dxs-muted);font-weight:600}
.dxs-quant-monthly td.is-empty{color:var(--dxs-muted)}
.dxs-quant-partial{color:var(--dxs-muted);margin-left:2px}
.dxs-quant-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.dxs-quant-field{display:flex;flex-direction:column;gap:3px;font-size:10px;color:var(--dxs-muted)}
.dxs-quant-field select,.dxs-quant-field input{height:28px;min-width:110px;padding:0 8px;font-size:12px;border:1px solid var(--dxs-line);border-radius:6px;background:var(--dxs-bg);color:var(--dxs-fg)}
.dxs-quant-field input{width:100px;min-width:0}
.dxs-quant-subtitle{font-size:12px;margin:4px 0 0}
.dxs-quant-chart svg{width:100%;height:auto;display:block;background:var(--dxs-soft);border-radius:8px}
.dxs-quant-chart path{fill:none;stroke-width:2;vector-effect:non-scaling-stroke}
.dxs-quant-chart .is-strategy{stroke:var(--dxs-accent)}
.dxs-quant-chart .is-buyhold{stroke:var(--dxs-muted);stroke-dasharray:4 3}
.dxs-quant-chart .is-baseline{stroke:var(--dxs-line);stroke-width:1;stroke-dasharray:2 4}
.dxs-quant-chart .is-axis{fill:var(--dxs-muted);font-size:10px;font-variant-numeric:tabular-nums}
.dxs-quant-legend{display:flex;gap:14px;font-size:10px;color:var(--dxs-muted);margin-top:4px}
.dxs-quant-legend i{display:inline-block;width:16px;height:2px;margin-right:5px;vertical-align:middle}
.dxs-quant-legend i.is-strategy{background:var(--dxs-accent)}
.dxs-quant-legend i.is-buyhold{background:var(--dxs-muted)}
.dxs-quant-details summary{cursor:pointer;font-size:11px;color:var(--dxs-muted)}
.dxs-quant-details ul{margin:6px 0;padding-left:18px;font-size:11px;color:var(--dxs-muted);line-height:1.6}
.dxs-quant-trades{max-height:300px}
.dxs-quant-trades td small{display:block;color:var(--dxs-muted);font-size:9px}
.dxs-quant-open{display:inline-block;margin-left:6px;padding:0 5px;border:1px solid var(--dxs-line);border-radius:999px;font-size:9px;font-style:normal;color:var(--dxs-muted)}
@media(max-width:640px){.dxs-quant-stats,.dxs-quant-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
`
