# ==========================================================
#  Local Document Conversion Helper Setup Script (PowerShell)
# ==========================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($scriptDir)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$psFile = Join-Path $scriptDir "convert_server.ps1"

if (-not (Test-Path $psFile)) {
    Write-Host " [Error] convert_server.ps1 not found: $psFile" -ForegroundColor Red
    Start-Sleep -Seconds 5
    exit 1
}

Write-Host "[Info] Detected path: $scriptDir"
Write-Host "[Info] Target server script: $psFile"
Write-Host ""

Write-Host "[Progress] Registering shortcut to Windows Startup folder..."
try {
    $startupFolder = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs\Startup')
    $shortcutPath = Join-Path $startupFolder "HwpConverterHelper.lnk"
    
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut($shortcutPath)
    $s.TargetPath = "powershell.exe"
    # 데스크톱 세션 연결 확보를 위해 Minimized로 시작프로그램 등록
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
    # 멈춤 충돌을 방지하기 위해 혹시 실행 중인 HwpConverterHelper 프로세스가 있다면 종료
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
Write-Host "You can now use the high-quality HWPX/DOCX conversion inside the Chrome Extension."
Write-Host "This window will close in 5 seconds."
Start-Sleep -Seconds 5
