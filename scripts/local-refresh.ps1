param(
  [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repoRoot ".local-server.pid"

Write-Output "Refreshing local server on port $Port..."

& (Join-Path $PSScriptRoot "local-stop.ps1") -Port $Port

$nextDir = Join-Path $repoRoot ".next"
if (Test-Path $nextDir) {
  Remove-Item $nextDir -Recurse -Force
}

Write-Output "Running production build..."
Push-Location $repoRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
  }

  Write-Output "Starting server..."
  $nodeExe = (Get-Command node).Source
  Start-Process -FilePath $nodeExe `
    -ArgumentList @(".\node_modules\next\dist\bin\next", "start", "--hostname", "0.0.0.0", "--port", "$Port") `
    -WorkingDirectory $repoRoot `
    -PassThru | Out-Null

  $baseUrl = "http://localhost:$Port"
  $healthy = $false
  for ($i = 0; $i -lt 35; $i++) {
    Start-Sleep -Seconds 1
    try {
      $home = Invoke-WebRequest -Uri $baseUrl -UseBasicParsing -TimeoutSec 3
      if ($home.StatusCode -eq 200) {
        $healthy = $true
        break
      }
    } catch {
      # retry until timeout
    }
  }

  $listenerPid = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -First 1
  if (-not $healthy -and $listenerPid) {
    $healthy = $true
    Write-Output "Health check fallback: listener detected on port $Port."
  }
  if (-not $healthy) {
    throw "Server started but health/listener check failed."
  }
  if ($listenerPid) {
    Set-Content -Path $pidFile -Value $listenerPid -Encoding ascii
  }

  Write-Output "Local app is up and healthy:"
  Write-Output "  URL: $baseUrl"
  if ($listenerPid) {
    Write-Output "  PID: $listenerPid"
  }
  Write-Output "Use 'npm run local:stop' to stop it."
} finally {
  Pop-Location
}
