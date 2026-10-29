# Compilare e distribuire PDF MB 0.12.2 su Windows

Dalla radice del repository, con Node.js 24, SDK .NET 10 e WebView2 Runtime:

```powershell
npm ci
npm run assets
npm test
dotnet build PdfMB.sln -c Release --nologo
dotnet run --project tests/DesktopChecks -c Release

dotnet publish src/PdfMB.Desktop -c Release -r win-x64 --self-contained false -o artifacts/app-0.12.2 --nologo
./scripts/prepare-release.ps1
```

Chiudere l’app prima di aggiornare una cartella di build esistente. Distribuire l’intero ZIP, comprese le cartelle `Web` e `ThirdParty` e la guida offline.

Lo script ricava la versione dal progetto e include le note di `docs/releases/X.Y.Z.md`. Per la pubblicazione automatica da tag vedere [Aggiornamenti e release](RELEASES.md).

Prova del viewer in Chromium:

```powershell
npx playwright install chromium
npm run test:browser
```

Prova OCR facoltativa con un modello visivo **già installato** in Ollama locale:

```powershell
$env:PDFMB_OLLAMA_MODEL = 'gemma3:12b' # usare il nome del proprio modello
dotnet run --project tests/DesktopChecks -c Release
Remove-Item Env:PDFMB_OLLAMA_MODEL
```

La prova invia un PNG sintetico con la scritta `PDF MB TEST 123`; non apre documenti personali e non installa modelli. Le altre verifiche OCR usano risposte simulate, comprese assenza del servizio, modelli mancanti/non visivi/remoti, annullamento e risposte non valide.
