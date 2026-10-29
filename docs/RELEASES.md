# Aggiornamenti e release GitHub

## Controllo nell’app

PDF MB 0.12.1 e successive interrogano `https://api.github.com/repos/bottalico75marco-maker/pdfMB/releases/latest` all’avvio, al massimo una volta ogni 24 ore dopo un controllo riuscito. **Aiuto → Verifica aggiornamenti** forza un controllo manuale; **Controlla aggiornamenti all’avvio** abilita o disabilita quello automatico.

Si considerano soltanto release pubbliche stabili con tag `vX.Y.Z` e versione superiore a quella dell’app. Per proporre il download devono esistere entrambi gli allegati `PDF-MB-X.Y.Z-win-x64.zip` e `.zip.sha256` caricati nella release del repository. I tag da soli, le bozze e le prerelease non producono avvisi.

L’avviso mostra versione e note come testo, con pulsanti per scaricare lo ZIP o aprire la release. Non invia PDF, percorsi, elenco Recenti o credenziali. Connessione assente, risposta non valida, timeout e limiti API sono gestiti senza bloccare l’editor; gli errori del controllo automatico non aprono finestre. Le impostazioni e l’ultima verifica riuscita sono in `%LOCALAPPDATA%\PdfMB\update-settings.json`.

Il pacchetto viene scaricato dal browser. Estrarre tutta la cartella; prima di sovrascrivere l’installazione precedente chiudere PDF MB dopo aver salvato. Il controllo non modifica il PDF né installa o sostituisce file durante il lavoro.

## Preparare ogni versione

1. Aggiornare `<Version>` in `src/PdfMB.Desktop/PdfMB.Desktop.csproj`: è la fonte unica per numero di versione, cartella applicativa, nome ZIP, checksum e note.
2. Scrivere `docs/releases/X.Y.Z.md` con novità, correzioni e limitazioni rilevanti. L’automazione compone le note finali aggiungendo le istruzioni di installazione, e le include anche nello ZIP come `RELEASE-NOTES.md`.
3. Verificare e pubblicare i commit su `main`; quindi creare e inviare il tag corrispondente, per esempio:

```powershell
git tag v0.12.1
git push origin v0.12.1
```

Il workflow **Verifica e build Windows** esegue controlli Node/PDFium, build e test desktop su Windows, e test Chromium. Solo dopo il successo di entrambi i job pubblica la release con titolo, note, ZIP Windows x64 e SHA-256. Prima carica tutti gli allegati in una bozza e infine la rende pubblica. Non servono token personali nei sorgenti: il solo job di pubblicazione riceve `contents: write` tramite `GITHUB_TOKEN`.

Tag e versione discordanti, versione non stabile o note mancanti fermano la build prima della pubblicazione. Rieseguire un tentativo fallito può completare la bozza; una release già pubblicata non viene sovrascritta. Push ordinari e pull request eseguono i controlli e preparano gli artefatti, senza pubblicare release.

## Pacchetto locale

```powershell
./scripts/prepare-release.ps1 -MetadataOnly
dotnet publish src/PdfMB.Desktop -c Release -r win-x64 --self-contained false -o artifacts/app-0.12.1 --nologo
./scripts/prepare-release.ps1
```

Lo script verifica la versione effettiva della DLL, prepara le note e produce ZIP e checksum. La prova online del controllo aggiornamenti è facoltativa:

```powershell
$env:PDFMB_LIVE_UPDATES = '1'
dotnet run --project tests/DesktopChecks -c Release
Remove-Item Env:PDFMB_LIVE_UPDATES
```

Gli altri test usano risposte HTTP simulate e non dipendono da rete o autenticazione.
