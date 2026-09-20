@echo off
title SIH Legal Metrology - Local Server + Public Phone Tunnel
color 0A

echo.
echo  ========================================================================
echo   SIH Legal Metrology Compliance Checker (V0.1 - Local + Tunnel Mode)
echo   High-Speed On-Device AI Engine + Public Tunnel for Phones & Teammates
echo  ========================================================================
echo.

:: 0. Clean up any stale process holding port 5000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

:: 1. Start the Flask Server in its own window
echo  [1/2] Starting local AI backend on http://localhost:5000 ...
start "SIH Local AI Backend [Port 5000]" /min cmd /c "cd /d "%~dp0backend" && set PYTHONIOENCODING=utf-8 && python app.py"

:: 2. Wait until Flask is actually listening on port 5000 before opening browser
echo  [2/2] Loading AI models & starting server (takes ~10s)...
powershell -NoProfile -Command "$ready = $false; for ($i=0; $i -lt 40; $i++) { try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 5000); $c.Close(); $ready = $true; break } catch { Start-Sleep -Milliseconds 600 } }"

:: Open browser the exact moment the server is ready (zero 'refused to connect' errors)
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
