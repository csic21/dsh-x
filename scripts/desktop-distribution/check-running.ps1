param([Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference = 'Stop'
$prefix = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\') + '\'
$running = Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}
if ($running) { exit 1 }
exit 0
