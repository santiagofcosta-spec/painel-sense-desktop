# Detecta dashboard.json do MT5 (MQL5\Files) e grava config.json
# Uso: .\atualizar-config-dashboard.ps1
#      .\atualizar-config-dashboard.ps1 -DataFile "C:\...\MQL5\Files\dashboard.json"
param(
  [string] $DataFile
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $here "config.json"
$fallback = "data/dashboard.json"

if ($DataFile -and $DataFile.Trim().Length -gt 0) {
  $p = $DataFile.Trim()
  if (-not (Test-Path -LiteralPath $p)) {
    Write-Error "Ficheiro nao existe: $p"
    exit 1
  }
  $obj = @{ dataFile = (Get-Item -LiteralPath $p).FullName }
  ($obj | ConvertTo-Json -Compress) | Set-Content -LiteralPath $configPath -Encoding UTF8
  Write-Host "Gravado (manual):" $configPath
  exit 0
}

$candidates = @()
$base = Join-Path $env:APPDATA "MetaQuotes\Terminal"
if (Test-Path $base) {
  Get-ChildItem $base -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $f = Join-Path $_.FullName "MQL5\Files\dashboard.json"
    if (Test-Path -LiteralPath $f) {
      $candidates += Get-Item -LiteralPath $f
    }
  }
}

if ($candidates.Count -eq 0) {
  Write-Host "Nenhum dashboard.json em AppData. Usando exemplo local: $fallback"
  $obj = @{ dataFile = $fallback }
} else {
  $best = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  Write-Host "Encontrado:" $best.FullName
  $obj = @{ dataFile = $best.FullName }
}

($obj | ConvertTo-Json -Compress) | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Host "Gravado:" $configPath
