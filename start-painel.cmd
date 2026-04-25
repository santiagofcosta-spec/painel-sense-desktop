@echo off
chcp 65001 >nul
title Painel SENSE
cd /d "%~dp0"

echo.
echo ========================================
echo   Painel SENSE
echo   Pasta: %cd%
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao esta instalado ou nao esta no PATH.
  echo        Descarregue o instalador LTS: https://nodejs.org/
  echo        Reinstale e marque a opcao "Add to PATH". Depois feche e abra o CMD.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm nao encontrado. Reinstale o Node.js ^(https://nodejs.org/^).
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo A instalar dependencias pela primeira vez ^(npm install^)...
  echo Isto pode demorar um minuto.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERRO] npm install falhou. Copie a mensagem acima para pedir ajuda.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo A abrir o painel Electron...
echo Quando abrir: clique em "Escolher dashboard.json" e aponte para o ficheiro
echo em MQL5\Files ^(no MT5: Ficheiro - Abrir pasta de dados^).
echo.
call npm start
set EXITCODE=%errorlevel%
if not "%EXITCODE%"=="0" (
  echo.
  echo [ERRO] O painel fechou com erro. Codigo: %EXITCODE%
  echo.
  pause
)
exit /b %EXITCODE%
