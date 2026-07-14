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

# SIG # Begin signature block
# MIIFWAYJKoZIhvcNAQcCoIIFSTCCBUUCAQExCzAJBgUrDgMCGgUAMGkGCisGAQQB
# gjcCAQSgWzBZMDQGCisGAQQBgjcCAR4wJgIDAQAABBAfzDtgWUsITrck0sYpfvNR
# AgEAAgEAAgEAAgEAAgEAMCEwCQYFKw4DAhoFAAQUgP4Vca01tJiq8F9GABXDu1iA
# GImgggL6MIIC9jCCAd6gAwIBAgIQa9ppdugpvZJKel7lebIdGzANBgkqhkiG9w0B
# AQsFADATMREwDwYDVQQDDAhzZW91bmdkbzAeFw0yNjA3MTQwMTMyMTNaFw0yNzA3
# MTQwMTUyMTNaMBMxETAPBgNVBAMMCHNlb3VuZ2RvMIIBIjANBgkqhkiG9w0BAQEF
# AAOCAQ8AMIIBCgKCAQEA0Tkb5NpC3W1l2wQmUcfhjRViA/BRNR7jM+Iz10GgAXvM
# +yEhHTSQZCetq3FQzkRTnKjqnBVmaHZGFOwIdG0lbmmQGF6jHxRVWWWyfQ5JARbU
# rrErx3UgpnImzTQ4uTAzC/c5Cflxg76hdcIKZUsgG/55Ks+AVIT1OPQuz36XTy0o
# mgCT2hB2sT0jRE3QCXIo21E6Mn3xfjGQTtJK3wEH7PK0nyeqCAhY+VOXNSLxHp1e
# 2J7pKtuO9REqwUJwvFPiJmtaVwE+Up/ZnZ+1Rv9qyhwiAop669Rgs4Czr/KnwmTa
# 5ICtFov+01n0cK/K+9o5ycN5XIlBNHVTTzlC1f0UwQIDAQABo0YwRDAOBgNVHQ8B
# Af8EBAMCB4AwEwYDVR0lBAwwCgYIKwYBBQUHAwMwHQYDVR0OBBYEFGgyEbVegvpe
# T7Pi8q8mpL86KGxCMA0GCSqGSIb3DQEBCwUAA4IBAQBckwFDYomyVsuzlIoYrcTG
# 6QaMMzqbyKtFKYupQ2lf9fTxV/PtKdp37uweq9JqJztnoeGGjNGdJdsBEF2v8p5G
# Ky1d5f+DbexsMzmWGNyQClxVy9nX8/u5m53MwQ9UU0IF6Orks9mpr3HosjJMRTHd
# WN4AtrSL17mr9V3wF7afidu8g76EJML8CSM1SP+C9gvZRt58iQSPOZgq40+GE71m
# GOAsK61+tynOW8tOcMfNvt2VpCZGJtufTx7WSZFCVSERtnviFitVObilTv5jPU1A
# gtFidl5NX1Hje65M20ONPLLJmlztS+dLnFWOpQZUajxH9JL36T++89SXSq0JGEMT
# MYIByDCCAcQCAQEwJzATMREwDwYDVQQDDAhzZW91bmdkbwIQa9ppdugpvZJKel7l
# ebIdGzAJBgUrDgMCGgUAoHgwGAYKKwYBBAGCNwIBDDEKMAigAoAAoQKAADAZBgkq
# hkiG9w0BCQMxDAYKKwYBBAGCNwIBBDAcBgorBgEEAYI3AgELMQ4wDAYKKwYBBAGC
# NwIBFTAjBgkqhkiG9w0BCQQxFgQUhI6o+1q58PSvk91mqObgSjXB5bAwDQYJKoZI
# hvcNAQEBBQAEggEARhlsWIb65ND2o/UpU7hqEpzRSxpiA6XMdOhsC8zVp9KrqXoS
# 773qntOsLS4ljgMqiwJmTdhDip+a1NnMMOUz1D+U+S9nLTfdFsJHKEAIlL2/zybf
# lgRKKS0c7XH3ZaeH7UFOJKRipwCOXz0+vRlKnoxmPS4uqljOG5hRvqQY7EnBOej6
# dsYkEy9Ch5BA+8FfdgSohuc/qBfUd1UyU0V3LqWy1txUhwcVTHkgtCFhmZLFoQgH
# R1gKW6prUkq4phadbDrFxC9LWg3Zzp088DWRL3W5ixo0r4zQ/cOukEdOib/WNxUU
# rae/SditQPWT2g/tIYG/Sy9ax6accpf2HfPcJQ==
# SIG # End signature block
