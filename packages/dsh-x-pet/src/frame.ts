/**
 * The detached pet window's document.
 *
 * A separate window has its own origin and no Client store, so this page reads
 * the Host's `/api/dsh-x-pet/state` fold instead of the app's session hooks.
 * The Host also ships the frame plan, so the animation never drifts from the
 * in-app sprite: the page only paints what it is told.
 */
const PAGE_CSS = `
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:12px/1.4 system-ui,sans-serif;-webkit-user-select:none;user-select:none}
.dxp{position:fixed;inset:0;pointer-events:none}
.dxp-stage{position:absolute;right:20px;bottom:20px;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:auto;touch-action:none}
.dxp-sprite{width:112px;aspect-ratio:192/208;background-repeat:no-repeat;background-size:800% 1100%;image-rendering:pixelated;border:0;padding:0;background-color:transparent;filter:drop-shadow(0 6px 10px rgba(15,23,42,.18));cursor:grab}
.dxp-sprite:active{cursor:grabbing}
.dxp-bubble{position:relative;display:flex;align-items:center;gap:6px;max-width:240px;padding:7px 10px;border-radius:12px;background:#fff;color:#20252e;border:1px solid #d7dbe2;box-shadow:0 8px 20px rgba(15,23,42,.16);opacity:0;transform:translateY(4px);transition:opacity .18s ease,transform .18s ease}
.dxp-bubble[data-show=true]{opacity:1;transform:none}
.dxp-bubble::after{content:"";position:absolute;left:50%;bottom:-5px;width:8px;height:8px;margin-left:-4px;transform:rotate(45deg);background:inherit;border-right:1px solid #d7dbe2;border-bottom:1px solid #d7dbe2}
.dxp-text{display:flex;flex-direction:column;gap:1px;min-width:0;text-align:left}
.dxp-title{font-size:11px;font-weight:600;color:#717885;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px}
.dxp-detail{font-size:12px;overflow-wrap:anywhere}
.dxp-check{color:#12805c;margin-right:3px;font-weight:700}
.dxp-more{flex:none;min-width:24px;height:20px;padding:0 5px;border:1px solid #d7dbe2;border-radius:999px;background:#f4f5f7;color:#717885;font:inherit;font-size:10px}
.dxp-close{flex:none;width:18px;height:18px;padding:0;border:0;border-radius:999px;background:transparent;color:#8a919c;font:inherit;font-size:13px;line-height:1;cursor:pointer}
.dxp-close:hover{background:#e9ebef;color:#20252e}
.dxp-hide{position:absolute;right:-4px;bottom:-4px;width:20px;height:20px;padding:0;border:1px solid #d7dbe2;border-radius:999px;background:#fff;color:#717885;font:inherit;font-size:12px;line-height:1;cursor:pointer;opacity:0;transition:opacity .16s ease}
.dxp-stage:hover .dxp-hide{opacity:1}
@media (prefers-color-scheme:dark){.dxp-bubble{background:#232830;color:#e8eaee;border-color:#3a404b}.dxp-title{color:#9aa3af}.dxp-close:hover{background:#2f3540}}
@media (prefers-reduced-motion:reduce){.dxp-bubble{transition:none}}
`

