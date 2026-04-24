param(
  [int]$Port = 3001,
  [int]$BatchSize = 5,
  [int]$MaxRuns = 10,
  [int]$StartIndex = 0,
  [bool]$UseModel = $true,
  [string]$SeedPath = ".\scripts\story-harness-seeds.json",
  [string]$OutputPath = ".\artifacts\selector-compare-report.json"
)

$ErrorActionPreference = "Stop"

function Get-TopIssueLabel {
  param([object[]]$Items)
  $first = $Items | Select-Object -First 1
  if (-not $first) { return "none" }
  $text = [string]$first.issue
  if ($text.Length -le 72) { return $text }
  return $text.Substring(0, 69) + "..."
}

function Add-Count {
  param(
    [hashtable]$Table,
    [string]$Key
  )

  if (-not $Key) { return }
  if (-not $Table.ContainsKey($Key)) { $Table[$Key] = 0 }
  $Table[$Key] += 1
}

function Invoke-SelectorCompareRun {
  param(
    [string]$Seed,
    [int]$VariantIndex,
    [int]$Port,
    [bool]$UseModel
  )

  $payload = @{
    seed = $Seed
    runId = [guid]::NewGuid().ToString()
    variantIndex = $VariantIndex
    useModel = $UseModel
  } | ConvertTo-Json -Depth 4

  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:$Port/api/story/compare-selectors" `
    -ContentType "application/json" `
    -Body $payload
}

function New-IssueSummary {
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

$seedPool = Get-Content $SeedPath | ConvertFrom-Json
$safeStartIndex = [Math]::Max(0, [Math]::Min($StartIndex, [Math]::Max(0, $seedPool.Count - 1)))
$availableCount = $seedPool.Count - $safeStartIndex
$runCount = [Math]::Min($MaxRuns, $availableCount)
$seeds = @($seedPool | Select-Object -Skip $safeStartIndex -First $runCount)

$allRuns = @()
$issueCounts = @{}
$winnerCounts = @{
  local = 0
  humor_shadow = 0
  tie = 0
  skipped = 0
}
$modelPassCounts = @{
  local = 0
  humor_shadow = 0
}
$modelJudgedCounts = @{
  local = 0
  humor_shadow = 0
}
$localScoreSum = 0.0
$shadowScoreSum = 0.0
$shadowRuns = 0
$fallbacks = 0
$retries = 0

for ($index = 0; $index -lt $seeds.Count; $index += $BatchSize) {
  $batch = $seeds[$index..([Math]::Min($index + $BatchSize - 1, $seeds.Count - 1))]
  $batchRuns = @()

  foreach ($seed in $batch) {
    $variantIndex = $safeStartIndex + $index + $batchRuns.Count
    $response = Invoke-SelectorCompareRun -Seed $seed -VariantIndex $VariantIndex -Port $Port -UseModel $UseModel
    $batchRuns += $response
    $allRuns += $response

    if ($response.generationFallbackUsed) { $fallbacks += 1 }
    if ($response.generationRetryUsed) { $retries += 1 }

    $winner = [string]$response.comparison.winner
    if (-not $winnerCounts.ContainsKey($winner)) { $winnerCounts[$winner] = 0 }
    $winnerCounts[$winner] += 1

    $localScoreSum += [double]$response.local.evaluation.deterministic.overallScore
    if ($response.local.evaluation.model) {
      $modelJudgedCounts.local += 1
      if ($response.local.evaluation.model.pass) { $modelPassCounts.local += 1 }
    }
    if ($response.humorShadow) {
      $shadowRuns += 1
      $shadowScoreSum += [double]$response.humorShadow.evaluation.deterministic.overallScore
      if ($response.humorShadow.evaluation.model) {
        $modelJudgedCounts.humor_shadow += 1
        if ($response.humorShadow.evaluation.model.pass) { $modelPassCounts.humor_shadow += 1 }
      }
      foreach ($flag in @($response.humorShadow.diagnostics.rejections)) {
        Add-Count -Table $issueCounts -Key ("reject: " + [string]$flag.reason)
      }
    }

    foreach ($flag in @($response.local.evaluation.model.flaggedSubstitutions)) {
      Add-Count -Table $issueCounts -Key ("local: " + [string]$flag)
    }
    if ($response.humorShadow -and $response.humorShadow.evaluation.model) {
      foreach ($flag in @($response.humorShadow.evaluation.model.flaggedSubstitutions)) {
        Add-Count -Table $issueCounts -Key ("shadow: " + [string]$flag)
      }
    }
  }

  $batchIssues = New-IssueSummary -Counts $issueCounts
  $batchNumber = [Math]::Floor($index / $BatchSize) + 1
  $localWins = ($batchRuns | Where-Object { $_.comparison.winner -eq "local" }).Count
  $shadowWins = ($batchRuns | Where-Object { $_.comparison.winner -eq "humor_shadow" }).Count
  $ties = ($batchRuns | Where-Object { $_.comparison.winner -eq "tie" }).Count
  Write-Output ("batch {0}: runs={1} local={2} shadow={3} ties={4} top={5}" -f $batchNumber, $batchRuns.Count, $localWins, $shadowWins, $ties, (Get-TopIssueLabel -Items $batchIssues))
}

$topIssues = New-IssueSummary -Counts $issueCounts
$summary = [pscustomobject]@{
  runCount = $allRuns.Count
  fallbackCount = $fallbacks
  retryCount = $retries
  winnerCounts = $winnerCounts
  modelPassCounts = $modelPassCounts
  modelJudgedCounts = $modelJudgedCounts
  localDeterministicAverage = if ($allRuns.Count -gt 0) { [Math]::Round($localScoreSum / $allRuns.Count, 3) } else { 0 }
  shadowDeterministicAverage = if ($shadowRuns -gt 0) { [Math]::Round($shadowScoreSum / $shadowRuns, 3) } else { $null }
  topIssues = $topIssues
  runs = $allRuns
}

$outputDir = Split-Path -Parent $OutputPath
if ($outputDir -and -not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}
$summary | ConvertTo-Json -Depth 12 | Set-Content -Path $OutputPath

Write-Output ("done: runs={0} fallbacks={1} retries={2} local={3} shadow={4} ties={5} report={6}" -f $summary.runCount, $summary.fallbackCount, $summary.retryCount, $summary.winnerCounts.local, $summary.winnerCounts.humor_shadow, $summary.winnerCounts.tie, $OutputPath)
