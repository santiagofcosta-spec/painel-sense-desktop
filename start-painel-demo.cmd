@echo off

chcp 65001 >nul

title Painel SENSE — demo pulso Speed

cd /d "%~dp0"



echo.

echo  Modo DEMO: %%PICO / %%PERSIST animados no painel (sem MT5).

echo  Use data\dashboard.json em config.json ou «Escolher dashboard.json…».

echo  Para desligar: feche e abra start-painel.cmd ^(sem variável abaixo^).

echo.



set "SENSE_DEMO_PULSO=1"

call "%~dp0start-painel.cmd"

