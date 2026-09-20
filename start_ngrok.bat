@echo off
title SIH Legal Metrology - Local Server + ngrok Tunnel
color 0B

echo.
echo  ========================================================================
echo   SIH Legal Metrology Compliance Checker (V0.1 - ngrok Mode)
echo  ========================================================================
echo.

:: 1. Start the Flask Server
echo  [1/2] Starting local AI backend on http://localhost:5000 ...
start "SIH Local AI Backend [Port 5000]" /min cmd /c "cd /d "%~dp0backend" && set PYTHONIOENCODING=utf-8 && python app.py"

:: 2. Wait 5 seconds
timeout /t 5 /nobreak >nul

:: Automatically open local dashboard
start http://localhost:5000

echo  [2/2] Starting ngrok tunnel on port 5000...
echo.
echo  NOTE: If this is your first time using ngrok, make sure you ran:
echo        ngrok config add-authtoken <YOUR_TOKEN>
echo.

"C:\Users\Subham Mishra\AppData\Local\ngrok\ngrok.exe" http 5000

echo.
echo  [ngrok Stopped] Press any key to exit...
pause >nul
