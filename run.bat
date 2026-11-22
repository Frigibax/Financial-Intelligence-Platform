@echo off
title Multi-Agent Market Intelligence (MAMI)
cd /d %~dp0
if exist .venv\Scripts\activate.bat call .venv\Scripts\activate.bat
echo ========================================================================
echo   MULTI-AGENT MARKET INTELLIGENCE (MAMI) - RUNNER
echo ========================================================================
echo [1] Generate 16-Page Institutional Financial Report (CLI)
echo [2] Start Web Dashboard Server (Light Mode, http://localhost:8000)
echo ========================================================================
set /p choice=Enter choice [1 or 2, default=1]: 

if %choice%==2 (
    echo Starting Web Dashboard...
    python run.py --web
) else (
    set /p tick=Enter Ticker Symbol [default=AAPL]: 
    if %tick%==" set tick=AAPL
 echo Generating 16-Page Dossier for %tick%...
 python run.py --ticker %tick%
)
pause
