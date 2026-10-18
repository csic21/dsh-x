import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMacHelper, buildWindowsHelper, appUpdateSupported } from '../src/app-update.ts'
import type { PendingAppUpdate } from '../src/types.ts'

const pending: PendingAppUpdate = {
  schema: 1,
  kind: 'app',
  tag: 'desktop-v0.1.2',
  version: '0.1.2',
  kernelVersion: '0.2.1-rc.2',
  target: 'macos-arm64',
  installer: '/Users/test/Library/Application Support/DSH-X/updates/app/desktop-v0.1.2/DSH-X-0.1.2-mac-arm64-preview.dmg',
  sha256: 'a'.repeat(64),
  installRoot: '/Applications',
  appPath: '/Applications/DSH-X.app',
  createdAt: '2026-10-18T00:00:00.000Z',
}

test('macOS helper waits for the host, verifies the image and restores on failure', () => {
  const script = buildMacHelper({ pending, hostPid: 4321, logPath: '/tmp/dsh-x-update.log' })
  assert.match(script, /while kill -0 4321/)
  assert.match(script, /shasum -a 256/)
  assert.match(script, /hdiutil attach/)
  assert.match(script, /mv "\$BACKUP" "\$TARGET"/)
  assert.match(script, /open "\$TARGET"/)
  assert.match(script, /'\/Applications\/DSH-X\.app'/)
})

test('Windows helper waits for the install root and runs the silent installer', () => {
  const script = buildWindowsHelper({ pending: { ...pending, target: 'windows-x64', appPath: 'C:\\DSH-X\\DSH-X.exe', installRoot: 'C:\\DSH-X', installer: 'C:\\Temp\\DSH-X.exe' }, hostPid: 987, logPath: 'C:\\Temp\\update.log' })
  assert.match(script, /Get-Process -Id 987/)
  assert.match(script, /Get-CimInstance Win32_Process/)
  assert.match(script, /Get-FileHash -Algorithm SHA256/)
  assert.match(script, /'\/S'/)
  assert.match(script, /'\/D=C:\\DSH-X'/)
  assert.match(script, /Start-Process -FilePath 'C:\\DSH-X\\DSH-X\.exe'/)
})

test('only desktop platforms have an automatic app updater', () => {
  assert.equal(appUpdateSupported('darwin'), true)
  assert.equal(appUpdateSupported('win32'), true)
  assert.equal(appUpdateSupported('linux'), false)
})
