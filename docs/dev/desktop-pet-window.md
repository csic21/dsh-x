# 桌面宠物窗口（桌面端改动）

`dsh-x-pet` 已经能把宠物渲染成独立页 `GET /api/dsh-x-pet/frame`，但真正的「悬浮在桌面、
不被 DSH 主窗口裁剪」需要桌面端开一个窗口。桌面应用（`@deepseek-ai/dsh-desktop`）不在本仓库，
这里给出可直接落地的三处改动。

## 已确认的前置事实

以 0.2.1-rc.2 的 `app.asar/lib/main.js` 为准：

- `applicationUrl = 'dsh-app://app/'`（约 12134 行）。
- `protocol.handle(SCHEME, …)`（12406 行）把 `dsh-app://app` 下非静态资源一律透传给
  Host，并附上 `hostCookie`。所以 `dsh-app://app/api/dsh-x-pet/frame` 能直接打开，
  页面里的相对 `/api/*` 请求天然带 cookie，不需要额外鉴权。
- `assertDesktopSender(event, ['app'])`（约 7010 行）校验 IPC 来源，宠物窗口的 hostname
  也是 `app`，可直接复用。
- 主窗口 `window.open` 被 `setWindowOpenHandler(() => ({ action: 'deny' }))`（8692 行）拒绝，
  所以插件侧只能降级为浏览器弹窗。
- 主窗口 preload 是 `lib/preload-app.cjs`，用 `contextBridge` 暴露 `window.dshDesktop`。

## 1. 新文件 `lib/types/pet-window.js`

```js
import { BrowserWindow, screen } from 'electron'

const PET_WIDTH = 280
const PET_HEIGHT = 340

/**
 * One desktop pet window: frameless, transparent, above every workspace.
 * The document moves itself, so this module owns only lifecycle and hit testing.
 * @param {{ preload: string, entry: string }} options
 */
export function createPetWindow({ preload, entry }) {
  let window

  const place = () => {
    const { workArea } = screen.getPrimaryDisplay()
    return {
      x: Math.round(workArea.x + workArea.width - PET_WIDTH - 24),
      y: Math.round(workArea.y + workArea.height - PET_HEIGHT - 24),
    }
  }

  const open = () => {
    if (window !== undefined && !window.isDestroyed()) {
      window.showInactive()
      return window
    }
    window = new BrowserWindow({
      ...place(),
      width: PET_WIDTH,
      height: PET_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      title: 'dsh pet',
      webPreferences: {
        preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })
    window.setAlwaysOnTop(true, 'floating')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    // Clicks pass through until the page says the pointer is over the sprite.
    window.setIgnoreMouseEvents(true, { forward: true })
    window.once('ready-to-show', () => window.showInactive())
    window.once('closed', () => { window = undefined })
    void window.loadURL(entry)
    return window
  }

  const close = () => {
    if (window !== undefined && !window.isDestroyed()) window.close()
    window = undefined
  }

  const toggle = () => {
    if (window !== undefined && !window.isDestroyed()) close()
    else open()
  }

  /** Move by a pointer delta, so dragging the sprite drags the whole window. */
  const moveBy = (dx, dy) => {
    if (window === undefined || window.isDestroyed()) return
    const [x, y] = window.getPosition()
    window.setPosition(Math.round(x + dx), Math.round(y + dy), false)
  }

  /** Only the sprite is clickable; everything else stays transparent to input. */
  const hover = (over) => {
    if (window === undefined || window.isDestroyed()) return
    window.setIgnoreMouseEvents(over !== true, { forward: true })
  }

  return { open, close, toggle, moveBy, hover }
}
```

## 2. `lib/main.js` 接线

在 `DESKTOP_IPC`（约 6981 行）里加三个通道：

```js
petWindowOpen: 'dsh-desktop:pet-window-open',
petWindowMove: 'dsh-desktop:pet-window-move',
petWindowHover: 'dsh-desktop:pet-window-hover',
```

在 `applicationUrl` 已经确定之后创建实例，并注册处理器：

```js
import { createPetWindow } from './types/pet-window.js'

const petWindow = createPetWindow({
  preload: fileURLToPath(new URL('./preload-pet.cjs', import.meta.url)),
  entry: `${SCHEME}://app/api/dsh-x-pet/frame`,
})

ipcMain.handle(DESKTOP_IPC.petWindowOpen, (event) => {
  assertDesktopSender(event, ['app'])
  petWindow.toggle()
})

ipcMain.handle(DESKTOP_IPC.petWindowMove, (event, dx, dy) => {
  assertDesktopSender(event, ['app'])
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('dsh desktop: pet move needs finite numbers')
  petWindow.moveBy(dx, dy)
})

ipcMain.handle(DESKTOP_IPC.petWindowHover, (event, over) => {
  assertDesktopSender(event, ['app'])
  petWindow.hover(over === true)
})
```

生命周期：`app.on('will-quit', () => petWindow.close())`，需要跟随主窗口就在
`mainWindow` 的 `closed` 里再关一次。

## 3. 新文件 `lib/preload-pet.cjs`

宠物窗口用专属 preload，避免把整个 `dshDesktop` 面（引导、更新、目录选择）暴露给这一页：

```js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktopPet', {
  move: (dx, dy) => ipcRenderer.invoke('dsh-desktop:pet-window-move', dx, dy),
  hover: (over) => ipcRenderer.invoke('dsh-desktop:pet-window-hover', over === true),
  open: () => ipcRenderer.invoke('dsh-desktop:pet-window-open'),
})
```

另外在 `lib/preload-app.cjs` 的 `dshDesktop` 对象里加一项，让主窗口的宠物气泡能叫出这个窗口：

```js
petWindow: { open: () => ipcRenderer.invoke('dsh-desktop:pet-window-open') },
```

## 插件侧契约（已实现）

- 气泡控制条上的「独立窗口」按钮：先试 `window.dshDesktop.petWindow.open()`，
  没有就退回 `window.open('/api/dsh-x-pet/frame', …)`（浏览器里可用）。
- 页面拖动：存在 `window.dshDesktopPet` 时移动整个 OS 窗口，否则只移动页内舞台。
- 页面指针穿透：`dshDesktopPet.hover(over)`，靠转发的 `mousemove` 判断指针是否落在精灵上。

## 验收清单

- 打开后窗口在主屏右下，无边框、透明、置顶、切 Space 仍可见。
- 精灵以外的区域点击穿透到下面的应用，精灵本身可点。
- 拖动精灵时整个窗口跟手，松手位置保留。
- 关闭主窗口后宠物窗口一并关闭，不残留进程。
