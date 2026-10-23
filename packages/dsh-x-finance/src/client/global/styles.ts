// Global-board layout on top of the shared .dxs-mkt primitives. Index cards are
// wider than the A-share board's six-up strip because each carries an
// exchange-local quote time, so four across is the comfortable desktop width.
export const GLOBAL_CSS = `
.dxs-glb-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}
.dxs-glb-coverage{margin:0}
.dxs-glb-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.dxs-glb-card .dxs-mkt-index-price{font-size:19px}
.dxs-glb-identity{display:flex;flex-direction:column;min-width:0;gap:0}
.dxs-glb-sub{flex-direction:column;align-items:flex-start;gap:1px}
.dxs-glb-time{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}
.dxs-glb-updown{display:flex;gap:10px;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}
@media(max-width:1100px){.dxs-glb-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:900px){.dxs-glb-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:820px){.dxs-glb-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:540px){.dxs-glb-grid,.dxs-glb-kpis{grid-template-columns:1fr}}
`
