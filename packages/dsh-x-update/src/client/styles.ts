export const CSS = `
.dxu { color: var(--dsw-alias-label-primary); font: inherit; max-width: 760px; }
.dxu * { box-sizing: border-box; }
.dxu-head h1 { font-size: 20px; margin: 0 0 6px; }
.dxu-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dxu-status { display: grid; gap: 4px; margin: 16px 0; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-main); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.dxu-status strong { font-size: 14px; }
.dxu-status span { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dxu-tone-info { border-color: var(--dsw-alias-primary); }
.dxu-tone-warning { border-color: var(--dsw-alias-warning, #b26a00); }
.dxu-tone-danger { border-color: var(--dsw-alias-error, #bc2737); }
.dxu-error { color: var(--dsw-alias-error, #bc2737); font-size: 12px; overflow-wrap: anywhere; }
.dxu-versions { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 18px; margin: 18px 0; padding: 14px; border: 1px solid var(--dsw-alias-border-main); border-radius: 10px; }
.dxu-versions dt { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dxu-versions dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
.dxu-arrow { color: var(--dsw-alias-label-secondary); margin: 0 6px; }
.dxu-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 16px 0; }
.dxu button, .dxu-link { font: inherit; color: inherit; border: 1px solid var(--dsw-alias-border-main); border-radius: 7px; background: var(--dsw-alias-bg-layer-1); padding: 6px 12px; cursor: pointer; text-decoration: none; }
.dxu button:hover, .dxu-link:hover { background: var(--dsw-alias-bg-layer-2); }
.dxu button:focus-visible, .dxu-link:focus-visible { outline: 2px solid var(--dsw-alias-primary); outline-offset: 2px; }
.dxu button:disabled { opacity: .45; cursor: default; }
.dxu-note { margin: 18px 0 6px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
@media (max-width: 560px) { .dxu-versions { grid-template-columns: 1fr; } .dxu-versions dt { margin-top: 6px; } }
`
