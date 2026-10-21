# PDF MB

**Il tuo editor PDF per Windows:** organizza pagine, modifica testi, aggiungi annotazioni, stampa e oscura contenuti. Tutto in locale.

## Stato del progetto e versione attuale

| Riferimento | Stato |
| --- | --- |
| **0.8.0** | Versione di sviluppo più recente, con tutte le funzioni descritte qui e guida Windows. Disponibile nel [ramo di sviluppo](https://github.com/bottalico75marco-maker/pdfMB/tree/codex/evidenziatore-0.7.0) e nella [PR #1](https://github.com/bottalico75marco-maker/pdfMB/pull/1), ancora in bozza per le prove Windows. |
| **0.6.5** | Versione dei sorgenti su `main` al momento della pubblicazione di questo README e ultima cartella binaria storica inclusa nel repository. |

Questo README presenta lo stato raggiunto dall’applicazione fino alla **0.8.0**. Aggiornare la documentazione nella pagina principale non unisce automaticamente la PR: per usare le nuove funzioni scegliere il ramo o la build corrispondente.

**Collegamenti:** [Guida Windows](https://github.com/bottalico75marco-maker/pdfMB/blob/codex/evidenziatore-0.7.0/docs/GUIDA-WINDOWS.html) · [Checklist unica delle prove](https://github.com/bottalico75marco-maker/pdfMB/blob/codex/evidenziatore-0.7.0/docs/CHECKLIST-MANUALE.md) · [Build Windows su GitHub Actions](https://github.com/bottalico75marco-maker/pdfMB/actions) · [Architettura](https://github.com/bottalico75marco-maker/pdfMB/blob/codex/evidenziatore-0.7.0/docs/ARCHITETTURA.md)

## Installazione su Windows

1. Aprire il risultato della workflow **Verifica e build Windows** relativo al commit desiderato e scaricare l’artefatto **PDF-MB-0.8.0-win-x64**, quando la compilazione è terminata con successo.
2. Estrarre **l’intera cartella** dello ZIP.
3. Verificare la presenza di **.NET Desktop Runtime 10** e **Microsoft Edge WebView2 Runtime** su Windows a 64 bit.
4. Avviare **PdfMB.Desktop.exe**.

Tenere insieme EXE, DLL, cartelle `Web` e `ThirdParty` e `GUIDA-WINDOWS.html`. Per usare una build già compilata non servono Visual Studio, Node.js o l’SDK .NET.

La guida si apre offline con **Aiuto → Guida Windows** o **F1**, nel browser predefinito. Include istruzioni per tutti gli strumenti e per la risoluzione dei problemi più comuni. La scritta fissa “Gestione pagine” in alto a destra è stata rimossa; il pulsante **Gestisci pagine** resta disponibile.

## Tutte le funzionalità disponibili nella 0.8.0

### Apertura e consultazione

- Apertura mediante dialogo Windows, elenco degli ultimi dieci file o percorso passato all’avvio.
- Un documento alla volta, fino a **64 MB**.
- Miniature delle pagine, navigazione, ricerca e selezione/copia del testo quando consentite.
- Zoom, adattamento alla pagina, vista singola/affiancata e modalità di scorrimento.
- Rotazione della sola vista, senza modificare il contenuto del PDF.
- Barra di stato con pagina corrente, totale delle pagine, zoom e dimensioni della pagina.
- Conservazione del documento aperto se il caricamento del PDF successivo fallisce.

### Salvataggio e cronologia

- **Salva** sul percorso corrente e **Salva con nome…** su un nuovo percorso, che diventa quello corrente.
- Nome del documento rosso, asterisco e indicazione **file non salvato** per le modifiche pendenti.
- Richiesta **Salva / Non salvare / Annulla** prima di cambiare documento, chiuderlo o uscire.
- **Annulla/Ripeti** fino a 100 operazioni nella cronologia comune, anche dopo il salvataggio.
- Operazioni su più pagine e selezioni di evidenziatura su più pagine trattate come una sola azione.
- Scrittura mediante file temporaneo e sostituzione atomica, con controllo SHA-256 contro modifiche esterne alla destinazione.
- **Salva copia…** dei byte originali per i documenti in sola lettura, senza sovrascrivere il documento corrente o quello originale della sessione.

### Gestione delle pagine

Il pulsante **Gestisci pagine** attiva il pannello di lavoro. Clic destro sulle miniature per aprire i comandi; `Ctrl+clic` e `Maiusc+clic` permettono selezioni multiple.

| Comando | Funzione |
| --- | --- |
| **Ruota a destra/sinistra** | Rotazione permanente delle pagine selezionate, distinta dalla rotazione della vista. |
| **Elimina** | Rimozione delle pagine selezionate, conservandone almeno una. |
| **Sposta…** | Spostamento del gruppo alla posizione finale indicata, conservandone l’ordine interno. |
| **Inserisci…** | Importazione da un altro PDF: tutte le pagine oppure intervalli come `1, 3-5`, con posizione da 1 a N+1. |
| **Estrai pagine…** | Creazione di un nuovo PDF con la selezione, le rotazioni e le modifiche applicate, senza cambiare il documento aperto. |

Il trascinamento delle miniature non è previsto. La sorgente di un inserimento non viene scritta. L’estrazione non cambia nome, cronologia, selezione o stato di salvataggio della sessione e non può sovrascriverne i percorsi originale/corrente.

### Caselle di testo

- Il pulsante **Testo** attiva la modifica sulle pagine; la barra contestuale compare solo in questa modalità.
- **Nuova casella** mediante trascinamento, scrittura diretta, spostamento dal bordo e ridimensionamento con otto maniglie.
- Font **Helvetica, Times e Courier**, dimensioni **6–144 pt**, grassetto, corsivo e colore.
- Selezione dei caratteri e copia/incolla del testo all’interno della casella.
- Copia/incolla dell’intera casella dal menu contestuale o da tastiera, con nuovo identificativo e conservazione dello stile.
- Selezione e modifica delle caselle create da PDF MB anche dopo salvataggio e riapertura.
- Applicazione automatica all’uscita dal campo, al rilascio dopo spostamento/ridimensionamento o con `Ctrl+Invio`.
- **Annulla modifica** per scartare la bozza dopo conferma; errori di validazione mantengono la bozza recuperabile.
- Conservazione come annotazione PDF **FreeText**, senza trasformare il testo in immagine.
- Rilevamento e riparazione al salvataggio delle caselle delle vecchie versioni con aspetto trasparente o non valido.

Ogni casella usa uno stile uniforme e ammette fino a 10.000 caratteri occidentali, accenti ed euro. Non sono ancora disponibili stili misti per intervallo, font arbitrari, sottolineato, barrato e apice/pedice. Il testo non viene ridotto automaticamente per entrare nella casella.

### Evidenziatore sul testo selezionabile

1. Premere **Evidenziatore**: il pulsante si attiva e il cursore diventa un pennarello.
2. Scegliere **Giallo, Verde, Azzurro, Rosa o Arancione** dal select accanto al pulsante.
3. Trascinare sul testo del PDF: il colore viene applicato al rilascio.
4. Continuare con altri tratti oppure premere di nuovo il pulsante o `Esc` per tornare alla selezione normale.

L’evidenziatore usa la selezione nativa del viewer e mantiene zoom, scorrimento e rotazioni. Non apre una finestra alternativa e non disegna rettangoli liberi sullo sfondo. **Elimina evidenziazione…** elenca quelle create da PDF MB nella pagina corrente, comprese quelle riaperte da un file salvato. Sono incluse nel salvataggio, nell’estrazione e nella cronologia comune.

### Note adesive, forme e penna

Dal menu **Strumenti** sono disponibili **Nota adesiva, Rettangolo, Ellisse, Linea e Penna**.

- Le note hanno un contenuto testuale modificabile.
- Forme e disegni hanno colore e spessore selezionabili.
- Posizione e dimensioni si impostano cliccando o trascinando sulla pagina di lavoro.
- **Applica** conferma la modifica in memoria; **Salva** la conserva nel file.
- L’elenco degli elementi permette di aggiornare le note ed eliminare note e disegni di PDF MB, anche dopo riapertura.
- Le annotazioni sono PDF native; quelle di altri programmi vengono conservate e non sono modificabili dall’elenco dell’app.
- I pulsanti Pagina precedente/successiva permettono di spostarsi tra le pagine di lavoro.

### Modifica del testo e degli oggetti originali

**Strumenti → Modifica testo e oggetti** permette di selezionare un oggetto sulla pagina o dall’elenco.

- **Sostituire il testo** di un singolo oggetto con un nuovo oggetto testuale nella stessa posizione e ordine: il vecchio contenuto non viene semplicemente coperto.
- Scegliere **Helvetica, Times o Courier**, con dimensione **6–144 pt**.
- **Spostare, scalare, ruotare o eliminare** testo, immagini, tracciati e gruppi.
- Applicare le modifiche alla cronologia comune e conservarle dopo salvataggio/riapertura.

L’editor lavora sui singoli oggetti: non ricompone paragrafi e non modifica gli elementi interni dei gruppi/Form XObject. Il testo sostitutivo è occidentale, su una riga e fino a 10.000 caratteri; il font standard scelto può cambiare la larghezza rispetto all’originale. Verificare il risultato su pagine complesse, con ritagli, link, segnalibri o moduli.

### Stampa e cattura PNG

**Stampa… / Ctrl+P** prepara il documento corrente, comprese le modifiche applicate ma non ancora salvate. L’anteprima separata offre il dialogo di stampa del browser per scegliere stampante, intervallo, copie, orientamento e scala.

La stampa è raster, fino a **144 dpi** oppure **72 dpi** se il documento permette solo bassa qualità. Il limite per lavoro è **500 pagine e 36 MB di immagini**; per documenti più grandi si possono estrarre intervalli e stamparli separatamente.

**Strumenti → Cattura PNG** salva l’intera pagina oppure un’area selezionata, comprese le annotazioni applicate. Il lato massimo della cattura è **1.400 pixel**. La destinazione viene scelta dal dialogo Windows e la scrittura è atomica. Stampa e cattura non cambiano il percorso, i Recenti o lo stato di salvataggio del PDF.

### Oscuramento effettivo

**Strumenti → Oscuramento effettivo** elimina il contenuto dell’area selezionata mediante ricostruzione della pagina con i pixel interessati sostituiti.

> **Effetto sull’intera pagina:** diventa un’immagine, senza il livello testuale/OCR, gli oggetti, i moduli o le annotazioni originali modificabili. Il contenuto nascosto non può essere recuperato rimuovendo una figura di copertura. Il risultato è esportato attraverso un catalogo nuovo, senza metadati, allegati e segnalibri a livello documento.

La parte restante della pagina rimane leggibile e le altre pagine conservano i propri contenuti. Il rendering arriva a **2.800 pixel sul lato maggiore, fino a 144 dpi**. La conferma spiega le conseguenze prima di applicare l’operazione.

Annulla può ripristinare la sorgente nella sessione: condividere soltanto il PDF salvato dopo l’oscuramento e verificarlo dopo riapertura. Eventuali copie dello stesso dato in altre aree non vengono oscurate automaticamente.

### Guida, riservatezza e protezioni

- **Guida Windows offline**, disponibile dal menu Aiuto e con F1, inclusa nella distribuzione.
- PDF elaborati localmente, con viewer, Worker e PDFium WASM distribuiti insieme all’app.
- Nessun server HTTP locale avviato dall’applicazione; contenuti del viewer esposti tramite mapping locale WebView2.
- Percorsi di apertura/salvataggio gestiti dai dialoghi Windows, non scelti dal codice web.
- Permessi separati per annotazioni, modifica del contenuto, copia/cattura e stampa, ricontrollati anche sulle sorgenti importate.
- Documenti firmati, cifrati, senza permessi di assemblaggio o con controlli falliti mantenuti in sola consultazione secondo la policy dell’app.
- Profili WebView2 ed elenco dei Recenti conservati in `%LOCALAPPDATA%\PdfMB`; i Recenti contengono percorsi locali.

## Scorciatoie

| Tasti | Azione |
| --- | --- |
| **F1** | Guida Windows |
| **Ctrl+O** | Apri PDF |
| **Ctrl+S** | Salva |
| **Ctrl+Maiusc+S** | Salva con nome |
| **Ctrl+P** | Stampa |
| **Ctrl+Z / Ctrl+Y** | Annulla / Ripeti; durante la scrittura restano locali al campo |
| **Ctrl+Invio** | Conferma della casella di testo |
| **Esc** | Disattiva l’evidenziatore nel viewer |
| **Maiusc+F10** | Menu della miniatura selezionata |

## Limiti attuali

- **64 MB** per PDF aperto, importato o risultante; **128 MB** complessivi per sorgenti e cronologia. Salvare e riaprire libera la cronologia.
- Password di apertura, OCR e compilazione dei moduli non ancora gestiti.
- Font remoti di fallback disabilitati: un PDF con font mancanti può richiedere una verifica sull’originale.
- Fino a 1.000 modifiche a caselle o evidenziazioni per pagina; fino a 1.000 rettangoli per tratto di evidenziatore e pagina.
- La superficie Strumenti ispeziona pagine con un massimo di 2.000 oggetti/annotazioni.
- Alcune finestre interne del viewer possono mostrare testo inglese di fallback.
- Nessuna certificazione della validità delle firme digitali o della conformità PDF/A.
- Dopo ricostruzioni/importazioni verificare segnalibri, link interni, annotazioni e moduli sui PDF effettivamente utilizzati.

## Changelog di tutte le versioni disponibili

La cronologia seguente è ricostruita dai sorgenti, dalla documentazione e dalle cartelle versionate presenti nel repository. Non vengono inventate date di rilascio o modifiche non documentate. Le versioni 0.7.0 e 0.8.0 appartengono al ramo di sviluppo della PR #1; le cartelle storiche su `main` arrivano alla 0.6.5.

| Versione | Funzionalità e modifiche |
| --- | --- |
| **0.8.0** | Note adesive modificabili; rettangoli, ellissi, linee e penna; stampa con anteprima e cattura PNG; modifica del testo originale per oggetto, trasformazione/eliminazione di oggetti; oscuramento effettivo mediante ricostruzione raster; sorgenti immutabili nella cronologia; controlli separati dei permessi; correzione dei canali colore e rendering degli aspetti dei moduli; test con PDFium reale, prova browser e workflow di build Windows. Aggiornamento successivo della stessa versione: guida Windows offline, menu Aiuto/F1 e rimozione dell’etichetta fissa “Gestione pagine” in alto a destra. |
| **0.7.0** | Evidenziatore direttamente sul testo selezionabile del viewer, pulsante di attivazione, cursore a pennarello e select del colore adiacente; applicazione al rilascio, eliminazione delle evidenziazioni PDF MB, salvataggio e cronologia comune; un’unica azione per selezioni su più pagine. |
| **0.6.5** | Correzione delle caselle non visibili nel PDF salvato: opacità nativa e aspetto generato sulla FreeText di destinazione. Rilevamento/riparazione al salvataggio dei file creati dalle versioni precedenti. |
| **0.6.4** | Applicazione automatica delle bozze di testo, eliminazione del pulsante Applica nelle caselle e sincronizzazione con Salva/chiusura; conferma di spostamento e ridimensionamento al rilascio. |
| **0.6.3** | Rimozione del comando duplicato Modifica testo dalla barra contestuale; ingresso tramite il pulsante Testo della barra principale e aggiornamenti del motore delle caselle. |
| **0.6.2** | Menu contestuale Copia/Incolla delle caselle sulla pagina, con punto di incolla fissato al clic e mantenimento di contenuto, stile e dimensioni. |
| **0.6.1** | Barra Carattere visibile soltanto nella modalità Testo e ripristino dello spazio del viewer tornando alla consultazione. |
| **0.6.0** | Modifica delle caselle direttamente sulle pagine, barra Carattere, creazione con trascinamento, spostamento, maniglie di ridimensionamento, selezione dei caratteri e copia/incolla. Sostituisce il dialogo della 0.5.0. |
| **0.5.0** | Prima gestione del testo libero tramite dialogo, annotazioni FreeText, font standard, dimensione e colore, con salvataggio e cronologia. |
| **0.4.0** | Estrazione delle pagine selezionate in un nuovo PDF, mantenendo il risultato corrente e senza modificare la sessione aperta. |
| **0.3.2** | Build storica della serie 0.3 con asset web identici a quelli della 0.3.0; non sono disponibili note separate che permettano di attribuire con certezza ulteriori modifiche. |
| **0.3.1** | Build storica della serie 0.3 con asset web identici a quelli della 0.3.0; non sono disponibili note separate che permettano di attribuire con certezza ulteriori modifiche. |
| **0.3.0** | Consultazione PDF, gestione pagine con rotazione/eliminazione/spostamento e inserimento da altri PDF, selezione multipla, Annulla/Ripeti, salvataggio e protezioni della sessione. Prima cartella applicativa versionata conservata nel repository. |

Non sono presenti cartelle applicative o note di rilascio verificabili per 0.1.x e 0.2.x. Il valore `0.1.0` nel manifest npm identifica il pacchetto di supporto degli asset e non viene trattato come prova di una release desktop separata.

## Compilazione dai sorgenti e verifiche

Tecnologie: **C# / WinForms, .NET 10, WebView2 ed EmbedPDF/PDFium 2.15.1**. Per lavorare sulla versione più recente scegliere il ramo `codex/evidenziatore-0.7.0` della PR #1.

Su Windows, con SDK .NET 10, Node.js 24 e WebView2 Runtime:

```powershell
git clone https://github.com/bottalico75marco-maker/pdfMB.git
cd pdfMB
git switch codex/evidenziatore-0.7.0
npm ci
npm run assets
npm test
dotnet build PdfMB.sln -c Release
dotnet run --project src/PdfMB.Desktop
```

Pubblicazione della cartella Windows a 64 bit:

```powershell
dotnet publish src/PdfMB.Desktop -c Release -r win-x64 --self-contained false -o artifacts/app-0.8.0
```

Prova browser facoltativa:

```powershell
npx playwright install chromium
npm run test:browser
```

Sono state eseguite verifiche automatiche su cronologia, errori, permessi, pixel, annotazioni e oggetti con PDFium WASM reale, salvataggio/riapertura e flusso Chromium con trasporto WebView2 simulato, oltre alla compilazione/pubblicazione per Windows. La [checklist unica](https://github.com/bottalico75marco-maker/pdfMB/blob/codex/evidenziatore-0.7.0/docs/CHECKLIST-MANUALE.md) raccoglie le prove della finestra Windows, della stampante e dei documenti reali da completare prima di considerare consolidata la nuova versione.

Le licenze e gli avvisi delle dipendenze sono inclusi nella distribuzione, in `ThirdParty` e `Web/vendor/THIRD-PARTY-NOTICES.txt`.

## Roadmap restante

- **Verifica della conformità PDF/A.**
- **Conversione da PDF a PDF/A.**
- Ampliamenti delle caselle: font aggiuntivi, stili misti/per intervallo, sottolineato, barrato, apice/pedice ed evidenziazione dei caratteri.

Integrazione DMS e sostituzione pagine sono state rimosse dalla roadmap. La verifica dei referti CDA R2 è rinviata a una valutazione futura.
