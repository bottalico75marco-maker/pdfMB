# PDF MB

Applicazione desktop WinForms **.NET 10 + WebView2 + EmbedPDF 2.15.1**, con consultazione PDF, gestione pagine, testo libero e ponte C#↔JavaScript.

La Release con correzione della visibilità delle caselle nel PDF salvato mostra **PDF MB 0.6.5**. Pubblicazione pronta in `artifacts/app-0.6.5/PdfMB.Desktop.exe`.

## Avvio

Requisiti: Windows, SDK .NET 10, Node.js 22.16 o successivo e Microsoft Edge WebView2 Runtime. Per lavorare dalla soluzione usare una versione di Visual Studio compatibile con .NET 10, con il carico di lavoro per sviluppo desktop .NET.

Dalla radice del progetto:

```powershell
npm ci
npm run assets
dotnet build PdfMB.sln
dotnet run --project src/PdfMB.Desktop
```

In alternativa aprire `PdfMB.sln`, impostare `PdfMB.Desktop` come progetto di avvio ed eseguirlo. Preparare gli asset con npm anche prima della prima compilazione da Visual Studio.

È possibile passare un documento all'avvio:

```powershell
dotnet run --project src/PdfMB.Desktop -- "C:\documenti\esempio.pdf"
```

Per creare la cartella distribuibile, con runtime .NET Desktop richiesto sul PC di destinazione:

```powershell
dotnet publish src/PdfMB.Desktop -c Release -o artifacts/app
```

Distribuire **l'intera cartella** di pubblicazione, comprese `Web` e le librerie WebView2. Il runtime WebView2 resta un prerequisito. `Web/vendor/THIRD-PARTY-NOTICES.txt` contiene l'inventario e gli avvisi di licenza copiati dai pacchetti.

## Funzioni presenti

