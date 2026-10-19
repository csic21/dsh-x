export const CSS = `
.dxb-pane{--dxb-bg:var(--dsw-alias-bg-layer-1,#fff);--dxb-soft:var(--dsw-alias-bg-layer-2,#f5f6f8);--dxb-title:var(--dsw-specific-sidebar-fill,var(--dxb-soft));--dxb-line:var(--dsw-alias-border-l2,#e2e5e9);--dxb-line-soft:var(--dsw-alias-border-l1,#eceef1);--dxb-fg:var(--dsw-alias-label-primary,#20252e);--dxb-muted:var(--dsw-alias-label-secondary,#717885);--dxb-accent:var(--dsw-alias-brand-primary,#4666d5);--dxb-warn:var(--dsw-alias-state-warn-primary,#9b6815);--dxb-ok:var(--dsw-alias-state-success-primary,#2b865c);--dxb-idle:var(--dsw-alias-state-idle-primary,#87909e);display:flex;flex-direction:column;height:100%;min-height:180px;min-width:0;color:var(--dxb-fg);background:var(--dxb-bg);font:13px/1.5 var(--dsw-font-family,system-ui,sans-serif);container-type:inline-size}
.dxb-pane *{box-sizing:border-box}
.dxb-pane h1,.dxb-pane p{margin:0}
.dxb-pane button,.dxb-pane input{font:inherit;color:inherit}
.dxb-pane button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;font-size:12px;line-height:1;border:1px solid var(--dxb-line);border-radius:6px;background:var(--dxb-bg);cursor:pointer;white-space:nowrap}
.dxb-pane button:hover:not(:disabled){background:var(--dxb-soft)}
.dxb-pane button:disabled{opacity:.45;cursor:not-allowed}
.dxb-pane button:focus-visible,.dxb-pane input:focus-visible{outline:2px solid var(--dxb-accent);outline-offset:2px}
.dxb-pane .dxb-primary{background:var(--dxb-accent);border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:550}
.dxb-pane .dxb-primary:hover:not(:disabled){background:color-mix(in srgb,var(--dxb-accent) 88%,#000)}
.dxb-icon-button{width:28px;padding:0;border-color:transparent;background:transparent;color:var(--dxb-muted);font-size:16px}
.dxb-icon-button:hover:not(:disabled){background:var(--dxb-soft);color:var(--dxb-fg)}
.dxb-dock{box-sizing:border-box;flex:none;width:calc(100% - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));max-width:calc(var(--dsh-composer-card-max-width,952px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));margin:0 auto;padding:0 var(--dsh-composer-dock-inset,8px)}
.dxb-entry{box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;height:32px;margin:0;padding:0 10px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary,#20252e);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;font-weight:500;line-height:20px;text-align:left;white-space:nowrap;cursor:pointer}
.dxb-entry:hover{background:var(--dsw-alias-bg-layer-2,#f2f3f5)}
.dxb-entry:active{background:var(--dsw-alias-bg-layer-2,#e9ebee)}
.dxb-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:-2px}
.dxb-entry-icon{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-secondary,#717885)}
.dxb-entry-icon svg{width:16px;height:16px}
.dxb-entry-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dxb-entry-go{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-secondary,#717885);opacity:.75}
.dxb-toolbar{display:flex;align-items:center;gap:6px;min-height:44px;padding:8px 10px;padding-inline-start:max(10px,var(--dsh-frame-leading-clearance,0px));border-bottom:1px solid var(--dxb-line-soft);background:var(--dxb-title);flex:none}
.dxb-nav{display:flex;align-items:center;gap:2px;flex:none}
.dxb-toolbar input{height:28px;font:inherit;font-size:12px;border:1px solid var(--dxb-line);border-radius:6px;padding:0 10px;min-width:0;flex:1;background:var(--dxb-bg);color:inherit}
.dxb-control{display:flex;align-items:center;gap:8px;justify-content:space-between;min-height:40px;padding:6px 10px;border-bottom:1px solid var(--dxb-line-soft);background:var(--dxb-bg);flex-wrap:wrap;flex:none}
.dxb-status{display:inline-flex;align-items:center;gap:7px;min-width:0;font-size:12px;color:var(--dxb-muted)}
.dxb-dot{width:7px;height:7px;background:var(--dxb-idle);border-radius:50%;flex:none}
.dxb-control[data-active] .dxb-dot{background:var(--dxb-ok)}
.dxb-takeover{color:var(--dxb-warn);border-color:color-mix(in srgb,var(--dxb-warn) 45%,var(--dxb-line));background:color-mix(in srgb,var(--dxb-warn) 12%,var(--dxb-bg))}
.dxb-takeover:hover:not(:disabled){background:color-mix(in srgb,var(--dxb-warn) 18%,var(--dxb-bg))}
.dxb-consent{margin:10px;padding:12px;border:1px solid var(--dxb-line-soft);border-radius:8px;background:var(--dxb-soft);font-size:12px}
.dxb-consent p{margin:0 0 10px}
.dxb-consent>div{display:flex;gap:8px;justify-content:flex-end}
.dxb-error{padding:10px 12px;background:color-mix(in srgb,var(--dxb-warn) 10%,var(--dxb-bg));border-bottom:1px solid var(--dxb-line-soft);color:var(--dxb-warn);overflow-wrap:anywhere;max-height:180px;overflow:auto;font-size:12px}
.dxb-error p{margin:0 0 5px}
.dxb-viewport{flex:1;min-height:100px;position:relative;display:flex}
.dxb-guest-host{position:absolute;inset:0;display:flex}
.dxb-webview{display:flex;flex:1;width:100%;height:100%;border:0;background:var(--dxb-bg)}
.dxb-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;pointer-events:none;color:var(--dxb-muted)}
.dxb-footer{padding:6px 10px;border-top:1px solid var(--dxb-line-soft);font-size:11px;color:var(--dxb-muted);display:flex;gap:8px;align-items:baseline;justify-content:space-between;flex:none}
.dxb-footer details{max-width:70%}
.dxb-footer p{margin:7px 0}
.dxb-footer summary{cursor:pointer}
@container(max-width:420px){.dxb-toolbar{gap:4px;padding:6px 8px}.dxb-toolbar button{padding:0 8px}.dxb-icon-button{width:28px;padding:0}.dxb-control{align-items:flex-start}.dxb-footer{flex-direction:column}.dxb-footer details{max-width:100%}}
`
