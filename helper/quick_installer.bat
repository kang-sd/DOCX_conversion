@echo off
echo ==========================================================
echo   Local Document Conversion Helper - One-Click Installer
echo ==========================================================
echo.
echo [Progress] Installing helper scripts via PowerShell...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/kang-sd/DOCX_conversion/main/helper/setup.ps1 | iex"

echo.
echo [Success] Installation complete!
timeout /t 5
