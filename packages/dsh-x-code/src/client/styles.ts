export const CSS = `
.dxc{--code-bg:var(--dsw-alias-bg-layer-1,#fff);--code-soft:var(--dsw-alias-bg-layer-2,#f5f6f8);--code-sunken:var(--dsw-specific-sidebar-fill,color-mix(in srgb,var(--dsw-alias-bg-layer-2,#f2f3f5) 70%,var(--dsw-alias-bg-layer-1,#fff)));--code-line:var(--dsw-alias-border-l2,#e2e5e9);--code-line-soft:var(--dsw-alias-border-l1,#eceef1);--code-fg:var(--dsw-alias-label-primary,#20252e);--code-muted:var(--dsw-alias-label-secondary,#717885);--code-accent:var(--dsw-alias-brand-primary,#4666d5);--code-warning:var(--dsw-alias-state-warn-primary,#9b6815);--code-success:var(--dsw-alias-state-success-primary,#2b865c);--code-danger:var(--dsw-alias-state-error-primary,#bb5863);--code-tab-h:35px;color:var(--code-fg);font:13px/1.5 var(--dsw-font-family,system-ui,sans-serif);box-sizing:border-box}
/* Generic element styling stops at the embedded Conversation: the shell owns
   every control, heading and paragraph inside it. */
.dxc :not(.dxc-chat-embed *){box-sizing:border-box;min-width:0}
.dxc-page{height:100%;min-height:0;width:100%;max-width:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--code-bg);container-type:inline-size}
.dxc :is(h1,h2,p):not(.dxc-chat-embed *){margin:0}
.dxc :is(button,input,select):not(.dxc-chat-embed *){font:inherit;color:inherit}
.dxc :is(button,select,input[type=search],input:not([type])):not(.dxc-chat-embed *){border:1px solid var(--code-line);border-radius:6px;background:var(--code-bg)}
.dxc button:not(.dxc-chat-embed *){cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;font-size:12px;line-height:1;border-radius:6px;white-space:nowrap}
.dxc :is(.dxc-file,.dxc-problem,.dxc-finding-title,.dxc-location,.dxc-link,.dxc-history-item,.dxc-tab-popup button,.dxc-file-footer button){height:auto;min-height:0}
.dxc button:not(.dxc-chat-embed *):hover:not(:disabled){background:var(--code-soft)}
.dxc :is(button,input,select):not(.dxc-chat-embed *):disabled{opacity:.45;cursor:not-allowed}
.dxc :is(button,input,select,summary,[tabindex]):not(.dxc-chat-embed *):focus-visible{outline:2px solid var(--code-accent);outline-offset:2px}
.dxc input[type=checkbox]{width:13px;height:13px;flex:none;margin:0;accent-color:var(--code-accent)}
.dxc :is(input[type=search],input:not([type]),select):not(.dxc-chat-embed *){height:28px;padding:0 8px;font-size:12px}
.dxc select:not(.dxc-chat-embed *){max-width:100%}
.dxc .dxc-primary{background:var(--code-accent);border-color:var(--code-accent);color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:550}
.dxc .dxc-primary:hover:not(:disabled){background:color-mix(in srgb,var(--code-accent) 90%,#000)}
.dxc-muted{color:var(--code-muted);font-size:11px}
.dxc-warning{color:var(--code-warning)}
.dxc-inline-warning{background:color-mix(in srgb,var(--code-warning) 8%,var(--code-bg));color:var(--code-warning);padding:8px 12px;font:12px/1.5 system-ui,sans-serif;white-space:normal}
.dxc details:not(.dxc-chat-embed *) summary{cursor:pointer;color:var(--code-muted);font-size:11px}
.dxc pre:not(.dxc-chat-embed *){white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;margin:6px 0}
.dxc details:not(.dxc-chat-embed *) p{font-size:12px;margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere}

/* Title bar: a compact, editor-like header instead of a page hero. */
.dxc-titlebar{display:flex;align-items:center;gap:12px;justify-content:space-between;height:44px;padding:0 12px;padding-inline-start:max(12px,var(--dsh-frame-leading-clearance,0px));border-bottom:1px solid var(--code-line-soft);background:var(--code-sunken);flex:none}
.dxc-brand{display:flex;align-items:center;gap:8px;min-width:0}
.dxc-brand svg{color:var(--code-accent);flex:none;width:16px;height:16px}
.dxc-brand h1{font-size:13px;font-weight:600;letter-spacing:0}
.dxc-repo{color:var(--code-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-left:1px solid var(--code-line);padding-left:8px;margin-left:2px}
.dxc-header-actions{display:flex;gap:6px;align-items:center;flex:none}
.dxc-header-actions>button{font-size:12px;padding:0 10px}
.dxc-count{display:inline-block;background:color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 16%,transparent);border-radius:4px;margin-left:6px;padding:0 5px;font-size:10px;font-variant-numeric:tabular-nums}
.dxc-header-actions .dxc-primary .dxc-count{background:color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 22%,transparent)}
.dxc-icon-button{display:inline-grid;place-items:center;width:28px;height:28px;min-width:28px;padding:0!important;border-color:transparent!important;background:transparent!important;color:var(--code-muted)}
.dxc-icon-button:hover:not(:disabled){background:var(--code-soft)!important;color:var(--code-fg)}
.dxc-icon-button[aria-pressed=true]{color:var(--code-fg);background:color-mix(in srgb,var(--code-accent) 10%,transparent)!important}
.dxc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:8px 12px;border-bottom:1px solid var(--code-line-soft);flex-wrap:wrap;flex:none;font-size:12px;background:var(--code-bg)}
.dxc-scope{display:flex;gap:6px;align-items:center}
.dxc-scope label{color:var(--code-muted);font-size:11px}
.dxc-scope form{display:flex;gap:5px}
.dxc-scope input{width:145px;font-size:11px}
.dxc-scope select,.dxc-toolbar select,.dxc-scope button{height:28px;font-size:12px;padding:0 10px}
.dxc-banner{display:flex;align-items:center;gap:9px;padding:7px 12px;border-bottom:1px solid var(--code-line);background:var(--code-soft);font-size:11px;flex:none;flex-wrap:wrap}
.dxc-banner>button:last-child{margin-left:auto}
.dxc-banner button{height:28px;font-size:12px;padding:0 10px}
.dxc-running{color:var(--code-accent)}
.dxc-state-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--code-accent);flex:none}
.dxc-review-failed,.dxc-review-interrupted,.dxc-review-blocked{background:var(--code-warning)}

/* Workbench: activity bar, resizable sidebar, editor, resizable review panel. */
.dxc-workbench{display:grid;grid-template-columns:40px 236px 4px minmax(240px,1fr) 4px 328px;flex:1;min-height:0;overflow:hidden}
.dxc-track-activity{grid-column:1;grid-row:1;min-width:0;min-height:0;overflow:hidden;background:var(--code-sunken);border-right:1px solid var(--code-line)}
.dxc-sidebar{grid-column:2;grid-row:1}
.dxc-track-sidebar-splitter{grid-column:3;grid-row:1}
.dxc-editor{grid-column:4;grid-row:1}
.dxc-track-panel-splitter{grid-column:5;grid-row:1}
.dxc-panel{grid-column:6;grid-row:1}
.dxc-activity{display:flex;flex-direction:column;align-items:center;gap:2px;height:100%;padding:6px 0;background:transparent;overflow:visible}
.dxc .dxc-activity-item{position:relative;display:grid;place-items:center;width:32px;height:32px;padding:0!important;border:0!important;background:transparent!important;border-radius:6px;color:var(--code-muted)}
.dxc-activity-item:hover:not(:disabled){background:color-mix(in srgb,var(--code-fg) 7%,transparent)!important;color:var(--code-fg)}
.dxc-activity-item[aria-pressed=true]{color:var(--code-fg);background:color-mix(in srgb,var(--code-fg) 7%,transparent)!important}
.dxc-activity-item[aria-pressed=true]::before{content:'';position:absolute;inset-inline-start:-4px;top:7px;bottom:7px;width:2px;border-radius:2px;background:var(--code-accent)}
.dxc-activity-icon{display:grid;place-items:center}
.dxc-activity-count{position:absolute;top:1px;right:0;min-width:14px;height:14px;padding:0 4px;border-radius:7px;background:var(--code-accent);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:9px;line-height:14px;font-variant-numeric:tabular-nums;text-align:center}
.dxc-sidebar{border-right:1px solid var(--code-line);display:flex;flex-direction:column;overflow:hidden;min-height:0;background:var(--code-sunken)}
.dxc-sidebar-title{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:9px 12px 7px;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.dxc-sidebar-title>strong{font-weight:600;color:var(--code-muted)}
.dxc-sidebar-title>span{color:var(--code-muted);font-size:10px;font-variant-numeric:tabular-nums;text-transform:none;letter-spacing:0}
.dxc-section-title{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:0 14px;font-size:12px}
.dxc-section-title>span{color:var(--code-muted);font-size:11px;font-variant-numeric:tabular-nums}
.dxc-tabs{display:flex;align-items:center;gap:2px;height:28px;background:var(--code-soft);padding:2px;border:1px solid var(--code-line-soft);border-radius:8px;width:max-content;max-width:100%}
.dxc-tabs button{height:24px;border:none;background:transparent;font-size:12px;padding:0 10px;color:var(--code-muted);border-radius:6px}
.dxc-tabs button[aria-selected=true]{background:var(--code-bg);color:var(--code-fg);font-weight:600;box-shadow:0 1px 2px #00000014}
.dxc-sidebar-tabs{margin:0 12px 8px}
.dxc-file-search{display:flex;align-items:center;gap:5px;margin:0 10px 8px;border:1px solid var(--code-line);background:var(--code-bg);border-radius:6px;padding:0 7px;flex:none}
.dxc-file-search>span{color:var(--code-muted);display:grid;place-items:center}
.dxc-file-search input[type=search]{border:0;background:transparent;width:100%;height:28px;padding:0;font-size:12px;outline-offset:5px}
.dxc-file-list{flex:1;overflow:auto;padding:0 6px 12px}
.dxc-tree,.dxc-children{padding:0;margin:0;list-style:none}
.dxc-branch,.dxc-file-row{list-style:none}
.dxc-directory{margin:1px 0}
.dxc-directory>summary{display:flex;align-items:center;gap:3px;padding:3px 6px;border-radius:5px;overflow:hidden;white-space:nowrap;list-style:none;font-size:11px;cursor:pointer;font-weight:550}
.dxc-directory>summary::-webkit-details-marker{display:none}
.dxc-directory>summary:hover{background:color-mix(in srgb,var(--code-fg) 6%,transparent)}
.dxc-disclosure{display:grid;place-items:center;flex:none;color:var(--code-muted);transition:transform .12s}
.dxc-directory[open]>summary .dxc-disclosure{transform:rotate(90deg)}
.dxc-dir-name{overflow:hidden;text-overflow:ellipsis;font-size:11px;letter-spacing:.01em}
.dxc .dxc-type-icon,.dxc .dxc-folder-icon{display:inline-grid;place-items:center;flex:none;width:16px;min-width:16px;height:16px;line-height:0}
.dxc-type-icon svg,.dxc-folder-icon svg{display:block}
.dxc-file-row{display:flex;align-items:center;gap:5px;border-radius:5px;margin:1px 0;padding-right:4px}
.dxc-file-row:hover{background:color-mix(in srgb,var(--code-fg) 5%,transparent)}
.dxc-file-row[data-selected=true]{background:color-mix(in srgb,var(--code-accent) 12%,transparent)}
.dxc-file-row[data-selected=true] .dxc-file-name{color:var(--code-fg);font-weight:550}
.dxc-file{display:flex;align-items:center;gap:6px;width:100%;text-align:left;min-width:0;border:0!important;background:transparent!important;padding:3px 4px!important;font-size:12px!important;border-radius:5px}
.dxc-file:hover:not(:disabled){background:transparent!important}
.dxc-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px}
.dxc-file-status{font:9px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;min-width:9px;text-align:center;color:var(--code-muted);font-weight:600}
.dxc-status-added,.dxc-status-untracked{color:var(--code-success)}
.dxc-status-deleted{color:var(--code-danger)}
.dxc-status-modified{color:var(--code-warning)}
.dxc-file-footer{padding:7px 10px;border-top:1px solid var(--code-line);font-size:10px;color:var(--code-muted);display:flex;align-items:center;justify-content:space-between;gap:5px;flex-wrap:wrap;flex:none}
.dxc-file-footer button{font-size:10px;padding:1px 5px;background:transparent;border-color:transparent;color:var(--code-accent)}
.dxc-file-footer>span{flex:1}
.dxc-history-pane{flex:1;overflow:auto;padding:2px 10px 12px;display:flex;flex-direction:column;gap:6px}
.dxc-history-pane ol{list-style:none;margin:0;padding:0}
.dxc-history-pane li{margin:2px 0}
.dxc-link{border:0!important;background:transparent!important;color:var(--code-accent)!important;font-size:11px!important;padding:4px 0!important;text-align:left}

/* Editor: tabs, breadcrumbs, code, status bar. */
.dxc-editor{display:flex;flex-direction:column;overflow:hidden;min-height:0;min-width:0;background:var(--code-bg)}
.dxc-editor-tabs{display:flex;align-items:stretch;height:var(--code-tab-h);border-bottom:1px solid var(--code-line);background:var(--code-sunken);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;flex:none}
.dxc-tab{display:flex;align-items:center;gap:2px;border-right:1px solid var(--code-line);padding:0 2px 0 10px;background:var(--code-sunken);position:relative;max-width:210px;flex:none}
.dxc-tab[data-active=true]{background:var(--code-bg)}
.dxc-tab[data-active=true]::after{content:'';position:absolute;inset-inline:0;top:0;height:1px;background:var(--code-accent)}
.dxc-tab[data-preview=true] .dxc-tab-name{font-style:italic;color:var(--code-muted)}
.dxc-tab[role=tablist]{outline:none}
.dxc-tab button[role=tab]{display:inline-flex;align-items:center;gap:6px;border:0!important;background:transparent!important;padding:0!important;font-size:12px!important;max-width:180px;min-width:0;overflow:hidden;white-space:nowrap;color:var(--code-muted);border-radius:0}
.dxc-tab[data-active=true] button[role=tab]{color:var(--code-fg)}
.dxc-tab button[role=tab]:hover:not(:disabled){background:transparent!important;color:var(--code-fg)}
.dxc-tab-name{display:block;overflow:hidden;text-overflow:ellipsis}
.dxc .dxc-tab-close{display:grid;place-items:center;width:18px;height:18px;padding:0!important;border:0!important;background:transparent!important;border-radius:4px;color:var(--code-muted);opacity:0}
.dxc-tab:hover .dxc-tab-close,.dxc-tab[data-active=true] .dxc-tab-close{opacity:1}
.dxc-tab-close:hover:not(:disabled){background:color-mix(in srgb,var(--code-fg) 12%,transparent)!important;color:var(--code-fg)}
.dxc-tab-menu-wrap{position:relative;margin-left:auto;display:flex;align-items:center;padding:0 4px;flex:none}
.dxc .dxc-tab-menu{display:grid;place-items:center;width:22px;height:22px;padding:0!important;border:0!important;background:transparent!important;color:var(--code-muted)}
.dxc-tab-popup{position:absolute;top:calc(100% + 2px);right:4px;z-index:20;display:flex;flex-direction:column;min-width:130px;padding:4px;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--code-line);border-radius:7px;box-shadow:0 8px 22px #0000001f}
.dxc-tab-popup button{border:0!important;background:transparent!important;text-align:left;font-size:11px!important;padding:5px 8px!important;border-radius:4px}
.dxc-tab-popup button:hover:not(:disabled){background:var(--code-soft)!important}
.dxc-viewer{display:flex;flex-direction:column;overflow:hidden;min-height:0;flex:1;outline:none}
.dxc-viewer-heading{display:flex;gap:10px;align-items:center;padding:6px 12px;flex:none;border-bottom:1px solid var(--code-line-soft);min-height:28px}
.dxc-breadcrumbs{display:flex;align-items:center;gap:1px;overflow:hidden;flex:1;font-size:11px;color:var(--code-muted);white-space:nowrap}
.dxc-crumb{display:inline-flex;align-items:center;gap:4px;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dxc-crumb[data-last]{color:var(--code-fg);flex:none;max-width:none}
.dxc-crumb-sep{display:grid;place-items:center;opacity:.55;flex:none}
.dxc-readonly{font-size:9px;letter-spacing:.04em;color:var(--code-muted);border:1px solid var(--code-line);padding:0 5px;border-radius:4px;flex:none;line-height:16px}
.dxc-viewer-controls{display:flex;justify-content:space-between;align-items:center;padding:5px 10px;gap:8px;flex-wrap:wrap;flex:none;border-bottom:1px solid var(--code-line-soft)}
.dxc-viewer-options{display:flex;gap:4px;align-items:center}
.dxc-viewer-options button,.dxc-viewer-options select{height:28px;font-size:12px;padding:0 10px}
.dxc-viewer-options select{max-width:150px}
.dxc-viewer-options button[aria-pressed=true]{border-color:var(--code-accent);color:var(--code-accent);background:color-mix(in srgb,var(--code-accent) 6%,var(--code-bg))}
.dxc-viewer-options .dxc-icon-button[aria-pressed=true]{border-color:transparent!important}
.dxc-code-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding-bottom:12px;font:12px/1.75 ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-variant-ligatures:none;tab-size:2}
.dxc-markdown{max-width:48rem;padding:8px 28px 40px;color:var(--code-fg);font:15px/1.7 var(--dsw-font-family,system-ui,sans-serif)}
.dxc .dxc-markdown :is(h1,h2,h3,h4,p,ul,ol,blockquote){margin:0.75em 0}
.dxc .dxc-markdown h1{margin-top:0.15em;font-size:1.55em;line-height:1.3;font-weight:650}
.dxc .dxc-markdown h2{font-size:1.25em;line-height:1.35;font-weight:650}
.dxc .dxc-markdown h3,.dxc .dxc-markdown h4{font-size:1.08em;font-weight:650}
.dxc .dxc-markdown :is(ul,ol){padding-inline-start:1.4em}
.dxc .dxc-markdown :not(pre)>code{padding:0.1em 0.35em;border-radius:4px;background:var(--code-soft);font:0.92em ui-monospace,SFMono-Regular,Consolas,monospace}
.dxc-code-scroll:has(.dxc-media){display:flex;flex-direction:column;padding-bottom:0}
.dxc-media{flex:1;min-height:0;display:flex;flex-direction:column}
.dxc-media-toolbar{display:flex;align-items:center;gap:4px;padding:6px 10px;border-bottom:1px solid var(--code-line-soft);background:var(--code-bg);flex:none}
.dxc-media-toolbar button{height:26px;padding:0 8px;font-size:11px}
.dxc-media-toolbar>span{font-size:11px;color:var(--code-muted);font-variant-numeric:tabular-nums;padding:0 4px}
.dxc-media-stage{flex:1;min-height:180px;overflow:auto;display:grid;place-items:center;padding:16px;background-color:var(--code-bg);background-image:linear-gradient(45deg,color-mix(in srgb,var(--code-fg) 8%,transparent) 25%,transparent 25%),linear-gradient(-45deg,color-mix(in srgb,var(--code-fg) 8%,transparent) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,color-mix(in srgb,var(--code-fg) 8%,transparent) 75%),linear-gradient(-45deg,transparent 75%,color-mix(in srgb,var(--code-fg) 8%,transparent) 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
.dxc-media-stage img{display:block;image-rendering:auto}
.dxc-media-stage[data-fit=true] img{max-width:100%;max-height:100%;object-fit:contain}
.dxc-player{place-items:center;align-items:center;justify-content:center;background:var(--code-bg);padding:28px 16px}
.dxc-player audio,.dxc-player video{width:min(720px,100%)}
.dxc-source-lines{padding:6px 0;min-width:max-content}
.dxc-source-line{display:grid;grid-template-columns:50px minmax(0,1fr);min-height:21px;padding-right:16px}
.dxc-source-line:hover{background:color-mix(in srgb,var(--code-fg) 3%,transparent)}
.dxc-line-number{font-size:10px;color:var(--code-muted);opacity:.75;text-align:right;padding:0 12px 0 6px;user-select:none;font-variant-numeric:tabular-nums}
.dxc-line-text{white-space:pre;display:block;padding-right:12px}
.dxc-line-text mark{background:#eecb6a66;color:inherit;border-radius:2px}
.dxc-code-scroll[data-wrap=true] .dxc-line-text{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
.dxc-code-scroll[data-wrap=true] .dxc-source-lines{min-width:0}
.dxc-code-scroll [data-focused=true]{background:color-mix(in srgb,var(--code-accent) 13%,var(--code-bg));box-shadow:inset 3px 0 var(--code-accent)}
.dxc-code-scroll [data-find-active=true]{box-shadow:inset 0 0 0 1px #cda74880;background:color-mix(in srgb,#eecb6a 13%,var(--code-bg))}
.dxc-hunk-header{font-size:10px;line-height:24px;white-space:nowrap;padding:0 12px;color:var(--code-muted);background:var(--code-soft);border-block:1px solid var(--code-line);position:sticky;left:0;overflow:hidden;text-overflow:ellipsis}
.dxc-hunk+.dxc-hunk{margin-top:10px}
.dxc-unified-row{display:grid;grid-template-columns:38px 38px 16px minmax(0,1fr);min-height:21px;min-width:max-content}
.dxc-unified-row .dxc-line-number{padding:0 6px}
.dxc-line-sign{text-align:center;color:var(--code-muted);user-select:none;font-size:11px}
.dxc-line-add{background:color-mix(in srgb,var(--code-success) 10%,var(--code-bg))}
.dxc-line-del{background:color-mix(in srgb,var(--code-danger) 10%,var(--code-bg))}
.dxc-line-add .dxc-line-sign{color:var(--code-success)}
.dxc-line-del .dxc-line-sign{color:var(--code-danger)}
.dxc-line-empty{background:var(--code-soft)}
.dxc-split-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.dxc-split-column{overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:thin}
.dxc-split-column:first-child{border-right:1px solid var(--code-line)}
.dxc-split-column .dxc-diff-cell{min-width:max-content;overflow:visible;border:0;height:21px}
.dxc-split-column .dxc-line-text{overflow:visible}
.dxc-split-column .dxc-hunk-header{height:26px}
.dxc-split-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.dxc-diff-cell{display:grid;grid-template-columns:36px 14px minmax(0,1fr);min-height:21px;overflow:hidden}
.dxc-diff-cell .dxc-line-text{overflow:hidden}
.dxc-diff-cell:first-child{border-right:1px solid var(--code-line)}
.dxc-diff-cell .dxc-line-number{padding:0 5px}
.dxc-code-scroll[data-wrap=true] .dxc-unified-row{min-width:0}
.dxc-find{display:flex;align-items:center;gap:4px;padding:5px 10px;background:var(--code-soft);border-bottom:1px solid var(--code-line)}
.dxc-find input{flex:1;width:50px}
.dxc-find>span{font-size:10px;color:var(--code-muted);padding:0 4px;white-space:nowrap}
.dxc-find button{display:grid;place-items:center;width:28px;height:28px;font-size:12px;padding:0}
.dxc-statusbar{display:flex;align-items:center;gap:12px;height:22px;padding:0 10px;border-top:1px solid var(--code-line);background:var(--code-sunken);font-size:10px;color:var(--code-muted);flex:none;overflow:hidden;white-space:nowrap}
.dxc-status-item{overflow:hidden;text-overflow:ellipsis}
.dxc-status-spacer{flex:1}
.dxc-state{padding:16px 14px;font:12px/1.7 system-ui,sans-serif;color:var(--code-muted)}
.dxc-state button{margin-top:10px}
.dxc-empty{display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;padding:45px 20px;color:var(--code-muted);text-align:center;font-size:12px;flex:1}
.dxc-empty>svg{width:28px;height:28px;margin-bottom:4px;opacity:.55}
.dxc-empty>span{font:26px/1.5 ui-monospace,monospace;opacity:.45;margin-bottom:7px}
.dxc-empty strong{font-weight:550;color:var(--code-fg)}
.dxc-code-empty{height:100%;min-height:180px}
.dxc-panel-empty{justify-content:flex-start;padding-top:44px;gap:7px}

/* Review panel: Problems list and the full review detail. */
.dxc-panel{border-left:1px solid var(--code-line);display:flex;flex-direction:column;overflow:hidden;min-height:0;background:var(--code-bg)}
.dxc-panel-tabs{display:flex;align-items:center;gap:2px;height:var(--code-tab-h);padding:0 6px;border-bottom:1px solid var(--code-line);background:var(--code-sunken);flex:none;overflow-x:auto;scrollbar-width:thin}
.dxc-panel-tabs button{position:relative;border:0!important;background:transparent!important;font-size:11px!important;padding:0 8px!important;height:100%;color:var(--code-muted);border-radius:0;display:flex;align-items:center;gap:5px;text-transform:uppercase;letter-spacing:.04em}
.dxc-panel-tabs button[aria-selected=true]{color:var(--code-fg)}
.dxc-panel-tabs button[aria-selected=true]::after{content:'';position:absolute;inset-inline:4px;bottom:0;height:1px;background:var(--code-accent)}
.dxc-panel-tabs .dxc-count{margin-left:0;background:color-mix(in srgb,var(--code-fg) 12%,transparent);color:var(--code-fg)}
.dxc-panel-body{flex:1;overflow:auto;min-height:0;padding-bottom:10px}
.dxc-panel-body:has(.dxc-chat-embed){display:flex;flex-direction:column;overflow:hidden;padding-bottom:0}
/* The embedded official Conversation owns its own scrollport, composer and draft. */
.dxc-chat-embed{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--code-bg)}
.dxc-chat-embed>[data-factory-error],.dxc-chat-embed>[data-slot]{display:flex;flex:1;min-height:0;flex-direction:column}
.dxc-chat-embed :is([data-slot=conversation.session],[data-slot=conversation.view]){display:flex;flex:1;min-height:0;flex-direction:column}
.dxc-chat-embed .dxc-state{padding:16px 14px}
/* The Code launcher is meaningless inside Code's own embedded conversation. */
.dxc-chat-embed [data-slot=conversation\.input\.dock] .dxc-dock{display:none}
.dxc-problems{padding:4px 0}
.dxc-problem-list{list-style:none;margin:0;padding:0}
.dxc-problem{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:'sev title' 'sev path';gap:1px 8px;width:100%;text-align:left;border:0!important;background:transparent!important;padding:5px 10px!important;border-radius:0}
.dxc-problem:hover:not(:disabled){background:color-mix(in srgb,var(--code-fg) 5%,transparent)!important}
.dxc-problem .dxc-severity{grid-area:sev;align-self:center}
.dxc-problem-title{grid-area:title;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxc-problem-path{grid-area:path;font:10px/1.5 ui-monospace,monospace;color:var(--code-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxc-panel-filter{padding:8px 10px 0}
.dxc-severity-filter{max-width:100%!important;font-size:11px!important;padding:3px 6px!important}
.dxc-review-summary{padding:10px 12px;border-bottom:1px solid var(--code-line)}
.dxc-review-state{display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:3px}
.dxc-review-summary time{display:block;font-size:10px;margin-top:3px}
.dxc-review-summary details{margin-top:7px}
.dxc-notice{padding:9px 11px;margin:9px 10px 0;background:var(--code-soft);border:1px solid var(--code-line);border-radius:6px;font-size:11px}
.dxc-notice p{margin-top:4px;line-height:1.55;color:var(--code-muted)}
.dxc-notice.dxc-warning{border-color:color-mix(in srgb,var(--code-warning) 28%,var(--code-line));background:color-mix(in srgb,var(--code-warning) 5%,var(--code-bg))}
.dxc-findings-list{padding:0 10px}
.dxc-finding{margin:9px 0;padding:10px;background:var(--code-bg);border:1px solid var(--code-line);border-radius:7px}
.dxc-finding-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.dxc-finding-id{font:9px/1.5 ui-monospace,monospace;color:var(--code-muted)}
.dxc-severity{font-size:9px;line-height:1.8;padding:0 5px;border-radius:4px;background:var(--code-soft);color:var(--code-muted);font-weight:600;white-space:nowrap;text-transform:uppercase;letter-spacing:.02em}
.dxc-severity-critical,.dxc-severity-high{background:color-mix(in srgb,var(--code-danger) 12%,var(--code-bg));color:var(--code-danger)}
.dxc-severity-medium{background:color-mix(in srgb,var(--code-warning) 12%,var(--code-bg));color:var(--code-warning)}
.dxc-severity-low,.dxc-severity-info{background:color-mix(in srgb,var(--code-accent) 10%,var(--code-bg));color:var(--code-accent)}
.dxc-finding-title{display:block;text-align:left;border:0!important;background:transparent!important;padding:0!important;font-size:12px!important;line-height:1.55!important;font-weight:600;white-space:normal!important;border-radius:0}
.dxc-finding-title:hover:not(:disabled){background:transparent!important;color:var(--code-accent)}
.dxc-location{font:10px/1.5 ui-monospace,monospace!important;color:var(--code-accent)!important;border:0!important;background:transparent!important;padding:3px 0!important;display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;border-radius:0}
.dxc-location:hover:not(:disabled){background:transparent!important;text-decoration:underline}
.dxc-location span{color:var(--code-muted)}
.dxc-finding-body{font-size:11px;margin:4px 0 8px!important;line-height:1.65;overflow-wrap:anywhere}
.dxc-finding details{border-top:1px solid var(--code-line);padding-top:6px}
.dxc-detail-label{font-size:10px;font-weight:550;color:var(--code-muted);display:block;margin-top:8px}
.dxc-finding pre{padding:7px;background:var(--code-soft);border-radius:4px}
.dxc-no-findings{padding:22px 3px;color:var(--code-muted);font-size:12px}
.dxc-checks{border-top:1px solid var(--code-line);padding:10px 0;margin-top:8px}
.dxc-checks>p{margin:8px 14px}
.dxc-checks ul{padding:0 14px;margin:8px 0 0;list-style:none}
.dxc-checks li{display:flex;justify-content:space-between;gap:7px;flex-wrap:wrap;font-size:11px;margin:6px 0}
.dxc-checks li>span:first-child{flex:1;overflow-wrap:anywhere}
.dxc-checks details{width:100%}
.dxc-findings-actions{display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-top:1px solid var(--code-line);margin-top:auto;background:var(--code-bg)}
.dxc-findings-actions button{font-size:12px}
.dxc-history{padding:12px 14px 4px;border-top:1px solid var(--code-line)}
.dxc-history ol{list-style:none;margin:8px 0 0;padding:0}
.dxc-history-item{display:flex;flex-direction:column;gap:3px;text-align:left;font-size:10px!important;width:100%;background:transparent!important;border-color:transparent!important;border-radius:5px}
.dxc-history-item:hover:not(:disabled){background:color-mix(in srgb,var(--code-fg) 6%,transparent)!important}
.dxc-history-item[aria-pressed=true]{border-color:var(--code-accent)!important;color:var(--code-accent)}
.dxc-history-item time{color:var(--code-muted)}

/* Resizable separators: a 4px track with a visible hover/active grip. */
.dxc-splitter{position:relative;display:flex;align-items:center;justify-content:center;cursor:col-resize;touch-action:none;outline:none;background:transparent;z-index:3}
.dxc-splitter::before{content:'';position:absolute;inset-block:0;inset-inline-start:50%;width:1px;margin-inline-start:-.5px;background:var(--code-line)}
.dxc-splitter-grip{position:relative;width:3px;height:28px;border-radius:2px;background:transparent;transition:background .12s}
.dxc-splitter:hover .dxc-splitter-grip,.dxc-splitter[data-dragging=true] .dxc-splitter-grip{background:var(--code-accent)}
.dxc-splitter:focus-visible .dxc-splitter-grip{background:var(--code-accent)}
.dxc-splitter[data-dragging=true]::before,.dxc-splitter:hover::before{background:var(--code-accent)}
.dxc-splitter[data-dragging=true]{background:color-mix(in srgb,var(--code-accent) 8%,transparent)}
.dxc-page[data-sidebar=false] .dxc-track-activity{grid-column:1}
.dxc-page[data-panel=false] .dxc-panel,.dxc-page[data-panel=false] .dxc-track-panel-splitter{display:none}

/* Composer dock entry and tool row keep the shared Harness look. */
.dxc-mobile-tabs{display:none}
.dxc-dock{box-sizing:border-box;flex:none;width:calc(100% - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));max-width:calc(var(--dsh-composer-card-max-width,952px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));margin:0 auto;padding:0 var(--dsh-composer-dock-inset,8px)}
.dxc-entry{box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;height:32px;margin:0;padding:0 10px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary,#20252e);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;font-weight:500;line-height:20px;text-align:left;white-space:nowrap;cursor:pointer}
.dxc-entry:hover{background:var(--dsw-alias-bg-layer-2,#f2f3f5)}
.dxc-entry:active{background:var(--dsw-alias-bg-layer-2,#e9ebee)}
.dxc-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:-2px}
.dxc-entry-icon{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-secondary,#717885)}
.dxc-entry-icon svg{width:16px;height:16px}
.dxc-entry-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dxc-entry-go{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-secondary,#717885);opacity:.75}
.dxc-tool{padding:12px}
.dxc-tool header{display:flex;align-items:center;gap:7px}
.dxc-tool header>span{font-size:11px;color:var(--code-muted);margin-left:auto}
.dxc-tool p{margin:8px 0;color:var(--code-muted);font-size:12px}
.dxc-tool button{height:28px;font-size:12px;padding:0 10px}

/* Narrow workbench: one pane at a time, chosen by the mobile tabs. */
@container(max-width:699px){.dxc-workbench{display:block;position:relative}.dxc-track-activity,.dxc-splitter,.dxc-statusbar{display:none}.dxc-mobile-tabs{display:flex;margin:8px 12px}.dxc-sidebar,.dxc-editor,.dxc-panel{display:none;height:100%;border:0;min-height:0;grid-column:auto;grid-row:auto}.dxc-page[data-pane=files] .dxc-sidebar{display:flex}.dxc-page[data-pane=code] .dxc-editor{display:flex}.dxc-page[data-pane=findings] .dxc-panel{display:flex}.dxc-file-list{padding-inline:8px}.dxc-findings-actions{flex-direction:row;justify-content:flex-end;flex-wrap:wrap}.dxc-findings-actions>p{width:100%}.dxc-findings-actions button{min-width:120px}}
@container(max-width:560px){.dxc-titlebar{padding:0 8px;gap:8px;height:44px}.dxc-header-actions{gap:4px}.dxc-header-actions>button{font-size:12px;padding:0 8px}.dxc-brand{gap:6px}.dxc-brand h1{font-size:13px}.dxc-repo{max-width:110px;font-size:12px}.dxc-toolbar{padding:6px 8px;gap:6px}.dxc-toolbar select{font-size:12px}.dxc-scope{gap:6px;flex-wrap:wrap}.dxc-scope label{display:none}.dxc-scope input{width:110px;font-size:12px!important}.dxc-banner{padding:7px 10px;font-size:12px}.dxc-viewer-heading{padding:5px 8px}.dxc-readonly{font-size:8px}.dxc-split-control{display:none}.dxc-split-row{grid-template-columns:1fr}.dxc-diff-cell:first-child{border-right:0}.dxc-diff-cell.dxc-line-context:first-child{display:none}.dxc-diff-cell.dxc-line-empty{display:none}.dxc-code-scroll{font-size:11px}.dxc-findings-actions button{min-width:0;flex:1}.dxc-find>span{font-size:9px}.dxc-find{padding-inline:8px}.dxc-source-line{grid-template-columns:40px minmax(0,1fr)}.dxc-source-line .dxc-line-number{padding-right:9px}.dxc-tab{max-width:160px}}
@media(max-height:520px){.dxc-page{overflow-y:auto}.dxc-workbench{flex:1 0 260px;min-height:260px}}
@media(prefers-reduced-motion:reduce){.dxc *{scroll-behavior:auto!important;transition:none!important}}
`
