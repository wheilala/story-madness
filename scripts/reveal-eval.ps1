param(
  [int]$Port = 3001,
  [int]$BatchSize = 5,
  [int]$MaxRuns = 10,
  [int]$StartIndex = 0,
  [bool]$UseModel = $true,
  [string]$SeedPath = ".\scripts\story-harness-seeds.json",
  [string]$OutputPath = ".\artifacts\reveal-eval-report.json"
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

function Invoke-RevealEvalRun {
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
    -Uri "http://localhost:$Port/api/story/evaluate-reveal" `
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
$totalFallbacks = 0
$totalRetries = 0
$deterministicScoreSum = 0.0
$modelPasses = 0
$modelJudged = 0

for ($index = 0; $index -lt $seeds.Count; $index += $BatchSize) {
  $batch = $seeds[$index..([Math]::Min($index + $BatchSize - 1, $seeds.Count - 1))]
  $batchRuns = @()
  $batchDeterministic = 0.0
  $batchFallbacks = 0
  $batchModelPasses = 0
  $batchModelJudged = 0

  foreach ($seed in $batch) {
    $variantIndex = $safeStartIndex + $index + $batchRuns.Count
    $response = Invoke-RevealEvalRun -Seed $seed -VariantIndex $variantIndex -Port $Port -UseModel $UseModel
    $batchRuns += $response
    $allRuns += $response

    if ($response.generationFallbackUsed) {
      $batchFallbacks += 1
      $totalFallbacks += 1
    }
    if ($response.generationRetryUsed) { $totalRetries += 1 }

    $detScore = [double]$response.evaluation.deterministic.overallScore
    $batchDeterministic += $detScore
    $deterministicScoreSum += $detScore

    foreach ($warning in @($response.evaluation.deterministic.warnings)) {
      Add-Count -Table $issueCounts -Key $warning
    }
    foreach ($label in @($response.evaluation.deterministic.suspiciousLabels)) {
      Add-Count -Table $issueCounts -Key $label
    }

    if ($response.evaluation.model) {
      $batchModelJudged += 1
      $modelJudged += 1
      if ($response.evaluation.model.pass) {
        $batchModelPasses += 1
        $modelPasses += 1
      }
      foreach ($flag in @($response.evaluation.model.flaggedSubstitutions)) {
        Add-Count -Table $issueCounts -Key ("flagged: " + $flag)
      }
    } elseif ($response.evaluation.modelError) {
      Add-Count -Table $issueCounts -Key ("model-error: " + $response.evaluation.modelError)
    }
  }

  $batchIssues = New-IssueSummary -Counts $issueCounts
  $batchAverage = if ($batchRuns.Count -gt 0) { $batchDeterministic / $batchRuns.Count } else { 0 }
  $batchModelSummary = if ($batchModelJudged -gt 0) {
    "{0}/{1}" -f $batchModelPasses, $batchModelJudged
  } else {
    "n/a"
  }
  $batchNumber = [Math]::Floor($index / $BatchSize) + 1
  Write-Output ("batch {0}: runs={1} fallbacks={2} det={3:N2} model={4} top={5}" -f $batchNumber, $batchRuns.Count, $batchFallbacks, $batchAverage, $batchModelSummary, (Get-TopIssueLabel -Items $batchIssues))
}

$topIssues = New-IssueSummary -Counts $issueCounts
$overallAverage = if ($allRuns.Count -gt 0) { $deterministicScoreSum / $allRuns.Count } else { 0 }
$modelPassRate = if ($modelJudged -gt 0) { $modelPasses / $modelJudged } else { $null }

$summary = [pscustomobject]@{
  runCount = $allRuns.Count
  fallbackCount = $totalFallbacks
  retryCount = $totalRetries
  deterministicAverage = [Math]::Round($overallAverage, 3)
  modelPasses = $modelPasses
  modelJudged = $modelJudged
  modelPassRate = if ($null -ne $modelPassRate) { [Math]::Round($modelPassRate, 3) } else { $null }
  topIssues = $topIssues
  runs = $allRuns
}

$outputDir = Split-Path -Parent $OutputPath
if ($outputDir -and -not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}
$summary | ConvertTo-Json -Depth 10 | Set-Content -Path $OutputPath

$overallModelSummary = if ($modelJudged -gt 0) {
  "{0}/{1}" -f $modelPasses, $modelJudged
} else {
  "n/a"
}
Write-Output ("done: runs={0} fallbacks={1} retries={2} det={3:N2} model={4} report={5}" -f $summary.runCount, $summary.fallbackCount, $summary.retryCount, $summary.deterministicAverage, $overallModelSummary, $OutputPath)
