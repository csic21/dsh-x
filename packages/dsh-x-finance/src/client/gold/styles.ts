export const GOLD_CSS = `
.dxs-gold{display:grid;gap:14px}
.dxs-gold-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dxs-gold-head h2{font-size:15px;margin:0}
.dxs-gold-head p{margin:2px 0 0}
.dxs-gold-head-actions{display:flex;align-items:center;gap:8px;flex:none}
.dxs-gold-stale{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--dxs-line);color:var(--dxs-muted)}
.dxs-gold-meta{font-size:11px;margin:0}
.dxs-gold-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
.dxs-gold-card{padding:12px;border:1px solid var(--dxs-line);border-radius:10px;background:var(--dxs-bg)}
.dxs-gold-card header{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.dxs-gold-card h3{font-size:13px;font-weight:600;margin:0}
.dxs-gold-badge{font-size:11px;color:var(--dxs-muted);border:1px solid var(--dxs-line-soft);border-radius:999px;padding:1px 7px;white-space:nowrap}
.dxs-gold-price{font-size:24px;line-height:1.25;margin-top:6px;font-variant-numeric:tabular-nums}
.dxs-gold-change{margin:0;font-size:12px;font-variant-numeric:tabular-nums}
.dxs-gold-metrics{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:3px 8px;margin:10px 0 6px;font-size:11px;color:var(--dxs-muted)}
.dxs-gold-metrics dt{margin:0}
.dxs-gold-metrics dd{margin:0;text-align:right;color:var(--dxs-fg);font-variant-numeric:tabular-nums}
.dxs-gold-time{font-size:11px;margin:6px 0 0}
.dxs-gold-summary,.dxs-gold-ranges{padding:14px;border:1px solid var(--dxs-line);border-radius:10px}
.dxs-gold-derived{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:4px 0 8px}
.dxs-gold-derived div{display:grid;gap:2px;padding:8px 10px;border-radius:8px;background:var(--dxs-soft)}
.dxs-gold-derived span{font-size:11px;color:var(--dxs-muted)}
.dxs-gold-derived strong{font-size:16px;font-variant-numeric:tabular-nums}
.dxs-gold-derived strong small{font-size:11px;font-weight:400;color:var(--dxs-muted)}
.dxs-gold-derived em{font-size:11px;font-style:normal}
.dxs-gold-table-wrap{overflow-x:auto}
.dxs-gold-table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.dxs-gold-table th,.dxs-gold-table td{text-align:right;padding:6px 8px;border-bottom:1px solid var(--dxs-line-soft);white-space:nowrap}
.dxs-gold-table thead th{font-weight:600;color:var(--dxs-muted);font-size:11px}
.dxs-gold-table th:first-child,.dxs-gold-table tbody th{text-align:left}
.dxs-gold-table tbody tr:last-child th,.dxs-gold-table tbody tr:last-child td{border-bottom:0}
.dxs-gold-notes{font-size:12px;color:var(--dxs-muted)}
.dxs-gold-notes summary{cursor:pointer;color:var(--dxs-fg)}
.dxs-gold-notes p{margin:6px 0}
@media(max-width:650px){.dxs-gold-grid{grid-template-columns:1fr}.dxs-gold-head{flex-direction:column}}
`
