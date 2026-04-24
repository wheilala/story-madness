param(
  [int]$Port = 3001,
  [int]$BatchSize = 5,
  [int]$MaxRuns = 20,
  [int]$StartIndex = 0,
  [string]$SeedPath = ".\scripts\story-harness-seeds.json",
  [string]$OutputPath = ".\artifacts\story-harness-report.json"
)

$ErrorActionPreference = "Stop"

function New-HarnessIssueSummary {
  param([hashtable]$Counts)
  return $Counts.GetEnumerator() |
    Sort-Object -Property Value -Descending |
    Select-Object -First 10 |
    ForEach-Object {
      [pscustomobject]@{
        issue = $_.Key
        count = $_.Value
      }
    }
}

function Get-TopIssueLabel {
  param([object[]]$Issues)
  $first = $Issues | Select-Object -First 1
  if (-not $first) { return "none" }
  $text = [string]$first.issue
  if ($text.Length -le 72) { return $text }
  return $text.Substring(0, 69) + "..."
}

function Add-Issues {
  param(
    [hashtable]$Counts,
    [object]$Diagnostics
  )

  if (-not $Diagnostics) { return }

  $allIssues = New-Object System.Collections.Generic.HashSet[string]
  foreach ($category in @("seed", "blanks", "schema", "cohesion")) {
    foreach ($issue in @($Diagnostics.failureCategories.$category)) {
      if ($issue) { [void]$allIssues.Add([string]$issue) }
    }
  }

  foreach ($attempt in @($Diagnostics.attempts)) {
    if (-not $attempt.failureCategories) { continue }
    foreach ($category in @("seed", "blanks", "schema", "cohesion")) {
      foreach ($issue in @($attempt.failureCategories.$category)) {
        if ($issue) { [void]$allIssues.Add([string]$issue) }
      }
    }
  }

  foreach ($issue in $allIssues) {
    if (-not $Counts.ContainsKey($issue)) { $Counts[$issue] = 0 }
    $Counts[$issue] += 1
  }
}

function Invoke-StoryHarnessRun {
  param(
    [string]$Seed,
    [int]$Port
  )

  $payload = @{
    seed = $Seed
    runId = [guid]::NewGuid().ToString()
  } | ConvertTo-Json -Depth 4

  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:$Port/api/story/generate" `
    -ContentType "application/json" `
    -Body $payload
}

$seedPool = Get-Content $SeedPath | ConvertFrom-Json
$safeStartIndex = [Math]::Max(0, [Math]::Min($StartIndex, [Math]::Max(0, $seedPool.Count - 1)))
$availableCount = $seedPool.Count - $safeStartIndex
$runCount = [Math]::Min($MaxRuns, $availableCount)
$seeds = @($seedPool | Select-Object -Skip $safeStartIndex -First $runCount)
$allRuns = @()
$issueCounts = @{}

for ($index = 0; $index -lt $seeds.Count; $index += $BatchSize) {
  $batch = $seeds[$index..([Math]::Min($index + $BatchSize - 1, $seeds.Count - 1))]
  $batchRuns = @()

  foreach ($seed in $batch) {
    $response = Invoke-StoryHarnessRun -Seed $seed -Port $Port
    $batchRuns += [pscustomobject]@{
      seed = $seed
      generationWarning = $response.generationWarning
      diagnostics = $response.diagnostics
      title = $response.title
    }
    Add-Issues -Counts $issueCounts -Diagnostics $response.diagnostics
  }

  $allRuns += $batchRuns
  $fallbacks = @($batchRuns | Where-Object { $_.diagnostics.fallbackUsed }).Count
  $retries = @($batchRuns | Where-Object { $_.diagnostics.retryUsed }).Count
  $topIssues = New-HarnessIssueSummary -Counts $issueCounts
  $batchNumber = [Math]::Floor($index / $BatchSize) + 1
  Write-Output ("batch {0}: runs={1} fallbacks={2} retries={3} top={4}" -f $batchNumber, $batchRuns.Count, $fallbacks, $retries, (Get-TopIssueLabel -Issues $topIssues))
}

$summary = [pscustomobject]@{
  runCount = $allRuns.Count
  fallbackCount = @($allRuns | Where-Object { $_.diagnostics.fallbackUsed }).Count
  retryCount = @($allRuns | Where-Object { $_.diagnostics.retryUsed }).Count
  topIssues = New-HarnessIssueSummary -Counts $issueCounts
  runs = $allRuns
}

$outputDir = Split-Path -Parent $OutputPath
if ($outputDir -and -not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath

Write-Output ("done: runs={0} fallbacks={1} retries={2} report={3}" -f $summary.runCount, $summary.fallbackCount, $summary.retryCount, $OutputPath)
