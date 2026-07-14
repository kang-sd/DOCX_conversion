$ErrorActionPreference = 'Stop'

# 1. Compile ps1 to exe using ps2exe
Write-Host "Compiling setup.ps1 to setup.exe..."
Invoke-ps2exe -inputFile "setup.ps1" -outputFile "setup.exe" -company "seoungdo" -product "DOCX Converter Helper" -title "Helper Setup" -description "One-click local helper setup" -version "1.0.0.0" -noConsole

# 2. Create a self-signed code signing certificate
Write-Host "Creating self-signed certificate for 'seoungdo'..."
$cert = New-SelfSignedCertificate -Subject "CN=seoungdo" -Type CodeSigningCert -CertStoreLocation "Cert:\CurrentUser\My"

# 3. Sign the executable
Write-Host "Signing setup.exe with the certificate..."
Set-AuthenticodeSignature -FilePath "setup.exe" -Certificate $cert

# 4. Sign the other ps1 scripts just in case
Set-AuthenticodeSignature -FilePath "setup.ps1" -Certificate $cert
Set-AuthenticodeSignature -FilePath "convert_server.ps1" -Certificate $cert

Write-Host "Done! setup.exe is signed and ready."
