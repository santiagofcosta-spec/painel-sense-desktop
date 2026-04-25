@echo off
title Painel SENSE
cd /d "%~dp0"
rem Segredos locais: copia setenv.local.bat.example -> setenv.local.bat e edita lá (setenv.local.bat está no .gitignore).
if exist "setenv.local.bat" call "setenv.local.bat"
if not exist "package.json" (
  echo Erro: package.json nao encontrado nesta pasta.
  pause
  exit /b 1
)
npm start
if errorlevel 1 (
  echo.
  echo Se apareceu "npm nao reconhecido", feche e abra o CMD ou reinicie o PC apos instalar o Node.
  pause
)
