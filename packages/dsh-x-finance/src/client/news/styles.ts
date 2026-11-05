// News panel: a timeline anchored on publish time, plus the session swings that
// sit next to it. The helper lines stay quieter than the headlines so a dense
// list still scans by title.
export const NEWS_CSS = `
.dxs-news{padding:18px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;margin-bottom:16px;min-width:0}
.dxs-news-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.dxs-news-source{margin:0!important;font-size:12px;min-width:0;overflow-wrap:anywhere}
.dxs-news-refresh{margin-left:auto}
.dxs-news h3{font-size:13px;font-weight:600;margin:0}
.dxs-news-empty{padding:24px 16px;text-align:center;border:1px dashed var(--dsw-alias-border-l2,#ccc);border-radius:10px}
.dxs-news-empty p{margin:6px 0 0!important}
.dxs-news-empty strong{display:block;font-size:13px}
.dxs-news-empty>div{margin-top:10px}
.dxs-news-partial{margin:0 0 10px!important;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#b97700) 10%,transparent);font-size:12px}
.dxs-news-moves{border:1px solid var(--dxs-line);border-radius:10px;padding:12px;margin-bottom:16px;background:var(--dxs-soft)}
.dxs-news-moves-head{display:grid;gap:4px;margin-bottom:8px}
.dxs-news-moves-head p{margin:0!important;font-size:11px}
.dxs-news-moves-list{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.dxs-news-moves-list>li{border-top:1px solid var(--dxs-line);padding-top:10px}
.dxs-news-moves-list>li:first-child{border-top:0;padding-top:0}
.dxs-news-move-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12px}
.dxs-news-move-head strong{font-variant-numeric:tabular-nums;font-weight:600}
.dxs-news-move-news{list-style:none;padding:0;margin:6px 0 0;display:grid;gap:2px}
.dxs-news-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.dxs-news-filters button[aria-pressed="true"]{border-color:var(--dxs-accent);color:var(--dxs-accent);background:color-mix(in srgb,var(--dxs-accent) 8%,var(--dxs-bg))}
.dxs-news-list-head{display:flex;align-items:baseline;gap:8px;justify-content:space-between;margin-bottom:6px}
.dxs-news-list{list-style:none;padding:0;margin:0}
.dxs-news-item{display:grid;grid-template-columns:52px minmax(0,1fr);gap:2px 12px;padding:9px 0;border-bottom:1px solid var(--dxs-line-soft)}
.dxs-news-item:last-child{border-bottom:0}
.dxs-news-item.is-compact{padding:5px 0;border-bottom:0}
.dxs-news-clock{display:grid;gap:1px;font-size:11px;color:var(--dxs-muted);font-variant-numeric:tabular-nums;text-align:right;padding-top:1px}
.dxs-news-day{font-size:10px}
.dxs-news-main{min-width:0}
.dxs-news-title{margin:0!important;font-size:13px;font-weight:550;line-height:1.45}
.dxs-news-title a{color:inherit;text-decoration:none}
.dxs-news-title a:hover{text-decoration:underline;text-underline-offset:2px}
.dxs-news-summary{margin:3px 0 0!important;font-size:12px;color:var(--dxs-muted)}
.dxs-news-meta{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;margin:4px 0 0!important;font-size:11px;color:var(--dxs-muted)}
.dxs-news-media{font-weight:500}
.dxs-news-fact{font-variant-numeric:tabular-nums}
.dxs-news-symbols{display:inline-flex;gap:4px;flex-wrap:wrap}
.dxs .dxs-news-symbol{height:18px;padding:0 6px;font-size:11px;border-radius:999px;border:1px solid var(--dxs-line);background:var(--dxs-bg);color:var(--dxs-accent)}
.dxs .dxs-news-symbol:hover{background:color-mix(in srgb,var(--dxs-accent) 8%,var(--dxs-bg))}
.dxs-news-note{font-size:11px;margin:8px 0 0!important}
.dxs-news-boundary{font-size:11px;color:var(--dxs-muted);margin:12px 0 0!important;padding-top:10px;border-top:1px solid var(--dxs-line-soft)}
@media(max-width:650px){.dxs-news{padding:12px}.dxs-news-item{grid-template-columns:44px minmax(0,1fr)}.dxs-news-refresh{margin-left:0}}
`
