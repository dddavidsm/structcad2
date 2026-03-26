@echo off
title StructCAD Pro v2.2
cd /d "%~dp0"
echo.
echo =========================================
echo  StructCAD Pro v2.2
echo =========================================
echo.

REM 1. Compilar frontend React si la carpeta dist no existe
if not exist "frontend\dist\index.html" (
    echo [*] Compilando interfaz React...
    cd frontend
    call npm install
    call npm run build
    cd ..
    echo.
)

REM 2. Activar entorno virtual de Python (Crucial)
if exist "backend\venv\Scripts\activate.bat" (
    echo [*] Activando entorno virtual de Python...
    call "backend\venv\Scripts\activate.bat"
) else (
    echo [!] Aviso: No se encontro venv local. Usando Python global.
)

echo.
echo [+] Servidor backend iniciado.
echo [+] Abre en tu navegador: http://localhost:8000
echo.

REM 3. Iniciar el servidor
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000
pause