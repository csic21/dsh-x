/**
 * The settings row's own styles. Copied patterns (row rhythm, switch geometry,
 * segmented control) follow the host primitives so the row sits beside the
 * shipped General rows without looking foreign; every color is a theme token.
 *
 * Classes carry the plugin's `dxu-` prefix so nothing can collide with a host
 * module class, and the row draws its own internals because the owner passes
 * no props and projects no label.
 */
export const SETTINGS_CSS = `
.dxu-row{display:flex;flex-direction:column;gap:10px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.dxu-rowText{display:flex;flex-direction:column;gap:4px;padding-right:48px}
.dxu-title{font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-primary)}
.dxu-desc{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dxu-controls{display:flex;flex-direction:column;gap:12px;max-width:420px}
.dxu-line{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:24px}
.dxu-field{display:flex;flex-direction:column;gap:8px}
.dxu-label{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.dxu-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dxu-muted{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dxu-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dxu-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.dxu-row[data-disabled=true] .dxu-controls{opacity:.6}
/* Switch: the same capsule the host uses, keyed off aria-checked so the paint
   can never disagree with what assistive technology reads. */
.dxu-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-border-l3);cursor:pointer}
.dxu-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}
.dxu-switch:disabled{cursor:default;opacity:.5}
.dxu-switch:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dxu-thumb{display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-label-primary-foreground);transition:transform 120ms ease}
.dxu-switch[aria-checked=false] .dxu-thumb{background:var(--dsw-alias-switch-thumb)}
.dxu-switch[aria-checked=true] .dxu-thumb{transform:translateX(16px)}
/* Segmented control: one sliding indicator, sized arithmetically from the
   segment count the component publishes, so no DOM measurement is needed. */
.dxu-segments{position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;padding:4px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover)}
.dxu-indicator{position:absolute;top:4px;left:4px;width:calc((100% - 8px - 2px * (var(--dxu-segment-count) - 1)) / var(--dxu-segment-count));height:calc(100% - 8px);border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-soft);transform:translateX(calc(var(--dxu-segment-index) * (100% + 2px)));transition:transform 160ms ease;pointer-events:none}
.dxu-segment{box-sizing:border-box;position:relative;z-index:1;height:28px;padding:0 16px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer;transition:color 120ms ease}
.dxu-segment:hover:not(:disabled),.dxu-segment[aria-pressed=true]{color:var(--dsw-alias-label-primary)}
.dxu-segment:disabled{cursor:default}
.dxu-segment:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
@media (prefers-reduced-motion:reduce){.dxu-thumb,.dxu-indicator{transition:none}}
`
