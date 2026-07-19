$ErrorActionPreference = 'Stop'

$ports = @(5173, 5174, 8787)
$busyPorts = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort }
if ($busyPorts) {
  throw 'Darwin Lab smoke-test ports are already in use.'
}

$smokeDirectory = Join-Path (
  [System.IO.Path]::GetTempPath()
) ("darwin-lab-smoke-$([guid]::NewGuid().ToString('N'))")
New-Item -ItemType Directory -Path $smokeDirectory | Out-Null

$node = (Get-Command node).Source
$darwinRoot = Split-Path -Parent $PSScriptRoot
$projectFlowRoot = (Resolve-Path (Join-Path $darwinRoot '..\projectflow')).Path
$processes = @()

& $node `
  (Join-Path $darwinRoot 'node_modules\wrangler\bin\wrangler.js') `
  d1 `
  migrations `
  apply `
  darwin-telemetry `
  '--local' `
  '--config' `
  (Join-Path $darwinRoot 'workers\api\wrangler.toml') | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Local D1 migrations failed before the Lab smoke test.'
}

function Start-LabService {
  param(
    [string]$WorkingDirectory,
    [string[]]$Arguments,
    [string]$Name
  )
  $process = Start-Process `
    -FilePath $node `
    -ArgumentList $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput (Join-Path $smokeDirectory "$Name.stdout.log") `
    -RedirectStandardError (Join-Path $smokeDirectory "$Name.stderr.log") `
    -WindowStyle Hidden `
    -PassThru
  $script:processes += $process
}

try {
  Start-LabService `
    -WorkingDirectory $darwinRoot `
    -Name 'api' `
    -Arguments @(
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--env-file',
      '.env',
      '--port',
      '8787',
      '--config',
      'workers/api/wrangler.toml'
    )
  Start-LabService `
    -WorkingDirectory (Join-Path $darwinRoot 'apps\web') `
    -Name 'web' `
    -Arguments @(
      (Join-Path $darwinRoot 'node_modules\vite\bin\vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5173'
    )
  Start-LabService `
    -WorkingDirectory (Join-Path $projectFlowRoot 'apps\projectflow') `
    -Name 'target' `
    -Arguments @(
      (Join-Path $projectFlowRoot 'node_modules\vite\bin\vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5174'
    )

  $ready = $false
  for ($attempt = 0; $attempt -lt 45; $attempt += 1) {
    try {
      $health = Invoke-RestMethod `
        -Uri 'http://127.0.0.1:8787/api/health' `
        -TimeoutSec 2
      $webReady = (
        Invoke-WebRequest `
          -UseBasicParsing `
          -Uri 'http://127.0.0.1:5173/?view=lab' `
          -TimeoutSec 2
      ).StatusCode -eq 200
      $targetReady = (
        Invoke-WebRequest `
          -UseBasicParsing `
          -Uri 'http://127.0.0.1:5174/?lab=true' `
          -TimeoutSec 2
      ).StatusCode -eq 200
      if ($health.status -eq 'ok' -and $webReady -and $targetReady) {
        $ready = $true
        break
      }
    } catch {
      # Services may still be starting.
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    throw 'Darwin Lab services did not become ready.'
  }

  Invoke-RestMethod `
    -Uri 'http://127.0.0.1:8787/api/demo/reset' `
    -Method Post `
    -ContentType 'application/json' `
    -Body '{"confirmation":"RESET DARWIN DEMO","exportAcknowledged":true}' | Out-Null
  $createBody = @{
    name = 'Browser smoke population'
    targetUrl = 'http://127.0.0.1:5174/'
    populationSize = 8
    maxActions = 12
    maxDurationMs = 180000
    seed = 1859
  } | ConvertTo-Json
  $experiment = Invoke-RestMethod `
    -Uri 'http://127.0.0.1:8787/api/lab/experiments' `
    -Method Post `
    -ContentType 'application/json' `
    -Body $createBody
  Invoke-RestMethod `
    -Uri "http://127.0.0.1:8787/api/lab/experiments/$($experiment.experimentId)/start" `
    -Method Post | Out-Null

  $screenshot = Join-Path $smokeDirectory 'darwin-lab.png'
  & $node `
    (Join-Path $darwinRoot 'node_modules\@playwright\test\cli.js') `
    screenshot `
    '--wait-for-timeout=2500' `
    '--full-page' `
    'http://127.0.0.1:5173/?view=lab' `
    $screenshot | Out-Null
  if (-not (Test-Path $screenshot)) {
    throw 'Darwin Lab screenshot was not created.'
  }

  $targetScreenshot = Join-Path $smokeDirectory 'projectflow-lab.png'
  $targetStudyUrl =
    "http://127.0.0.1:5174/?study=true&lab=true&source=synthetic" +
    "&studyId=$($experiment.studyId)&participantId=lab-agent-smoke" +
    '&sessionId=lab-session-smoke'
  & $node `
    (Join-Path $darwinRoot 'node_modules\@playwright\test\cli.js') `
    screenshot `
    '--wait-for-timeout=1800' `
    '--full-page' `
    $targetStudyUrl `
    $targetScreenshot | Out-Null
  if (-not (Test-Path $targetScreenshot)) {
    throw 'ProjectFlow Lab screenshot was not created.'
  }
  $session = Invoke-RestMethod `
    -Uri "http://127.0.0.1:8787/api/studies/$($experiment.studyId)/sessions/lab-session-smoke"
  if ($session.events.Count -lt 2) {
    throw 'ProjectFlow did not emit inspectable Lab telemetry.'
  }
  $nonSynthetic = @($session.events | Where-Object { $_.source -ne 'synthetic' })
  if ($nonSynthetic.Count -gt 0) {
    throw 'ProjectFlow Lab telemetry crossed the synthetic provenance boundary.'
  }

  Write-Output "SMOKE_OK experiment=$($experiment.experimentId) health=$($health.version) events=$($session.events.Count)"
  Write-Output "SCREENSHOT=$screenshot"
  Write-Output "TARGET_SCREENSHOT=$targetScreenshot"
} finally {
  foreach ($process in $processes) {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
