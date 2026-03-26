@echo off
title StructCAD Pro v2.2
cd /d "%~dp0"
echo.
echo  =========================================
echo   StructCAD Pro v2.2
echo  =========================================
echo.

REM Compilar frontend React si la carpeta dist no existe
if not exist "frontend-react\dist\index.html" (
  echo  Compilando interfaz React (primera vez)...
  cd frontend-react
  call npm install
  call npm run build
  cd ..
  echo.
)

echo  Servidor disponible en:  http://localhost:8000
echo.
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000
pause
