@echo off
title StructCAD Pro v2.2 (React)
cd /d "%~dp0"
echo.
echo  =========================================
echo   StructCAD Pro v2.2 - Iniciando...
echo  =========================================
echo.

REM Build frontend React si no existe la carpeta dist
if not exist "frontend-react\dist\index.html" (
  echo  Compilando interfaz React...
  cd frontend-react
  call npm install --silent
  call npm run build --silent
  cd ..
  echo  Interfaz compilada correctamente.
  echo.
)

echo  Abre el navegador en:  http://localhost:8000
echo.
cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
pause
