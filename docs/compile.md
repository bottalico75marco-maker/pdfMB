npm ci
npm run assets
npm test
dotnet build PdfMB.sln -c Release --nologo
dotnet run --project tests/DesktopChecks -c Release

Remove-Item -Recurse -Force artifacts\app-update -ErrorAction SilentlyContinue
dotnet publish src/PdfMB.Desktop -c Release -r win-x64 --self-contained false -o artifacts/app-update --nologo

Copy-Item -Recurse artifacts\app-update artifacts\app-0.11.0

Compress-Archive artifacts\app-0.11.0\* artifacts\PDF-MB-0.11.0-win-x64.zip
(Get-FileHash artifacts\PDF-MB-0.11.0-win-x64.zip -Algorithm SHA256).Hash.ToLower() + "  PDF-MB-0.11.0-win-x64.zip" | Out-File -Encoding ascii artifacts\PDF-MB-0.11.0-win-x64.zip.sha256