- Apri PDF da finestra Windows, file recenti e percorso passato all'avvio.
- Viewer EmbedPDF con PDFium WASM in Web Worker e asset inclusi localmente.
- Miniature aperte automaticamente, navigazione, ricerca e selezione del testo.
- Zoom, adattamento, visualizzazione singola/affiancata, scorrimento e rotazione della vista.
- Barra di stato con pagina corrente, pagine totali, percentuale e dimensioni della pagina.
- **Gestisci pagine**: clic destro su una miniatura per il menu a elenco con Ruota a destra/sinistra, Elimina e **Sposta…**. Il clic sinistro seleziona e visualizza la pagina; Ctrl+clic e Maiusc+clic compongono la selezione. Il clic destro su una pagina già selezionata apre i comandi per l'intero gruppo. Da tastiera il menu si apre con Maiusc+F10 o con il tasto Menu.
- **Inserisci…** nello stesso menu: scelta di un PDF di origine, pagine `Tutte` oppure intervalli come `1, 3-5`, posizione da 1 a `N + 1`. L'inserimento avviene prima della pagina indicata; `N + 1` aggiunge in fondo. Le pagine sono importate nell'ordine del PDF di origine, ignorando i duplicati nella selezione.
- **Estrai pagine…** nello stesso menu: salva le pagine selezionate in un nuovo PDF, nell'ordine corrente e con le rotazioni permanenti applicate, comprese le pagine inserite e le modifiche non ancora salvate. Chiede nome e percorso, senza cambiare il documento aperto, la selezione, la cronologia o lo stato di salvataggio. Non può sovrascrivere il percorso corrente né quello originale della sessione.
- **Testo** nella barra principale attiva la modifica direttamente sulle pagine. Solo in modalità testo compare la barra sotto il nome del file con i controlli: **Nuova casella**, elenco delle caselle della pagina corrente, Helvetica/Times/Courier, dimensione 6–144 pt, aumenta/riduci, grassetto, corsivo, colore, Elimina, Annulla modifica e zoom. Copia/Incolla si trovano nel menu del tasto destro. Uscendo tramite **Testo**, la barra si nasconde e lascia spazio al documento; il pulsante aggiuntivo Modifica testo è stato rimosso.
- **Nuova casella**: trascinare sulla pagina per disegnarne posizione e dimensioni, quindi scrivere direttamente al suo interno. Trascinare una casella per spostarla; usare le otto maniglie per ridimensionarla. Un clic sul testo o Invio sulla casella selezionata permette di scrivere e selezionare i caratteri. Uscire dalla casella applica automaticamente una sola azione annullabile; movimento e ridimensionamento si applicano al rilascio. Ctrl+Invio forza la conferma. Il pulsante Applica è stato rimosso. La selezione sulla pagina e l'elenco funzionano anche dopo salvataggio e riapertura per le caselle create da PDF MB.
- **Copia/incolla della casella**: tasto destro sulla casella → **Copia**, poi tasto destro sul punto della pagina → **Incolla**. La posizione viene fissata dal clic sulla pagina e non cambia spostando il puntatore nel menu. Le scorciatoie Ctrl+C/Ctrl+V restano disponibili per la casella selezionata e la posizione del mouse. La copia conserva testo, font, dimensione, colore e dimensioni della casella, riceve un nuovo identificativo e conta come una sola azione annullabile. Il testo resta un'annotazione FreeText nel PDF, senza essere convertito in immagine.
- Annulla/ripeti fino a 100 operazioni, anche dopo il salvataggio. Ogni operazione su più pagine conta come una sola azione.
- **Salva** sul percorso corrente e **Salva con nome** su un altro percorso, che diventa quello corrente.
- Nome file nell'intestazione a 18 pt in grassetto, rosso per le modifiche non salvate con la scritta **file non salvato** accanto; anche il titolo Windows diventa rosso su Windows 11. L'asterisco resta come indicatore aggiuntivo. Richiesta Salva / Non salvare / Annulla prima di cambiare documento, chiuderlo o uscire.
- `Ctrl+O`, `Ctrl+S`, `Ctrl+Maiusc+S`, `Ctrl+Z` e `Ctrl+Y`.
- Scrittura tramite file temporaneo e sostituzione atomica, con controllo SHA-256 contro modifiche esterne.
- PDF firmati, cifrati o senza permessi di assemblaggio in sola lettura, con copia originale disponibile. Anche un controllo di protezione fallito mantiene la sola consultazione.
- Messaggi versionati con identificativo di richiesta, risposta, errori e timeout.
- Conservazione del documento aperto se il PDF successivo non può essere caricato.

**Sposta…** chiede la posizione finale della prima pagina del blocco selezionato. Le pagine mantengono l'ordine che avevano nel documento. Se ci sono `N` pagine e ne sono selezionate `K`, la posizione ammessa è da 1 a `N − K + 1`. Esempio: pagine 2 e 4 spostate alla posizione 1 producono l'ordine **2, 4, 1, 3, 5…**. Il trascinamento non è previsto.

Le modifiche permanenti alle pagine sono distinte dalla rotazione della vista nel viewer. Zoom, ricerca e rotazione della vista non cambiano il PDF. Se ordine, rotazioni permanenti e testo coincidono con lo stato iniziale e non occorre riparare caselle delle versioni precedenti, il salvataggio conserva i byte iniziali. Per i documenti in sola lettura **Salva copia…** conserva sempre i byte originali e richiede un percorso diverso dall'originale e dal file corrente. Gli altri strumenti di annotazione, la modifica del contenuto esistente e la compilazione moduli restano disabilitati.

Un inserimento conta come una sola operazione annullabile. Le nuove pagine vengono selezionate e possono essere ruotate, spostate o eliminate come le altre. Il PDF di origine non viene scritto. Annullando uno dei due dialoghi, il documento e la cronologia restano invariati.

L'estrazione crea un documento separato importando solo le pagine selezionate dal risultato corrente. La rotazione della sola vista non viene esportata. Il nuovo file non diventa il documento corrente e non viene aperto automaticamente. Le proprietà dell'intero documento, come segnalibri e metadati, non fanno parte dell'estrazione; verificare annotazioni, moduli e link sui propri PDF. Si applicano il limite di 64 MB, la scrittura atomica e il controllo delle modifiche esterne alla destinazione. Nei documenti in sola lettura l'estrazione resta disabilitata.