const PAGE_JS = `
const API = (endpoint, payload) => fetch('/api/' + endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: endpoint, payload }),
}).then(async response => {
  const body = await response.json()
  // The connection frames every answer as { type, rpcId, result }; the route's
  // own { ok, value } lives one level down.
  const result = body && body.result ? body.result : body
  if (!result || result.ok !== true) throw new Error((result && result.error && result.error.code) || 'PET_RPC')
  return result.value
})

const zh = (navigator.language || '').toLowerCase().startsWith('zh')
const say = {
  tool: (tool) => zh ? '正在用 ' + tool : 'Running ' + tool,
  thinking: () => zh ? '思考中' : 'Thinking',
  idle: () => zh ? '空闲' : 'Idle',
  untitled: () => zh ? '新对话' : 'New conversation',
  close: () => zh ? '收起这条提示' : 'Hide this bubble',
  closeWindow: () => zh ? '关掉桌面宠物窗口' : 'Close the pet window',
  more: (n) => zh ? n + ' 个对话在进行' : n + ' conversations active',
}

const stage = document.querySelector('.dxp-stage')
const sprite = document.querySelector('.dxp-sprite')
const bubble = document.querySelector('.dxp-bubble')
const titleEl = document.querySelector('.dxp-title')
const detailEl = document.querySelector('.dxp-detail')
const moreEl = document.querySelector('.dxp-more')
const closeEl = document.querySelector('.dxp-close')

closeEl.title = say.close()
closeEl.addEventListener('click', () => { hiddenFor = lineKey; bubble.dataset.show = 'false' })

const hideEl = document.querySelector('.dxp-hide')
hideEl.title = say.closeWindow()
hideEl.addEventListener('click', () => {
  if (bridge && typeof bridge.close === 'function') bridge.close()
  else bubble.dataset.show = 'false'
})

window.addEventListener('resize', reportRect)
window.addEventListener('load', reportRect)
setTimeout(reportRect, 0)

let rows = 11
let atlas = { id: null, url: null, rows: 0 }
let plan = null, planKey = '', timer = null, index = 0
let lineKey = '', hiddenFor = ''

function reportRect() {
  if (!bridge || typeof bridge.rect !== 'function') return
  const box = sprite.getBoundingClientRect()
  bridge.rect(box.left, box.top, box.width, box.height)
}

async function ensureAtlas(id, nextRows) {
  if (!id) {
    if (atlas.url) URL.revokeObjectURL(atlas.url)
    atlas = { id: null, url: null, rows: 0 }
    sprite.style.backgroundImage = 'none'
    return
  }
  if (atlas.id === id && atlas.rows === nextRows) return
  const response = await fetch('/api/dsh-x-pet/atlas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'dsh-x-pet/atlas', payload: { id } }),
  })
  if (!response.ok) return
  const url = URL.createObjectURL(await response.blob())
  if (atlas.url) URL.revokeObjectURL(atlas.url)
  atlas = { id, url, rows: nextRows }
  sprite.style.backgroundImage = 'url(' + url + ')'
  sprite.style.backgroundSize = '800% ' + (nextRows * 100) + '%'
  reportRect()
}

function play(next) {
  const key = next.frames.map((frame) => frame.row + ':' + frame.column).join(',') + '|' + next.loopStart
  if (key === planKey) return
  planKey = key
  plan = next
  index = 0
  if (timer !== null) clearTimeout(timer)
  if (!plan.frames.length) return
  const step = () => {
    const frame = plan.frames[index]
    sprite.style.backgroundPosition = (frame.column / 7 * 100) + '% ' + (frame.row / Math.max(1, rows - 1) * 100) + '%'
    timer = setTimeout(() => {
      const nextIndex = index + 1
      if (nextIndex >= plan.frames.length) {
        if (plan.loopStart === null) return
        index = plan.loopStart
      } else index = nextIndex
      step()
    }, frame.durationMs)
  }
  step()
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes + ':' + String(seconds).padStart(2, '0')
}

function render(value) {
  rows = value.rows || 11
  if (value.active) void ensureAtlas(value.active, rows)
  else void ensureAtlas(null, rows)
  if (value.playback) play(value.playback)

  const facts = value.facts || {}
  const running = facts.state === 'running'
  const activity = facts.phase === 'tool' ? say.tool(facts.tool || '—') : facts.phase === 'thinking' ? say.thinking() : say.idle()
  const detail = facts.elapsedMs === null ? activity : activity + ' · ' + formatElapsed(facts.elapsedMs)
  const nextKey = (facts.sessionId || '') + ':' + (facts.phase || 'idle')
  if (nextKey !== lineKey) { lineKey = nextKey; if (hiddenFor !== nextKey) hiddenFor = '' }

  titleEl.textContent = facts.title || say.untitled()
  detailEl.textContent = detail
  moreEl.hidden = !(facts.count > 1)
  moreEl.textContent = '+' + Math.max(0, (facts.count || 0) - 1)
  moreEl.title = say.more(facts.count || 0)
  bubble.dataset.tone = running ? 'working' : 'done'
  bubble.dataset.show = hiddenFor === lineKey ? 'false' : 'true'
}

async function poll() {
  try { render(await API('dsh-x-pet/state', {})) }
  catch { bubble.dataset.show = 'false' }
  setTimeout(poll, 2000)
}
poll()

// In the Desktop pet window the sprite moves the whole OS window; a browser tab
// has no bridge, so the same drag falls back to moving the stage inside it.
const bridge = (typeof window !== 'undefined' && window.dshDesktopPet) || null
if (bridge && typeof bridge.hover === 'function') {
  window.addEventListener('mousemove', (event) => {
    const box = sprite.getBoundingClientRect()
    const over = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
    bridge.hover(over)
  })
}
// Dragging only moves the whole window in the native shell; with no bridge it
// moves the stage inside a browser tab. The listeners live on the window,
// because the pointer leaves this small sprite as soon as the window follows it.
let drag = null
const onDragMove = (event) => {
  if (!drag) return
  const dx = event.clientX - drag.x
  const dy = event.clientY - drag.y
  if (!dx && !dy) return
  drag = { x: event.clientX, y: event.clientY }
  if (bridge && typeof bridge.move === 'function') { void bridge.move(dx, dy); return }
  const right = parseFloat(getComputedStyle(stage).right) || 0
  const bottom = parseFloat(getComputedStyle(stage).bottom) || 0
  stage.style.right = Math.max(-40, right - dx) + 'px'
  stage.style.bottom = Math.max(-40, bottom - dy) + 'px'
}
const release = () => {
  drag = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', release)
  window.removeEventListener('pointercancel', release)
}
sprite.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  drag = { x: event.clientX, y: event.clientY }
  sprite.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
})
`

/** One self-contained document: no bundle, no Client runtime, no build step. */
export function petFramePage(): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>dsh-x-pet</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${PAGE_CSS}</style></head>
<body>
<div class="dxp">
  <div class="dxp-stage">
    <div class="dxp-bubble" data-show="false">
      <span class="dxp-text"><strong class="dxp-title"></strong><span class="dxp-detail"></span></span>
      <button type="button" class="dxp-more" hidden></button>
      <button type="button" class="dxp-close" aria-label="close">×</button>
    </div>
    <button type="button" class="dxp-sprite" aria-label="dsh pet"></button>
    <button type="button" class="dxp-hide" aria-label="close">×</button>
  </div>
</div>
<script>${PAGE_JS}</script>
</body></html>`
}
