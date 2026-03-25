@echo off
title StructCAD Pro
cd /d "%~dp0backend"
echo.
echo  =========================================
echo   StructCAD Pro - Iniciando servidor...
echo  =========================================
echo.
echo  Abre el navegador en:  http://localhost:8000
echo.
uvicorn main:app --reload --host 127.0.0.1 --port 8000
pause
