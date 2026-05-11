#Requires -Version 7.2
<#
.SYNOPSIS
  Tee next dev (compare scripts) to benchmark-runs/*.log — no app code changes.

.PARAMETER Bundler
  "webpack" | "turbo"

.EXAMPLE
  pwsh -NoProfile -File scripts/benchmark-runtime-dev.ps1 -Bundler webpack
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("webpack", "turbo")]
  [string] $Bundler,

  [string] $OutDir = "benchmark-runs"
)

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$shortSha = ""
try { $shortSha = (& git rev-parse --short HEAD 2>$null).Trim() } catch { $shortSha = "unknown" }
if (-not $shortSha) { $shortSha = "unknown" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logName = "dev-$Bundler-$stamp-$shortSha.log"
$logPath = Join-Path $OutDir $logName

$fullSha = ""
try { $fullSha = (& git rev-parse HEAD 2>$null).Trim() } catch { $fullSha = "" }
$branch = ""
try { $branch = (& git branch --show-current 2>$null).Trim() } catch { $branch = "" }

$preamble = @"
BENCHMARK_PROTOCOL=dev-runtime-benchmark-protocol.md v1
GIT_SHA_FULL=$fullSha
GIT_BRANCH=$branch
NPM_SCRIPT=dev:compare:$Bundler
NODE_OPTIONS=$($env:NODE_OPTIONS)
STARTED_UTC=$(([datetime]::UtcNow).ToString("o"))
BROWSER_RULES=single-tab,hard-refresh-once
---
"@
Set-Content -LiteralPath $logPath -Value $preamble -Encoding utf8

Write-Host "Logging to: $logPath"
Write-Host "Then run browser scenario from docs/dev-runtime-benchmark-protocol.md"
Write-Host "Stop with Ctrl+C when done.`n"

$npmCmd = if ($Bundler -eq "webpack") { "run", "dev:compare:webpack" } else { "run", "dev:compare:turbo" }
& npm @npmCmd 2>&1 | Tee-Object -FilePath $logPath -Append
