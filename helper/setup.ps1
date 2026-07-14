# ==========================================================
#  Local Document Conversion Helper Setup Script (PowerShell)
# ==========================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# AppData-based safe install path to avoid folder permission issues
$installDir = Join-Path $env:APPDATA "HwpConverter"
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
}

$psFile = Join-Path $installDir "convert_server.ps1"
$batFile = Join-Path $installDir "setup.bat"

Write-Host "[Info] Installation Directory: $installDir"

# Fetch latest helper script directly from GitHub repository (Bypasses local SmartScreen block tag)
$rawUrlBase = "https://raw.githubusercontent.com/kang-sd/DOCX_conversion/main/hwp-converter-ext/helper"
Write-Host "[Progress] Fetching helper files from repository..."
try {
    Invoke-WebRequest -Uri "$rawUrlBase/convert_server.ps1" -OutFile $psFile -UseBasicParsing -ErrorAction Stop
    Invoke-WebRequest -Uri "$rawUrlBase/setup.bat" -OutFile $batFile -UseBasicParsing -ErrorAction Stop
    Write-Host " [Success] Download completed successfully." -ForegroundColor Green
} catch {
    # Local fallback for development/offline environments
    $scriptDir = $PSScriptRoot
    if ([string]::IsNullOrEmpty($scriptDir)) {
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    $localPs = Join-Path $scriptDir "convert_server.ps1"
    if (Test-Path $localPs) {
        Copy-Item $localPs $psFile -Force
        Write-Host " [Info] Fallback to local source file." -ForegroundColor Yellow
    } else {
        Write-Host " [Error] Failed to acquire convert_server.ps1: $_" -ForegroundColor Red
        Start-Sleep -Seconds 5
        exit 1
    }
}

Write-Host ""
Write-Host "[Progress] Registering shortcut to Windows Startup folder..."
try {
    $startupFolder = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs\Startup')
    $shortcutPath = Join-Path $startupFolder "HwpConverterHelper.lnk"
    
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut($shortcutPath)
    $s.TargetPath = "powershell.exe"
    $s.Arguments = "-NoProfile -WindowStyle Minimized -ExecutionPolicy Bypass -File `"$psFile`""
    $s.IconLocation = "imageres.dll,67"
    $s.Save()
    
    Write-Host " [Success] Shortcut registered successfully to Windows Startup folder." -ForegroundColor Green
} catch {
    Write-Host " [Error] Failed to register shortcut: $_" -ForegroundColor Red
    Start-Sleep -Seconds 5
    exit 1
}

Write-Host ""
Write-Host "[Progress] Launching helper server immediately (Minimized)..."
try {
    # Prevent duplicated ports by killing existing powershell helper instances
    $runningServer = Get-Process powershell -ErrorAction SilentlyContinue | 
        Where-Object { $_.CommandLine -like "*convert_server.ps1*" }
    if ($runningServer) {
        $runningServer | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    
    Start-Process "powershell.exe" -ArgumentList "-NoProfile -WindowStyle Minimized -ExecutionPolicy Bypass -File `"$psFile`""
    Write-Host " [Success] Helper server launched in background (Minimized) successfully." -ForegroundColor Green
} catch {
    Write-Host " [Error] Failed to start helper server: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "All set! You can close this window now."
Start-Sleep -Seconds 3
