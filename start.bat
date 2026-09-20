@echo off
title SIH Legal Metrology - Compliance Checker
color 0A

echo.
echo  ============================================================
echo   SIH Legal Metrology Compliance Checker - V0.1
echo   Starting server... please wait
echo  ============================================================
echo.

:: Move into the backend folder
cd /d "%~dp0backend"

:: Start the Flask server in this window
echo  [1/2] Starting Flask backend on http://localhost:5000 ...
echo.

:: Wait 4 seconds then open browser automatically
start "" /b cmd /c "timeout /t 18 /nobreak >nul && start http://localhost:5000"

:: Run the server (keeps this window open)
set PYTHONIOENCODING=utf-8
python app.py

:: If server crashes or is stopped, pause so you can read the error
echo.
echo  [SERVER STOPPED] Press any key to close this window...
pause >nul
