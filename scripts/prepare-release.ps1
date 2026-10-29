param(
    [string]$Tag = '',
    [switch]$MetadataOnly
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
[xml]$project = Get-Content -LiteralPath (Join-Path $repositoryRoot 'src/PdfMB.Desktop/PdfMB.Desktop.csproj') -Raw
$version = [string]$project.Project.PropertyGroup.Version
if ($version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { throw 'La versione deve avere formato X.Y.Z stabile.' }
if ($Tag -and $Tag -cne "v$version") { throw "Il tag $Tag non corrisponde alla versione del progetto v$version." }
$notesPath = Join-Path $repositoryRoot "docs/releases/$version.md"
if (!(Test-Path -LiteralPath $notesPath) -or [string]::IsNullOrWhiteSpace([IO.File]::ReadAllText($notesPath))) { throw "Note di rilascio mancanti: docs/releases/$version.md" }
$appDirectory = "artifacts/app-$version"
$packageName = "PDF-MB-$version-win-x64.zip"
$notesName = "release-$version-notes.md"
if ($env:GITHUB_OUTPUT) {
    @("version=$version", "app-directory=$appDirectory", "package-name=$packageName", "notes-name=$notesName") | Add-Content -LiteralPath $env:GITHUB_OUTPUT -Encoding utf8
}
if ($MetadataOnly) { Write-Output "Versione $version; tag e note verificati."; return }
$buildDirectory = Join-Path $repositoryRoot $appDirectory
$executable = Join-Path $buildDirectory 'PdfMB.Desktop.dll'
if (!(Test-Path -LiteralPath $executable)) { throw "Build mancante: eseguire dotnet publish in $appDirectory." }
$fileVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($executable).FileVersion
if ($fileVersion -ne "$version.0") { throw "La build $fileVersion non corrisponde alla versione $version." }
$notes = [IO.File]::ReadAllText($notesPath).TrimEnd() + "`n`n---`n`n" +
    "Scaricare **$packageName**, estrarre l’intera cartella e avviare **PdfMB.Desktop.exe**. " +
    "Richiede .NET Desktop Runtime 10 e Microsoft Edge WebView2 Runtime (Windows x64). " +
    "La guida offline è inclusa (F1). Il file **$packageName.sha256** permette di verificare l’integrità del pacchetto.`n"
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $repositoryRoot "artifacts/$notesName"), $notes, $utf8)
[IO.File]::WriteAllText((Join-Path $buildDirectory 'RELEASE-NOTES.md'), $notes, $utf8)
$packagePath = Join-Path $repositoryRoot "artifacts/$packageName"
Compress-Archive -Path (Join-Path $buildDirectory '*') -DestinationPath $packagePath -Force
$hash = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $packageName" | Set-Content -LiteralPath "$packagePath.sha256" -Encoding ascii
Write-Output "Pacchetto $packageName e checksum preparati con note $version."
