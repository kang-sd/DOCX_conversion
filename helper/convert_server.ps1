# =============================================================
#  Local Document Conversion Helper (HWP COM Engine)
#  - Ported and updated with English filenames to prevent encoding issues.
# =============================================================

$PORT = 52700
$PREFIX = "http://127.0.0.1:$PORT/"

# Target extension -> HWP SaveAs format string
$FORMAT = @{
  "docx" = "OOXML"; "hwpx" = "HWPX"; "hwp" = "HWP";
  "pdf" = "PDF";    "html" = "HTML"; "htm" = "HTML";
  "txt"  = "TEXT";  "rtf"  = "RTF"
}

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ---- HWP COM Instance (Lazy creation & Reuse) ----
$script:Hwp = $null
function Get-Hwp {
  if ($null -eq $script:Hwp) {
    $script:Hwp = New-Object -ComObject "HWPFrame.HwpObject"
    # Register security module registered in registry
    try { [void]$script:Hwp.RegisterModule("FilePathCheckDLL", "HShell") } catch {}
    try { $script:Hwp.XHwpWindows.Item(0).Visible = $false } catch {}
  }
  return $script:Hwp
}

# ---- Actual conversion: input bytes -> output bytes ----
function Convert-Document([byte[]]$bytes, [string]$srcName, [string]$target) {
  $target = $target.ToLower()
  if (-not $FORMAT.ContainsKey($target)) { throw "Unsupported target format: $target" }

  $srcExt = [System.IO.Path]::GetExtension($srcName)
  if ([string]::IsNullOrWhiteSpace($srcExt)) { $srcExt = ".hwp" }
  $tmpIn  = [System.IO.Path]::Combine($env:TEMP, "hcv_" + [guid]::NewGuid().ToString("N") + $srcExt)
  $tmpOut = [System.IO.Path]::Combine($env:TEMP, "hcv_" + [guid]::NewGuid().ToString("N") + "." + $target)

  [System.IO.File]::WriteAllBytes($tmpIn, $bytes)
  try {
    $hwp = Get-Hwp
    $opened = $hwp.Open($tmpIn, "", "")
    if (-not $opened) { throw "Failed to open input file ($srcExt)" }
    $saved = $hwp.SaveAs($tmpOut, $FORMAT[$target], "")
    if (-not $saved) { throw "Failed to save/convert file (target=$target)" }
    try { $hwp.Clear(1) } catch {}   # Close current doc without saving
    if (-not (Test-Path $tmpOut)) { throw "Output file was not created" }
    return [System.IO.File]::ReadAllBytes($tmpOut)
  }
  finally {
    Remove-Item $tmpIn  -ErrorAction SilentlyContinue
    Remove-Item $tmpOut -ErrorAction SilentlyContinue
  }
}

# ---- CORS / Headers ----
function Set-Cors($resp) {
  $resp.Headers["Access-Control-Allow-Origin"]  = "*"
  $resp.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
  $resp.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-Filename, X-Target"
}
function Write-Json($resp, [int]$code, $obj) {
  $json = ($obj | ConvertTo-Json -Compress)
  $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
  $resp.StatusCode = $code
  $resp.ContentType = "application/json; charset=utf-8"
  $resp.OutputStream.Write($buf, 0, $buf.Length)
}

# ---- HTTP Server ----
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($PREFIX)
try { $listener.Start() } catch {
  Write-Host "Cannot bind to port $PORT: $($_.Exception.Message)"
  exit 1
}
Write-Host "문서 변환 도우미 실행 중 -> $PREFIX  (종료: Ctrl+C)"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $resp = $ctx.Response
    Set-Cors $resp

    # CORS Preflight
    if ($req.HttpMethod -eq "OPTIONS") { $resp.StatusCode = 204; $resp.Close(); continue }

    $path = $req.Url.AbsolutePath.ToLower()

    if ($req.HttpMethod -eq "GET" -and $path -eq "/health") {
      $ver = ""
      try { $ver = (Get-Hwp).Version } catch {}
      Write-Json $resp 200 @{ status = "ok"; engine = "hwp"; version = "$ver" }
      $resp.Close(); continue
    }

    if ($req.HttpMethod -eq "POST" -and $path -eq "/convert") {
      $target = $req.Headers["X-Target"]
      if (-not $target) { $target = $req.QueryString["target"] }
      $name = $req.Headers["X-Filename"]
      if (-not $name) { $name = $req.QueryString["name"] }
      if (-not $name) { $name = "input.hwp" }
      
      # Read input file bytes
      $ms = New-Object System.IO.MemoryStream
      $req.InputStream.CopyTo($ms)
      $bytes = $ms.ToArray()
      if ($bytes.Length -eq 0) { Write-Json $resp 400 @{ error = "Empty file" }; $resp.Close(); continue }
      try {
        $out = Convert-Document $bytes $name $target
        $resp.StatusCode = 200
        $resp.ContentType = "application/octet-stream"
        $resp.Headers["Content-Disposition"] = "attachment"
        $resp.OutputStream.Write($out, 0, $out.Length)
      } catch {
        Write-Json $resp 500 @{ error = "$($_.Exception.Message)" }
      }
      $resp.Close(); continue
    }

    Write-Json $resp 404 @{ error = "not found" }
    $resp.Close()
  } catch {
    try { $ctx.Response.Close() } catch {}
  }
}

# SIG # Begin signature block
# MIIFWAYJKoZIhvcNAQcCoIIFSTCCBUUCAQExCzAJBgUrDgMCGgUAMGkGCisGAQQB
# gjcCAQSgWzBZMDQGCisGAQQBgjcCAR4wJgIDAQAABBAfzDtgWUsITrck0sYpfvNR
# AgEAAgEAAgEAAgEAAgEAMCEwCQYFKw4DAhoFAAQUpVVg6fa9wSUHZBvyMhQyt2BT
# qKygggL6MIIC9jCCAd6gAwIBAgIQa9ppdugpvZJKel7lebIdGzANBgkqhkiG9w0B
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
# NwIBFTAjBgkqhkiG9w0BCQQxFgQUqbXYIc5bJdznqgi3XXfTQmGmQdQwDQYJKoZI
# hvcNAQEBBQAEggEAJvbCFs+AqUs5K+h2dkcLyZLTuv3/y/oYk0oMJFJBby1koOKB
# ZnhEzzZMv7KWsZISHf555sOpRxS8K5E+dxj5iL8h8y+D9V8SODkCffSHhcZp+0dK
# 4Hw4O3W0g1b04+/hPFzEo7sAOsIrCyljHVHAha5ShfYItAiObR+UhhYcxKczx2CO
# PVUExMHPXHufXmFYvxmFKE1U21mC4447wwcoRX7z1rHVw6fVJ9ERWp2SDTG3XjMS
# 3ewIYJ9054PxU6oyo1MIV21hcVVzIeqwbVVdnL2OlmqVPQj6Nh6mzhJDdBy2t95S
# z9ZwVBEpPBHOtqj++GQvDXdnVS7sozXbiE6eMw==
# SIG # End signature block
