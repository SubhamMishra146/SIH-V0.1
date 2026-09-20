@echo off
title SIH Legal Metrology - Local Server + Public Phone Tunnel
color 0A

echo.
echo  ========================================================================
echo   SIH Legal Metrology Compliance Checker (V0.1 - Local + Tunnel Mode)
echo   High-Speed On-Device AI Engine + Public Tunnel for Phones & Teammates
echo  ========================================================================
echo.

:: 1. Start the Flask Server in its own window
echo  [1/2] Starting local AI backend on http://localhost:5000 ...
start "SIH Local AI Backend [Port 5000]" /min cmd /c "cd /d "%~dp0backend" && set PYTHONIOENCODING=utf-8 && python app.py"

:: 2. Wait 5 seconds for Flask to initialize
echo  [2/2] Launching secure public tunnel for mobile/teammate access...
echo.
timeout /t 5 /nobreak >nul

:: Automatically open local dashboard in default browser
start http://localhost:5000

echo  ========================================================================
echo   SUCCESS! The system is now live.
echo.
echo   * Laptop Access (Local):   http://localhost:5000
echo.
echo   * Teammate / Phone Link:   LOOK AT THE URL GENERATED BELOW (trycloudflare.com)
echo                             Copy that HTTPS link and open on any phone!
echo  ========================================================================
echo.

:: Start the public tunnel
"%~dp0cloudflared.exe" tunnel --url http://localhost:5000

echo.
echo  [Tunnel Stopped] Press any key to exit...
pause >nul
