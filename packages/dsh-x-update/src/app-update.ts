import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sanitizeTag } from './stage.ts'
import type { PendingAppUpdate } from './types.ts'

type SpawnLike = typeof spawn

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function powerShellQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function buildMacHelper(options: {
  pending: PendingAppUpdate
  hostPid: number
  logPath: string
}): string {
  const { pending, hostPid, logPath } = options
  return `#!/bin/sh
set -eu
exec >>${shellQuote(logPath)} 2>&1
echo "[dsh-x] update ${pending.tag} waiting for host ${hostPid}"
TARGET=${shellQuote(pending.appPath)}
VERSION=${shellQuote(pending.version)}
KERNEL=${shellQuote(pending.kernelVersion)}
while kill -0 ${hostPid} 2>/dev/null; do sleep 1; done
sleep 2
WAITED=0
while pgrep -f "$TARGET/Contents/MacOS/" >/dev/null 2>&1 || pgrep -f "$TARGET/Contents/Resources/runtime/" >/dev/null 2>&1; do
  WAITED=$((WAITED + 1))
  [ "$WAITED" -ge 120 ] && { echo "timed out waiting for application processes"; exit 1; }
  sleep 1
done
EXPECTED=${shellQuote(pending.sha256)}
ACTUAL=$(shasum -a 256 ${shellQuote(pending.installer)} | awk '{print $1}')
[ "$ACTUAL" = "$EXPECTED" ] || { echo "installer checksum mismatch"; exit 1; }
MOUNT=$(mktemp -d "\${TMPDIR:-/tmp}/dsh-x-update.XXXXXX")
cleanup() { hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true; rmdir "$MOUNT" 2>/dev/null || true; }
trap cleanup EXIT
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT" ${shellQuote(pending.installer)}
SOURCE=$(find "$MOUNT" -maxdepth 1 -name '*.app' -print -quit)
[ -n "$SOURCE" ] || { echo "no application in the downloaded image"; exit 1; }
STAGE="\${TARGET}.update.$$"
BACKUP="\${TARGET}.backup.$$"
ditto "$SOURCE" "$STAGE"
DIST="$STAGE/Contents/Resources/distribution.json"
[ -f "$DIST" ] || { echo "downloaded application has no distribution manifest"; exit 1; }
grep -Eq "\\"version\\"[[:space:]]*:[[:space:]]*\\"$VERSION\\"" "$DIST" || { echo "downloaded application version mismatch"; exit 1; }
grep -Eq "\\"kernelVersion\\"[[:space:]]*:[[:space:]]*\\"$KERNEL\\"" "$DIST" || { echo "downloaded application kernel mismatch"; exit 1; }
mv "$TARGET" "$BACKUP"
if mv "$STAGE" "$TARGET"; then
  rm -rf "$BACKUP"
else
  mv "$BACKUP" "$TARGET"
  echo "replacement failed; previous application restored"
  exit 1
fi
if [ "\${DSH_X_UPDATE_NO_LAUNCH:-0}" != "1" ]; then open "$TARGET" || true; fi
`
}

export function buildWindowsHelper(options: {
  pending: PendingAppUpdate
  hostPid: number
  logPath: string
}): string {
  const { pending, hostPid, logPath } = options
  return `$ErrorActionPreference = 'Stop'
Start-Transcript -Path ${powerShellQuote(logPath)} -Append
try {
  while (Get-Process -Id ${hostPid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 1 }
  Start-Sleep -Seconds 2
  $prefix = ${powerShellQuote(pending.installRoot.replace(/[\\/]+$/, '') + '\\')}
  $deadline = (Get-Date).AddMinutes(5)
  $running = @()
  while ((Get-Date) -lt $deadline) {
    $running = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) })
    if ($running.Count -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($running.Count -gt 0) { throw 'DSH-X processes are still running' }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath ${powerShellQuote(pending.installer)}).Hash.ToLowerInvariant()
  if ($actual -ne ${powerShellQuote(pending.sha256)}) { throw 'installer checksum mismatch' }
  $result = Start-Process -FilePath ${powerShellQuote(pending.installer)} -ArgumentList @('/S', ${powerShellQuote(`/D=${pending.installRoot}`)}) -Wait -PassThru
  if ($result.ExitCode -ne 0) { throw "installer exited $($result.ExitCode)" }
  if ($env:DSH_X_UPDATE_NO_LAUNCH -ne '1') { Start-Process -FilePath ${powerShellQuote(pending.appPath)} }
} catch {
  Write-Error $_
  exit 1
} finally {
  Stop-Transcript
}
`
}

export function appUpdateSupported(platform: NodeJS.Platform): boolean {
  return platform === 'darwin' || platform === 'win32'
}

export async function spawnAppUpdate(options: {
  pending: PendingAppUpdate
  home: string
  hostPid: number
  platform?: NodeJS.Platform
  spawnImpl?: SpawnLike
}): Promise<{ helper: string; log: string }> {
  const platform = options.platform ?? process.platform
  if (!appUpdateSupported(platform)) throw new Error('Automatic app updates are not implemented for this platform')
  if (platform === 'darwin' && !options.pending.appPath.endsWith('.app')) throw new Error('macOS app path is not an application bundle')
  if (platform === 'win32' && !options.pending.appPath.toLowerCase().endsWith('.exe')) throw new Error('Windows app path is not an executable')
  await access(options.pending.installRoot, constants.W_OK)
  await mkdir(path.join(options.home, 'updates', 'app', sanitizeTag(options.pending.tag)), { recursive: true, mode: 0o700 })
  const helper = path.join(options.home, 'updates', 'app', sanitizeTag(options.pending.tag), platform === 'darwin' ? 'apply.sh' : 'apply.ps1')
  const log = path.join(path.dirname(helper), 'apply.log')
  const pidFile = path.join(path.dirname(helper), 'apply.pid')
  try {
    const previous = Number(await readFile(pidFile, 'utf8'))
    if (Number.isInteger(previous) && previous > 0) {
      try { process.kill(previous, 0); return { helper, log } } catch { /* Stale helper; replace it. */ }
    }
  } catch { /* No helper has been started yet. */ }
  const script = platform === 'darwin'
    ? buildMacHelper({ pending: options.pending, hostPid: options.hostPid, logPath: log })
    : buildWindowsHelper({ pending: options.pending, hostPid: options.hostPid, logPath: log })
  await writeFile(helper, script, { mode: 0o700 })
  await chmod(helper, 0o700)
  const spawnImpl = options.spawnImpl ?? spawn
  const child = platform === 'darwin'
    ? spawnImpl('/bin/sh', [helper], { detached: true, stdio: 'ignore' })
    : spawnImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  if (child.pid) await writeFile(pidFile, String(child.pid), { mode: 0o600 }).catch(() => {})
  return { helper, log }
}
