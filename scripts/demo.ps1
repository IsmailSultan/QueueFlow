param(
  [ValidateSet('all', 'reset', 'scale', 'failure', 'basic')]
  [string]$Scenario = 'all',
  [int]$BatchSize = 12
)

$ErrorActionPreference = 'Stop'

$api = if ($env:QUEUEFLOW_API_URL) { $env:QUEUEFLOW_API_URL } else { 'http://127.0.0.1:3000' }
$fixture = Join-Path $PSScriptRoot '..\src\assets\hero.png'

function Get-SystemState {
  Invoke-RestMethod -Uri "$api/api/system"
}

function Show-SystemState($label) {
  $state = Get-SystemState
  $workers = ($state.workers | ForEach-Object { "$($_.id):$($_.status)" }) -join ', '
  Write-Host ("{0,-18} queue={1,-3} active={2,-2} workers={3,-2} [{4}]" -f `
      $label, $state.queueDepth, $state.activeWorkerCount, $state.workerCount, $workers)
}

function Wait-ForJobState($jobId, $expectedState, $timeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  do {
    $job = Invoke-RestMethod -Uri "$api/api/jobs/$jobId"
    if ($job.status -eq $expectedState) {
      return $job
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $jobId to reach $expectedState (current: $($job.status))."
}

Write-Host 'QueueFlow demonstration'
Write-Host '======================='
Write-Host "API: $api"
Write-Host ''

if ($Scenario -eq 'reset') {
  Write-Host 'Resetting previous job history...'
  npm run reset
  Show-SystemState 'baseline'
  exit 0
}

if ($Scenario -in @('all', 'scale')) {
  Write-Host 'Resetting previous job history...'
  npm run reset
  Show-SystemState 'baseline'
  Write-Host ''
  Write-Host "Uploading a $BatchSize-image batch to demonstrate scale-up and scale-down..."
$uploadArguments = @('-s')
1..$BatchSize | ForEach-Object {
  $uploadArguments += '-F'
  $uploadArguments += "files=@$fixture;filename=scale-demo-$_.png"
}
$null = & curl.exe @uploadArguments "$api/api/jobs"

  1..16 | ForEach-Object {
    Show-SystemState ("sample {0:D2}" -f $_)
    Start-Sleep -Milliseconds 500
  }

  Start-Sleep -Seconds 7
  Show-SystemState 'after drain'
}

if ($Scenario -in @('all', 'failure')) {
  if ($Scenario -eq 'failure') {
    Write-Host 'Resetting previous job history...'
    npm run reset
    Show-SystemState 'baseline'
  }

  Write-Host ''
  Write-Host 'Uploading a deliberate failure...'
  $failureJson = & curl.exe -s -F "files=@$fixture;filename=demo-fail.png" "$api/api/jobs"
  $failure = $failureJson | ConvertFrom-Json
  $failedJob = Wait-ForJobState $failure[0].id 'failed'
  Write-Host "Failed as expected: $($failedJob.filename) - $($failedJob.error)"

  Write-Host 'Retrying the failed job...'
  $null = Invoke-RestMethod -Method Post -Uri "$api/api/jobs/$($failedJob.id)/retry"
  $completedJob = Wait-ForJobState $failedJob.id 'completed'
  Write-Host "Retry completed: $($completedJob.filename)"

  $result = Invoke-WebRequest -UseBasicParsing -Uri "$api/api/jobs/$($completedJob.id)/result"
  Write-Host "Result endpoint: $($result.StatusCode) $($result.Headers['Content-Type'])"
}

if ($Scenario -eq 'basic') {
  Write-Host 'Resetting previous job history...'
  npm run reset
  Show-SystemState 'baseline'
  Write-Host 'Uploading one image...'
  $basicJson = & curl.exe -s -F "files=@$fixture;filename=basic-demo.png" "$api/api/jobs"
  $basic = $basicJson | ConvertFrom-Json
  $completedBasic = Wait-ForJobState $basic[0].id 'completed'
  Write-Host "Completed: $($completedBasic.filename)"
  $result = Invoke-WebRequest -UseBasicParsing -Uri "$api/api/jobs/$($completedBasic.id)/result"
  Write-Host "Result endpoint: $($result.StatusCode) $($result.Headers['Content-Type'])"
}

Write-Host ''
Write-Host "Scenario '$Scenario' completed successfully."
