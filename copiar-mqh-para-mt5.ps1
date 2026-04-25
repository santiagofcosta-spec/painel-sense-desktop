# Copia SENSE_DashboardWriter.mqh e SENSE_DashboardExportGuard.mqh para MQL5\Include
# de todas as instalações MetaTrader 5 encontradas em %APPDATA%\MetaQuotes\Terminal\*
# Uso: PowerShell — clicar direito "Executar com PowerShell" ou: .\copiar-mqh-para-mt5.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$srcWriter = Join-Path $root "SENSE_DashboardWriter.mqh"
$srcGuard = Join-Path $root "SENSE_DashboardExportGuard.mqh"

if (-not (Test-Path $srcWriter)) {
  Write-Host "Nao encontrado: $srcWriter" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $srcGuard)) {
  Write-Host "Nao encontrado: $srcGuard" -ForegroundColor Red
  exit 1
}

$terminalRoot = Join-Path $env:APPDATA "MetaQuotes\Terminal"
if (-not (Test-Path $terminalRoot)) {
  Write-Host "Pasta nao encontrada: $terminalRoot" -ForegroundColor Yellow
  Write-Host "Instala o MT5 ou copia manualmente os .mqh para MQL5\Include do terminal."
  exit 1
}

$copied = 0
Get-ChildItem $terminalRoot -Directory | ForEach-Object {
  $inc = Join-Path $_.FullName "MQL5\Include"
  if (Test-Path $inc) {
    Copy-Item -LiteralPath $srcWriter -Destination (Join-Path $inc "SENSE_DashboardWriter.mqh") -Force
    Copy-Item -LiteralPath $srcGuard -Destination (Join-Path $inc "SENSE_DashboardExportGuard.mqh") -Force
    Write-Host "OK -> $inc" -ForegroundColor Green
    $copied++
  }
}

if ($copied -eq 0) {
  Write-Host "Nenhuma pasta MQL5\Include encontrada em $terminalRoot" -ForegroundColor Yellow
  Write-Host "Abre o MT5 uma vez (cria pastas) ou copia os ficheiros manualmente."
  exit 2
}

Write-Host "`nFeito. Abre o MetaEditor e recompila o EA (F7)." -ForegroundColor Cyan
exit 0