La selezione della casella e quella dei caratteri sono distinte: clic sul bordo per selezionare/copiare l'intera casella; clic sul testo per scrivere e selezionare anche singole parole. Ctrl+C/Ctrl+V dentro il testo usano gli appunti normali; fuori dal campo copiano e duplicano la casella alla posizione del mouse. Incollando testo semplice sulla pagina viene creata una nuova casella con lo stile corrente. Lo stile resta uniforme per tutta la casella. Durante la modifica il testo usa i font di sistema; dopo l'applicazione automatica la pagina è renderizzata dal motore PDF. Apri, Salva, Salva con nome, chiusura e uscita dalla modalità testo applicano prima la bozza corrente. Se la validazione o la ricostruzione fallisce, la bozza resta recuperabile e l’azione viene interrotta. Un trascinamento o un’elaborazione blocca temporaneamente i comandi incompatibili; **Annulla modifica** scarta la bozza dopo conferma. Ctrl+Z/Ctrl+Y mentre si scrive restano locali; dopo l'applicazione automatica la cronologia del documento comprende l'intera modifica. In modalità testo le pagine scorrono in verticale, con zoom dedicato e rotazione della vista mantenuta; disattivando Testo dalla barra principale si torna al viewer di consultazione con le sue impostazioni.

Dalla 0.6.5 l'aspetto viene generato direttamente nell'annotazione del documento di destinazione, senza esportazioni/importazioni intermedie: stream e risorse font restano nello stesso contesto. L'opacità nativa è impostata a 255 (100%). I PDF MB delle versioni precedenti con caselle trasparenti o aspetti non validi vengono rilevati all'apertura e segnalati come da salvare: **Salva** o **Salva con nome** rigenera le caselle, conserva contenuti e geometria e aggiorna il viewer. Non è necessario riscrivere il testo. Solo la scrittura riuscita rimuove l'indicazione di modifiche non salvate. Sorgente iniziale e cronologia restano conservate; documenti protetti e annotazioni estranee sono esclusi dalla riparazione.

## Struttura

| Percorso | Responsabilità |
| --- | --- |
| `src/PdfMB.Desktop/MainForm.cs` | Finestra, dialoghi, stato e avvio WebView2 |
| `src/PdfMB.Desktop/Bridge/ViewerBridge.cs` | Messaggi nativi e correlazione delle risposte |
| `src/PdfMB.Desktop/Services/` | Lettura PDF, copia e file recenti |
| `src/PdfMB.Desktop/Web/app.mjs` | Configurazione viewer e collegamento ai plugin |
| `src/PdfMB.Desktop/Web/document-session.mjs` | Apertura, sostituzione e chiusura documento |
| `src/PdfMB.Desktop/Web/page-editor.mjs` | Stato delle pagine, selezione, cronologia e revisioni di salvataggio |
| `src/PdfMB.Desktop/Web/page-worker.mjs` | Controllo protezioni e ricostruzione PDF tramite PDFium |
| `src/PdfMB.Desktop/Web/pages-panel.mjs` | Miniature caricate su richiesta e dialoghi Sposta/Elimina |
| `src/PdfMB.Desktop/Web/text-surface.mjs` | Barra Carattere, modifica sulla pagina, trascinamento, maniglie e copia/incolla delle caselle |
| `src/PdfMB.Desktop/Web/text-engine.mjs` | Lettura e generazione FreeText, coordinate e rendering delle pagine nel Worker |
| `src/PdfMB.Desktop/Web/bridge.mjs` | Dispatcher dei comandi ricevuti dal processo host |
| `src/PdfMB.Desktop/Web/italian.mjs` | Traduzioni dei comandi principali |
| `scripts/copy-assets.mjs` | Preparazione di JavaScript, Worker, WASM e licenze |

