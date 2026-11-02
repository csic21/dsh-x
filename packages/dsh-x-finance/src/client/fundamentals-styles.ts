export const FUNDAMENTALS_CSS = `
.dxs-fundamentals{padding:18px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;margin-bottom:16px;min-width:0}
.dxs-fundamentals>header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.dxs-fundamentals h3{font-size:13px;font-weight:600;margin:0}
.dxs-fundamentals>header p{margin:2px 0 0!important}
.dxs-fundamentals h4{font-size:12px;font-weight:600;margin:0 0 8px;color:var(--dxs-fg)}
.dxs-fundamentals-block+.dxs-fundamentals-block{margin-top:18px}
.dxs-fundamentals-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px}
.dxs-fundamentals-cell{display:grid;gap:2px;padding:8px 10px;border-radius:8px;background:var(--dxs-soft)}
.dxs-fundamentals-cell span{font-size:11px;color:var(--dxs-muted)}
.dxs-fundamentals-cell strong{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.dxs-fundamentals-block>p{margin:8px 0 0!important}
.dxs-fundamentals-subhead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
.dxs-fundamentals-subhead span{font-size:11px}
.dxs-fundamentals-scroll{overflow-x:auto;margin-top:8px}
.dxs-fundamentals table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.dxs-fundamentals th{padding:6px 8px;font-size:11px;font-weight:500;color:var(--dxs-muted);text-align:right;white-space:nowrap;border-bottom:1px solid var(--dxs-line)}
.dxs-fundamentals td{padding:7px 8px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--dxs-line-soft)}
.dxs-fundamentals th:first-child,.dxs-fundamentals td:first-child{text-align:left}
.dxs-fundamentals td span{display:block}
.dxs-fundamentals td small{display:block;font-size:11px;color:var(--dxs-muted)}
.dxs-fundamentals tr.is-latest td{background:color-mix(in srgb,var(--dxs-accent) 6%,transparent)}
.dxs-fundamentals-disclaimer{font-size:11px}
@media(max-width:650px){.dxs-fundamentals{padding:12px}.dxs-fundamentals-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
`
