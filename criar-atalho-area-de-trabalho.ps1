$bat = Join-Path $PSScriptRoot "AbrirPainelSENSE.bat"
$desk = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desk "Painel SENSE.lnk"
$W = New-Object -ComObject WScript.Shell
$S = $W.CreateShortcut($lnkPath)
$S.TargetPath = $bat
$S.WorkingDirectory = $PSScriptRoot
$S.Description = "Abre o painel desktop SENSE"
$S.Save()
Write-Host "Atalho criado: $lnkPath"
