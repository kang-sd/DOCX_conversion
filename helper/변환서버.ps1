# =============================================================
#  문서 변환 로컬 도우미 (한글 COM 엔진)
#  - 크롬 확장이 보낸 파일을 설치된 한/글로 변환해 돌려준다.
#  - 파일은 이 PC(127.0.0.1) 밖으로 나가지 않는다.
#  - PowerShell 기본 탑재만으로 동작 (별도 런타임 불필요)
# =============================================================

$PORT = 52700
$PREFIX = "http://127.0.0.1:$PORT/"

# 목표 확장자 → 한/글 SaveAs 포맷 문자열
$FORMAT = @{
  "docx" = "OOXML"; "hwpx" = "HWPX"; "hwp" = "HWP";
  "pdf" = "PDF";    "html" = "HTML"; "htm" = "HTML";
  "txt"  = "TEXT";  "rtf"  = "RTF"
}

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ---- 한/글 COM 인스턴스 (지연 생성 후 재사용) ----
$script:Hwp = $null
function Get-Hwp {
  if ($null -eq $script:Hwp) {
    $script:Hwp = New-Object -ComObject "HWPFrame.HwpObject"
    # 스크립트 파일 접근 보안 팝업 억제 시도 (모듈 있으면 등록)
    try { [void]$script:Hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule") } catch {}
    try { $script:Hwp.XHwpWindows.Item(0).Visible = $false } catch {}
  }
  return $script:Hwp
}

# ---- 실제 변환: 입력 바이트 → 출력 바이트 ----
function Convert-Document([byte[]]$bytes, [string]$srcName, [string]$target) {
  $target = $target.ToLower()
  if (-not $FORMAT.ContainsKey($target)) { throw "지원하지 않는 목표 포맷: $target" }

  $srcExt = [System.IO.Path]::GetExtension($srcName)
  if ([string]::IsNullOrWhiteSpace($srcExt)) { $srcExt = ".hwp" }
  $tmpIn  = [System.IO.Path]::Combine($env:TEMP, "hcv_" + [guid]::NewGuid().ToString("N") + $srcExt)
  $tmpOut = [System.IO.Path]::Combine($env:TEMP, "hcv_" + [guid]::NewGuid().ToString("N") + "." + $target)

  [System.IO.File]::WriteAllBytes($tmpIn, $bytes)
  try {
    $hwp = Get-Hwp
    $opened = $hwp.Open($tmpIn, "", "")
    if (-not $opened) { throw "입력 파일을 열 수 없습니다 ($srcExt)" }
    $saved = $hwp.SaveAs($tmpOut, $FORMAT[$target], "")
    if (-not $saved) { throw "변환/저장 실패 (target=$target)" }
    try { $hwp.Clear(1) } catch {}   # 현재 문서 닫기(저장 안 함)
    if (-not (Test-Path $tmpOut)) { throw "출력 파일이 생성되지 않았습니다" }
    return [System.IO.File]::ReadAllBytes($tmpOut)
  }
  finally {
    Remove-Item $tmpIn  -ErrorAction SilentlyContinue
    Remove-Item $tmpOut -ErrorAction SilentlyContinue
  }
}

# ---- 공통 CORS/응답 헤더 ----
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

# ---- HTTP 서버 시작 ----
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($PREFIX)
try { $listener.Start() } catch {
  Write-Host "포트 $PORT 를 열 수 없습니다: $($_.Exception.Message)"
  exit 1
}
Write-Host "문서 변환 도우미 실행 중 → $PREFIX  (종료: Ctrl+C)"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $resp = $ctx.Response
    Set-Cors $resp

    # CORS 프리플라이트
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
      # 요청 본문(원본 파일 바이트) 읽기
      $ms = New-Object System.IO.MemoryStream
      $req.InputStream.CopyTo($ms)
      $bytes = $ms.ToArray()
      if ($bytes.Length -eq 0) { Write-Json $resp 400 @{ error = "빈 파일" }; $resp.Close(); continue }
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
