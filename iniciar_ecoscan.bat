@echo off
title EcoScan v2 - Lanzador
color 0A
cls

echo.
echo  ============================================
echo        EcoScan v2 - Analizador de Suelos
echo  ============================================
echo.

REM ── Verificar Python ──────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python no encontrado.
    echo  Descargalo en: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo  [OK] Python detectado
echo.

REM ── Ir a la carpeta donde esta este .bat ─────────────────────────────────
cd /d "%~dp0"

REM ── Instalar dependencias ─────────────────────────────────────────────────
echo  Instalando/verificando dependencias...
pip install -r requirements.txt --quiet --disable-pip-version-check
if errorlevel 1 (
    echo  [ERROR] Fallo al instalar dependencias.
    pause
    exit /b 1
)
echo  [OK] Dependencias listas
echo.

REM ── Iniciar servidor ──────────────────────────────────────────────────────
echo  Iniciando EcoScan en http://localhost:5050
echo  (El navegador abrira automaticamente)
echo.
echo  Para detener: cierra esta ventana o presiona Ctrl+C
echo.
echo  ============================================
echo.
python server.py

pause
