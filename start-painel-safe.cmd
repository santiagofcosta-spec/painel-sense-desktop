@echo off
REM Se a janela nao aparecer, ficar branca ou piscar: usa este ficheiro em vez do start-painel.cmd
cd /d "%~dp0"
set SENSE_NO_GPU=1
call "%~dp0start-painel.cmd"