I documenti passano in memoria, senza rendere accessibile al browser la cartella che li contiene. Il contenuto web è esposto su `https://pdfmb.example` attraverso il mapping locale di WebView2. Non viene avviato un server HTTP. Il ponte verifica l'origine dei messaggi e non accetta percorsi di salvataggio da JavaScript: questi vengono scelti nei dialoghi C#.

Il profilo WebView2 e l'elenco dei dieci file recenti sono in `%LOCALAPPDATA%\PdfMB`. L'elenco contiene i percorsi locali. I file PDF non vengono inviati a servizi esterni dall'applicazione.

## Limiti attuali

- Un documento alla volta, massimo 64 MB. Il trasferimento iniziale usa Base64; per documenti più grandi va sostituito con streaming o buffer condivisi.
- Ogni PDF importato e il risultato devono restare entro 64 MB. Le sorgenti immutabili conservate nella sessione, inclusi gli inserimenti ancora raggiungibili tramite annulla/ripeti e il PDF in preparazione, hanno un limite complessivo di 128 MB. Per liberare la cronologia e ripartire dalle pagine salvate, salvare e riaprire il documento.
- PDF che richiedono una password di apertura non gestiti in questo incremento.
- Font di fallback remoti disabilitati: documenti con font non incorporati possono avere caratteri mancanti. Per supportarli offline occorre distribuire i font necessari.
- Traduzioni italiane dei comandi principali; alcune finestre interne di EmbedPDF possono usare il testo inglese di fallback.
- La presenza di firme viene rilevata per bloccare le modifiche; la validità delle firme e la conformità PDF/A non vengono certificate.
- I PDF cifrati che si aprono senza password restano consultabili e copiabili, ma non modificabili: questo incremento non introduce un salvataggio che preservi e riconfiguri la cifratura.
- Il risultato viene riscritto dal motore PDFium. Controllare i propri documenti con segnalibri, link interni, annotazioni e moduli secondo la checklist; non viene garantita la conformità PDF/A dopo le modifiche.
- Per questo incremento, anche il PDF di origine di un inserimento deve superare i controlli di firme, cifratura e permessi: i PDF firmati, cifrati o senza permessi di assemblaggio non sono importabili.
- **Testo** richiede anche il permesso di modifica delle annotazioni. L'editor modifica solo le caselle create da PDF MB, riconosciute da un marcatore dedicato; le altre annotazioni sono conservate. Ogni casella ammette fino a 10.000 caratteri occidentali, accenti e simbolo €, con un massimo di 1.000 modifiche a caselle per pagina nella sessione. Caratteri non supportati vengono rifiutati esplicitamente. Non sono ancora inclusi font arbitrari, stili misti nella stessa casella, sottolineato, barrato, apice/pedice ed evidenziazione dei caratteri. Il testo non viene ridotto automaticamente per entrare nella casella: ridimensionarla con le maniglie o ridurre il carattere. La modifica delle caselle usa una superficie di pagine renderizzate dallo stesso Worker; per selezionare il testo originale del documento, cercare o usare moduli/modalità di lettura, tornare al viewer disattivando Testo nella barra principale.
- Seguono gli altri strumenti di annotazione (evidenziatore, nota adesiva e successivi), stampa e cattura, editing di testo/oggetti, oscuramento, verifica PDF/A e integrazione DMS. **Sostituisci pagine…** è rinviato in fondo alla roadmap perché non prioritario. Vedere [ARCHITETTURA.md](docs/ARCHITETTURA.md).

Le prove funzionali sono affidate all'utente: [CHECKLIST-MANUALE.md](docs/CHECKLIST-MANUALE.md).

## Riferimenti tecnici

- [EmbedPDF: avvio del viewer](https://www.embedpdf.com/docs/snippet/getting-started)
- [EmbedPDF: distribuzione offline](https://www.embedpdf.com/docs/snippet/airgapped)
- [EmbedPDF: caricamento dei documenti](https://www.embedpdf.com/docs/snippet/plugins/plugin-document-manager)
- [WebView2: mapping dei contenuti locali](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.setvirtualhostnametofoldermapping)
