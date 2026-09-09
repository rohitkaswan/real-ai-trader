@echo off
setlocal enabledelayedexpansion
title Darwinian Swarm Quantitative Trading Engine - Local Launcher

echo ======================================================================
echo    DARWINIAN SWARM QUANTITATIVE TRADING ENGINE
echo    100%% Local Runtime Launcher - Windows 10/11
echo ======================================================================

:: 1. Pre-Flight Diagnostic: Check Node.js v18+
echo [1/4] Checking Node.js environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH! Please install Node.js v18+.
    pause
    exit /b 1
)
for /f "tokens=1" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Detected Node.js: !NODE_VER!

:: 2. Pre-Flight Diagnostic: Check Python 3.10+
echo [2/4] Checking Python environment...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] Python not found in PATH. MT5 bridge requires Python 3.10+.
) else (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
    echo [OK] Detected Python: !PY_VER!

    :: Setup Virtual Environment for MT5 Bridge
    if not exist "server\brokers\.venv" (
        echo Setting up Python virtual environment in server\brokers\.venv...
        python -m venv server\brokers\.venv
    )

    call server\brokers\.venv\Scripts\activate.bat
    echo Installing / Verifying Python dependencies from server\brokers\requirements.txt...
    pip install -q -r server\brokers\requirements.txt
    
    echo Starting MetaTrader 5 Local Gateway on http://127.0.0.1:8000 in background...
    start "MT5_FastAPI_Gateway" /B python server\brokers\mt5_bridge.py
)

:: 3. Check npm dependencies
echo [3/4] Verifying Node packages...
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
)

:: 4. Launch Node.js Quantitative Server + Dashboard
echo [4/4] Starting Darwinian Swarm Engine on http://localhost:3000...
echo [INFO] System running in 100%% local mode with embedded SQLite and zero cloud dependence.
echo ======================================================================
call npm run dev
