param(
  [int]$Port = 3001
)

$ErrorActionPreference = "SilentlyContinue"
$repoRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repoRoot ".local-server.pid"

if (Test-Path $pidFile) {
  $savedPid = Get-Content $pidFile | Select-Object -First 1
  if ($savedPid -match "^\d+$") {
    Stop-Process -Id ([int]$savedPid) -Force
  }
  Remove-Item $pidFile -Force
}

$listenPids = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pidValue in $listenPids) {
  Stop-Process -Id $pidValue -Force
}

Write-Output "Stopped server processes for port $Port."
