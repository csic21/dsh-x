export const CSS = `
.dxp{--dxp-size:7.04rem;position:absolute;right:0;bottom:0;z-index:40;pointer-events:none;font:12px/1.4 var(--dsw-font-family,system-ui,sans-serif);color:var(--dsw-alias-label-primary,#20252e)}
.dxp *{box-sizing:border-box}
.dxp-stage{position:absolute;right:calc(20px - var(--dxp-x,0px));bottom:calc(20px - var(--dxp-y,0px));display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:auto}
.dxp-sprite{position:relative;width:var(--dxp-size);aspect-ratio:192/208;background-repeat:no-repeat;background-size:800% 1100%;image-rendering:pixelated;cursor:grab;touch-action:none;border:0;padding:0;background-color:transparent;filter:drop-shadow(0 6px 10px rgba(15,23,42,.18));transition:transform .18s ease}
.dxp-sprite:active{cursor:grabbing;transform:scale(.98)}
.dxp-sprite:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:4px;border-radius:18px}
.dxp-sprite[data-loading=true]{opacity:0}
.dxp-fallback{display:flex;align-items:center;justify-content:center;width:var(--dxp-size);aspect-ratio:192/208;border-radius:18px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);border:1px dashed var(--dsw-alias-border-l2,#cbd2dc);color:var(--dsw-alias-label-secondary,#717885);text-align:center;padding:8px;font-size:11px}
.dxp-controls{display:flex;align-items:center;gap:4px;padding:2px;border-radius:999px;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l1,#e4e7ec);box-shadow:0 2px 8px rgba(15,23,42,.12);opacity:0;transform:translateY(2px);transition:opacity .16s ease,transform .16s ease;pointer-events:none}
.dxp-stage:hover .dxp-controls,.dxp-stage:focus-within .dxp-controls{opacity:1;transform:none;pointer-events:auto}
.dxp-controls button{display:inline-flex;align-items:center;justify-content:center;height:24px;min-width:24px;padding:0 8px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.dxp-controls button:hover{background:var(--dsw-alias-bg-layer-2,#f1f2f4)}
.dxp-controls button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:1px}
.dxp-bubble{position:relative;display:flex;align-items:center;gap:6px;max-width:240px;padding:7px 10px;border-radius:12px;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#20252e);border:1px solid var(--dsw-alias-border-l2,#d7dbe2);box-shadow:0 8px 20px rgba(15,23,42,.16);font-size:12px;line-height:1.35;pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .18s ease,transform .18s ease}
.dxp-bubble-text{display:flex;flex-direction:column;gap:1px;min-width:0;text-align:left}
.dxp-bubble-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#717885);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px}
.dxp-bubble-detail{font-size:12px;overflow-wrap:anywhere}
.dxp-bubble[data-tone=waiting]{border-color:var(--dsw-alias-link,#4176e6)}
.dxp-bubble[data-tone=done]{border-color:var(--dsw-alias-state-success-primary,#12805c)}
.dxp-bubble-more{flex:none;min-width:24px;height:20px;padding:0 5px;border:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f4f5f7);color:var(--dsw-alias-label-secondary,#717885);font:inherit;font-size:10px;cursor:pointer;pointer-events:auto}
.dxp-bubble-more:hover{background:var(--dsw-alias-bg-layer-3,#e9ebef)}
.dxp-bubble-more:focus-visible{outline:2px solid var(--dsw-alias-link,#4176e6);outline-offset:1px}
.dxp-bubble-check{color:var(--dsw-alias-state-success-primary,#12805c);margin-right:3px;font-weight:700}
.dxp-bubble-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a919c);font:inherit;font-size:13px;line-height:1;cursor:pointer;pointer-events:auto}
.dxp-bubble-close:hover{background:var(--dsw-alias-bg-layer-3,#e9ebef);color:var(--dsw-alias-label-primary,#20252e)}
.dxp-bubble-close:focus-visible{outline:2px solid var(--dsw-alias-link,#4176e6);outline-offset:1px}
.dxp-bubble[data-show=true]{opacity:1;transform:none}
.dxp-bubble::after{content:"";position:absolute;left:50%;bottom:-5px;width:8px;height:8px;margin-left:-4px;transform:rotate(45deg);background:inherit;border-right:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-bottom:1px solid var(--dsw-alias-border-l2,#d7dbe2)}
.dxp-stage:hover .dxp-status,.dxp-stage:focus-within .dxp-status{opacity:1}
.dxp-status{font-size:11px;color:var(--dsw-alias-label-secondary,#717885);background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l1,#e4e7ec);border-radius:999px;padding:1px 8px;opacity:0;transition:opacity .16s ease;white-space:nowrap;pointer-events:none}
.dxp-scrim{position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.32);display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto}
.dxp-dialog{width:min(420px,100%);max-height:min(560px,calc(100vh - 48px));display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#20252e);border:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-radius:14px;box-shadow:0 18px 48px rgba(15,23,42,.24);overflow:hidden}
.dxp-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#eceef1)}
.dxp-dialog h2{margin:0;font-size:14px;font-weight:600}
.dxp-dialog header button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#717885);border-radius:8px;height:28px;padding:0 10px;font:inherit;cursor:pointer}
.dxp-dialog header button:hover{background:var(--dsw-alias-bg-layer-2,#f1f2f4)}
.dxp-list{list-style:none;margin:0;padding:8px;overflow:auto;display:flex;flex-direction:column;gap:2px}
.dxp-row{display:flex;align-items:center;gap:12px;width:100%;padding:8px;border:1px solid transparent;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dxp-row:hover{background:var(--dsw-alias-bg-layer-2,#f4f5f7)}
.dxp-row[aria-current=true]{border-color:var(--dsw-alias-brand-primary,#4666d5);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4666d5) 8%,transparent)}
.dxp-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:1px}
.dxp-thumb{width:44px;height:48px;flex:none;border-radius:8px;background-repeat:no-repeat;background-size:800% 1100%;image-rendering:pixelated;background-color:var(--dsw-alias-bg-layer-2,#f4f5f7)}
.dxp-row-text{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.dxp-row-text strong{font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxp-row-text span{font-size:11px;color:var(--dsw-alias-label-secondary,#717885);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxp-tag{flex:none;font-size:10px;letter-spacing:.02em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#717885);border:1px solid var(--dsw-alias-border-l1,#e4e7ec);border-radius:999px;padding:1px 6px}
.dxp-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px 14px;border-top:1px solid var(--dsw-alias-border-l1,#eceef1);font-size:11px;color:var(--dsw-alias-label-secondary,#717885)}
.dxp-dialog footer p{margin:0;overflow-wrap:anywhere}
.dxp-empty{margin:0;padding:18px 16px;color:var(--dsw-alias-label-secondary,#717885);font-size:12px;overflow-wrap:anywhere}
.dxp-notice{margin:0;padding:8px 16px 0;color:var(--dsw-alias-state-warn-primary,#b45309);font-size:11px}
.dxp-settings{display:flex;flex-direction:column;gap:16px;max-width:720px;padding:8px 4px 24px;color:var(--dsw-alias-label-primary,#20252e)}
.dxp-settings-head h2{margin:0 0 6px;font-size:18px;font-weight:650}
.dxp-settings-head p,.dxp-settings-note,.dxp-switch-row span{margin:0;color:var(--dsw-alias-label-secondary,#717885);font-size:13px;line-height:1.5}
.dxp-settings h3{margin:8px 0 0;font-size:13px;font-weight:650}
.dxp-switch-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff)}
.dxp-switch-row strong{display:block;font-size:13px;margin-bottom:2px}
.dxp-switch{position:relative;width:40px;height:24px;flex:none;border:0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-secondary,#717885) 55%,var(--dsw-alias-bg-layer-2,#2a2e35));cursor:pointer;padding:0}
.dxp-switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.35);transition:transform .16s ease}
.dxp-switch[aria-checked=true]{background:var(--dsw-alias-link,#4176e6)}
.dxp-switch[aria-checked=true]::after{transform:translateX(16px)}
.dxp-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:2px}
.dxp-grid{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px;margin:0;padding:0}
.dxp-card{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;min-height:168px;padding:12px 10px;border:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;cursor:pointer;text-align:center}
.dxp-card:hover{background:var(--dsw-alias-bg-layer-2,#f4f5f7)}
.dxp-card[aria-current=true]{border-color:var(--dsw-alias-link,#4176e6);box-shadow:inset 0 0 0 1px var(--dsw-alias-link,#4176e6)}
.dxp-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:2px}
.dxp-card strong{font-size:13px}
.dxp-card span{font-size:11px;line-height:1.4;color:var(--dsw-alias-label-secondary,#717885)}
.dxp-card-art{width:72px;height:78px;background-repeat:no-repeat;background-position:0 0;image-rendering:pixelated}
@media (prefers-reduced-motion:reduce){.dxp-sprite,.dxp-switch::after{transition:none}}
@media (max-width:720px){.dxp{--dxp-size:88px}}
`
