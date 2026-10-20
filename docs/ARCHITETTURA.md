# Architettura — viewer e gestione pagine

```text
WinForms .NET 10
  ├─ dialoghi Apri / Salva / Salva con nome / Inserisci / Estrai / modifiche non salvate
  ├─ percorso corrente, ultimo PDF salvato e impronta SHA-256
  └─ WebView2: contenuti locali e ponte JSON v1
       ├─ EmbedPDF 2.15.1 → Worker viewer → PDFium WASM
       ├─ pannello pagine, selezione e dialoghi Sposta / Elimina
       ├─ barra Testo / Carattere e superficie di modifica sulle pagine
       ├─ PageEditor: byte iniziali, descrittori pagine, cronologia e stato salvato
       └─ Worker editing → API PDFium 2.15.1 + stesso WASM locale
```

## Stato e transazioni

I byte iniziali di ogni sessione sono immutabili. Una pagina è descritta da un identificativo stabile e da una rotazione relativa di 0–3 quarti di giro. Per le pagine iniziali l'identificativo coincide con l'indice originale; per quelle importate è assegnato da un contatore crescente. Il Worker mantiene il catalogo che associa gli identificativi importati a sorgente immutabile e indice nella sorgente. L'ordine dei descrittori definisce l'ordine corrente del PDF. La cronologia conserva fino a 100 operazioni come descrittori, selezione e pagina corrente, senza copie complete per ciascuna voce.

Ogni descrittore può contenere `textChanges`: record immutabili per identificativo FreeText, con il valore desiderato o `null` per l'eliminazione. Le copie di cronologia condividono i record immutabili. La chiave dello stato salvato include ordine, rotazioni e modifiche al testo. Il Worker rilegge la versione iniziale della casella dalla sorgente originale della pagina: un ritorno ai suoi valori rimuove la modifica; aggiungere e poi eliminare una casella nuova riporta allo stato iniziale. Le pagine importate usano la stessa gestione. La ricostruzione applica i cambiamenti alle caselle prima della rotazione permanente della pagina.

Il Worker apre i byte iniziali, elimina le pagine iniziali escluse in ordine discendente, importa le pagine necessarie dalle altre sorgenti tramite `FPDF_ImportPagesByIndex`, riordina il risultato con `FPDF_MovePages` e applica le rotazioni con `FPDFPage_SetRotation`. Si conserva il catalogo del documento iniziale, senza ricreare il documento da zero. Gli handle e la memoria temporanea vengono liberati anche in caso di errore. Il risultato è limitato a 64 MB.

L'inserimento ha una fase di preparazione: C# sceglie e legge il PDF, il Worker controlla la sorgente e restituisce un token e il numero di pagine, poi un dialogo nativo raccoglie intervalli e posizione. Gli intervalli sono ordinati e deduplicati. Confermando, gli identificativi nuovi vengono registrati e il normale caricamento transazionale conferma il risultato prima di aggiungere un'unica voce alla cronologia. Annullando, la sorgente preparata viene rilasciata.

Il Worker conserva al massimo 128 MB complessivi di sorgenti PDF, inclusa quella in preparazione; ogni file resta limitato a 64 MB. Dopo ogni modifica o movimento nella cronologia, il controller comunica gli identificativi raggiungibili da stato corrente, annulla e ripeti. Le sorgenti importate non più raggiungibili vengono rilasciate; la sorgente iniziale resta necessaria alla ricostruzione.

Prima di confermare una modifica, il nuovo risultato viene caricato nel viewer. L'handle precedente resta aperto fino al completamento del caricamento e della configurazione della vista; un errore ripristina quello precedente. Il controller aggiorna bytes, descrittori e cronologia soltanto dopo questa fase.

L'estrazione è un'esportazione separata: il controller raccoglie gli indici selezionati in ordine corrente e invia al Worker una copia dei byte correnti, senza trasferire il buffer della sessione. Il Worker controlla permessi, indici e dimensione, crea un PDF con `FPDF_CreateNewDocument`, importa la selezione tramite `FPDF_ImportPagesByIndex`, serializza e riapre il risultato per verificarne il conteggio. La rotazione permanente è già nei byte; quella della vista non viene applicata. Non viene ricaricato il viewer e non si cambiano descrittori, selezione, revisione, cronologia o stato salvato. I segnalibri e i metadati del documento sorgente non vengono ricopiati nel nuovo documento.

Una sola coda JavaScript serializza comandi nativi e operazioni del pannello. Il processo host acquisisce un blocco prima dei dialoghi e delle operazioni sui file; il pannello e i comandi nativi incompatibili vengono disabilitati durante l'elaborazione. Le immagini delle miniature vengono richieste quando entrano nell'area visibile, con al massimo due render contemporanei.

**Testo** nella barra principale attiva una superficie di modifica sopra il viewer; la barra con tutti i controlli si trova sotto il nome del file. Dalla 0.6.3 non c'è più il comando duplicato Modifica testo nella barra contestuale. Il Worker legge le annotazioni FreeText con `PDFMBText=1` e identificativo `NM=pdfmb-<uuid>`, ne restituisce contenuto, stile e rettangolo, e renderizza le pagine (lato maggiore fino a 1.400 px, ingrandimento del raster al massimo 2×). Le pagine vengono caricate su richiesta tramite IntersectionObserver; le pagine lontane vengono rilasciate quando la cache supera otto pagine, preservando quelle visibili e quella selezionata. La superficie ha scorrimento verticale e zoom dedicato; la rotazione della vista viene applicata con matrici CSS e trasformazione inversa del puntatore. Il viewer sottostante conserva le proprie impostazioni di consultazione.

Un trascinamento sul foglio crea la casella. Il trascinamento del bordo la sposta, otto maniglie ne cambiano le dimensioni e un clic sul testo attiva un campo di testo direttamente nella casella. Le posizioni di dispositivo passano alle coordinate PDF tramite PDFium, rispettando CropBox e rotazioni permanenti. Per la casella selezionata viene riletto un rendering temporaneo che omette solo la sua annotazione: l'editor in linea può così mostrarne il testo senza sovrapporlo alla vecchia apparenza. La copia originale e i byte correnti restano immutati durante questa operazione. L’uscita dalla casella o Ctrl+Invio valida automaticamente la bozza, ricostruisce il PDF e ricarica il viewer prima di confermare un'unica azione annullabile. Un errore conserva la bozza e lo stato precedente; lo scorrimento di lavoro viene mantenuto.

La copia di un oggetto scrive testo semplice e dati della casella negli eventi clipboard del browser e mantiene una copia interna. Il tasto destro seleziona la casella e apre il menu Copia/Incolla; sullo sfondo della pagina il menu offre Incolla, disabilitato se non è disponibile una casella copiata o se una bozza non applicata impedisce l'operazione. Il menu conserva indice della pagina, punto PDF e generazione catturati al clic: il successivo movimento del mouse nel menu non altera la destinazione. Cambio di documento, elaborazione, scorrimento, ridimensionamento o perdita del focus chiudono il menu e invalidano la destinazione. Ctrl+V fuori dal campo duplica testo e stile alla posizione del puntatore, anche su un'altra pagina, con un nuovo identificativo e una sola azione di cronologia. Dentro il campo, selezione e appunti restano quelli dei singoli caratteri. Se viene incollato solo testo semplice, si usa lo stile corrente.

Dalla 0.6.4 il pulsante Applica è rimosso. La perdita del focus applica la bozza, mentre i controlli del carattere e il menu contestuale appartengono alla stessa interazione e non interrompono la scrittura. Il rilascio conferma movimenti e ridimensionamenti. Le nuove caselle vuote sono scartate. `editor.lock` esegue un flush diretto nella coda condivisa prima di acquisire il blocco: non accoda una seconda operazione da attendere dentro la prima. In questo modo Salva comprende anche il campo ancora attivo. Lo stato dirty include la bozza, mentre busy comprende trascinamento e commit, permettendo ai comandi nativi di acquisire il blocco e applicarla. Errori di validazione/ricostruzione interrompono il comando e mantengono la bozza.

Il testo usa annotazioni FreeText con sfondo trasparente e flag di stampa. `EPDFAnnot_SetDefaultAppearance` imposta il font standard, la dimensione e il colore; `EPDFAnnot_GenerateAppearance` genera l'aspetto da salvare. Le annotazioni estranee al marcatore non vengono modificate dall'editor. I limiti sono 10.000 caratteri occidentali per casella, 6–144 pt e 1.000 record di modifica per pagina; la dimensione del risultato resta limitata a 64 MB. La selezione parziale e gli appunti funzionano nel campo in linea, anche per caselle rilette da un PDF salvato. La formattazione è uniforme per casella. Il rendering dopo l'applicazione viene prodotto dal motore, mentre il campo di editing usa font di sistema.

Dalla 0.6.5 l'aspetto è generato direttamente sulla FreeText di destinazione. La sequenza imposta `EPDFAnnot_SetOpacity(annot, 255)`, aggiorna l'aspetto predefinito, rimuove l'AP precedente con `FPDFAnnot_SetAP(annot, 0, 0)` e chiama `EPDFAnnot_GenerateAppearance`; `FPDFAnnot_GetAP` deve restituire un flusso con operatori di disegno del testo. Il valore dell'API nativa è un alpha intero 0–255, mentre il wrapper di alto livello dell'SDK usa 0–1. Le versioni precedenti passavano 1 e salvavano `/CA = 1/255`. Il trasferimento intermedio dell'AP tramite documento/pagina produceva inoltre un wrapper con operatori `/FXE1 gs` e `/FXX1 Do` senza queste risorse nel suo dizionario. Il contenuto delle caselle era presente ma non visibile.

Il caricamento controlla soltanto le caselle `PDFMBText=1` dei documenti modificabili: opacità diversa da 255 oppure AP senza testo diretto attivano `textRepairNeeded`. Il controller conserva i byte originali immutabili e un flag di riparazione pendente incluso nello stato dirty. L'esportazione rigenera tutte le pagine dalla sorgente, ricrea gli aspetti delle caselle e carica il risultato nel viewer prima di restituire i byte all'host. `markSaved` azzera il flag soltanto dopo la scrittura riuscita; annullamento o errore mantengono la necessità di salvataggio. La sorgente continua a essere identificata come precedente alla correzione, anche dopo il salvataggio: le ricostruzioni e Annulla fino allo stato iniziale rigenerano gli aspetti anziché ripristinare i byte difettosi. La riparazione non aggiunge operazioni alla cronologia e non modifica le annotazioni estranee. Per PDF protetti resta disponibile soltanto la copia originale.

## Protocollo e salvataggio

Il ponte conserva l'envelope `version`, `kind`, `id`, `type`, `payload`, con risposte correlate ed errori. I comandi comprendono:

| Comando | Responsabilità |
| --- | --- |
| `document.open`, `document.close` | Apertura transazionale e rilascio della sessione |
| `editor.lock`, `editor.unlock` | Sincronizzazione con dialoghi e scritture del processo host |
| `editor.toggle` | Apertura/chiusura del pannello pagine |
| `editor.text` | Attivazione/disattivazione della modifica sulla pagina, dopo il blocco nativo |
| `editor.change` | Operazione `rotate-left`, `rotate-right`, `delete`, oppure `move` con posizione finale a partire da 1 |
| `editor.undo`, `editor.redo` | Cronologia delle operazioni sulle pagine |
| `editor.prepareInsert` | Preparazione del PDF di origine; richiede il token del documento e restituisce token di importazione, conteggi e posizione proposta |
| `editor.insert` | Conferma dell'inserimento con token di importazione, indici delle pagine a partire da 0 e posizione di destinazione a partire da 1 |
| `editor.cancelInsert` | Rilascio della sorgente preparata se ancora corrispondente al token |
| `editor.extract` | Esportazione della selezione corrente; richiede il token e il blocco nativo, restituisce byte Base64, token, revisione e conteggio delle pagine estratte |
| `document.export` | Byte del risultato corrente, token della sessione e revisione |
| `document.markSaved` | Conferma della revisione scritta e aggiornamento del nome corrente |

`editor.state` comunica token, revisione, modifiche pendenti, stato di sola lettura, disponibilità dei comandi, blocco temporaneo e motivo delle restrizioni. Include `canText`, `textEditing` e `textMode`: in modalità testo le scorciatoie vengono gestite dalla pagina web, conservando quelle locali nel campo. Una bozza modificata o un trascinamento disabilita gli altri comandi nativi; il blocco del solo host non rende inerte la superficie che sta modificando la bozza. Le elaborazioni invece rendono inerti sia pagina sia barra del testo. `viewer.state` comunica pagina, conteggio, zoom e dimensioni della superficie attiva. `host.open`, `host.save`, `host.saveAs`, `host.insert` e `host.extract` richiedono le azioni native dal viewer.

Il C# conserva i byte e l'impronta dell'ultima versione aperta o salvata. Prima della sostituzione sullo stesso percorso confronta l'impronta del file su disco; per altre destinazioni acquisisce l'impronta dopo la scelta del percorso. La scrittura usa un file temporaneo nella cartella di destinazione e `File.Replace` per un file esistente, oppure `File.Move` senza sovrascrittura per uno nuovo. Un conflitto propone Salva con nome, lasciando le modifiche in memoria.

Soltanto dopo la scrittura il C# conferma token e revisione. Il controller memorizza la configurazione delle pagine salvata, preservando la cronologia. Undo e redo possono quindi rendere il documento nuovamente modificato oppure riportarlo allo stato salvato.

Per l'estrazione il C# propone un nome con suffisso ` - estratto.pdf`, vieta i percorsi corrente e originale della sessione, acquisisce l'impronta della destinazione e riusa la scrittura atomica. Un conflitto esterno riapre il dialogo per un altro percorso. Non invia `document.markSaved`, non cambia il percorso corrente e non aggiunge il file estratto ai Recenti. Annullamento o errore lasciano invariata la sessione. I comandi restano bloccati fino alla conclusione della scrittura.

## Protezioni e limiti

La presenza di firme e i permessi di assemblaggio vengono controllati nel Worker sui byte iniziali. Firma presente, documento cifrato, permessi insufficienti o controllo fallito mantengono il documento in sola lettura. Non viene effettuata una verifica crittografica della firma. I documenti cifrati restano in sola lettura per non introdurre una riscrittura che potrebbe rimuovere la cifratura.

Gli stessi controlli vengono applicati al PDF di origine di un inserimento. In questo incremento non si importano pagine da PDF firmati, cifrati o senza permessi di assemblaggio. Il percorso della sorgente resta nel processo host e il file di origine non viene scritto.

La copia di un documento in sola lettura usa i byte iniziali e non può sostituire il percorso originale o corrente. Nessuna funzione certifica PDF/A; la riscrittura del PDF deve essere verificata sui documenti effettivamente utilizzati. Eliminare pagine non viene presentato come oscuramento o bonifica dei dati.

Anche l'estrazione richiede un documento modificabile: su PDF firmati, cifrati, senza permessi di assemblaggio o con controlli non disponibili è disabilitata; rimane disponibile la copia originale del documento intero.

Il testo richiede inoltre il bit di permesso per le annotazioni; il controllo viene ripetuto nel Worker sui byte originali durante la modifica e la ricostruzione. Mancando tale permesso, gli altri comandi sulle pagine possono rimanere disponibili ma **Testo** è disabilitato.

Un errore del Worker di editing conserva il risultato corrente, che può ancora essere salvato se il documento era modificabile; per riprendere l'editing occorre riaprirlo. Un timeout del ponte o un arresto di WebView2 blocca ulteriori operazioni sul viewer per evitare di associare byte e vista diversi.

## Sviluppi successivi

Dopo il testo libero seguono gli altri strumenti di annotazione, a partire da evidenziatore e nota adesiva. Seguono stampa e cattura; editing di oggetti e testo esistente; oscuramento effettivo; verifica PDF/A; integrazione DMS. **Sostituisci pagine…** è rinviato in fondo alla roadmap perché non prioritario. Il futuro editing dovrà integrare la propria cronologia e definire esplicitamente il trattamento di font, firme e documenti cifrati.

### Testo inserito — interazione diretta 0.6.0

Il testo inserito dovrà consentire la selezione di tutti o parte dei caratteri, la copia con Ctrl+C e l'incolla con Ctrl+V per inserirlo nuovamente. La copia dovrà rendere disponibile il testo anche ad altre applicazioni. Queste operazioni dovranno restare disponibili dopo il salvataggio e la riapertura del PDF. Il testo dovrà essere conservato come testo, senza convertirlo in un'immagine. Il requisito riguarda il contenuto testuale, oltre alla selezione della casella come oggetto; l'implementazione delle annotazioni dovrà prevedere un'interazione esplicita per accedere al testo e alla sua selezione.

La Release 0.6.0 sostituisce il dialogo della 0.5.0 con la barra sotto il nome e la modifica sulle pagine: posizione e dimensioni si impostano con il mouse; intere caselle si selezionano, copiano e incollano nella posizione del puntatore. Dalla 0.6.1 la barra Carattere compare solo in modalità testo e si nasconde tornando alla consultazione; il comando Testo della barra principale rimane il punto di ingresso. Il doppio clic consente la selezione dei singoli caratteri. Il normale strumento di selezione del viewer rimane dedicato al contenuto della pagina nella modalità di consultazione.

La barra di formattazione prende come riferimento il gruppo «Carattere» mostrato dall'utente. La prima parte comprende famiglia del font, dimensione con campo numerico e pulsanti aumenta/riduci, grassetto, corsivo e colore del testo. Il modello FreeText del pacchetto locale 2.15.1 espone direttamente font standard PDF, dimensione e colore; le famiglie iniziali sono Helvetica, Times e Courier, con le relative varianti grassetto/corsivo. La disponibilità di altri font, compreso Times New Roman esatto, richiederà la gestione dei font nel PDF e non dovrà essere simulata cambiando soltanto l'anteprima.

Sottolineato, barrato, apice, pedice, evidenziazione dei caratteri, maiuscole/minuscole e rimozione della formattazione completano il riferimento desiderato. Richiederanno una gestione aggiuntiva del testo formattato e delle relative apparenze PDF: la sola presenza dei campi `richContent` e `defaultStyle` nel modello non garantisce l'editing e il salvataggio di tutti questi stili. La formattazione di singoli intervalli e gli stili misti nella stessa casella andranno integrati senza perdere la selezione e la copia del testo. Gli stili disponibili dovranno conservarsi dopo salvataggio e riapertura e partecipare ad Annulla/Ripeti.


## Evidenziatore 0.7.0

`highlight-surface.mjs` si collega al plugin Selection del viewer EmbedPDF 2.15.1. Il pulsante nativo attiva/disattiva la modalità, il ToolStripComboBox adiacente sceglie il colore. Il cursore SVG a pennarello viene impostato tramite Interaction Manager con priorità superiore al cursore di selezione. La selezione resta gestita dal viewer e segue zoom, scorrimento e rotazioni, senza render alternativo. All’evento onEndSelection il controller copia i segmentRects di getFormattedSelection (rettangoli origin/size in coordinate pagina), il token, la revisione e il colore, poi accoda un unico commit anche su più pagine. La selezione rettangolare dello sfondo è disabilitata mentre il pennarello è attivo. Un cambio di documento disattiva lo strumento; la sostituzione del viewer dopo una modifica lo conserva e riaggancia gli eventi al nuovo documentId.

`highlight-engine.mjs` converte i quattro angoli di ogni rettangolo con FPDF_DeviceToPage e genera annotazioni Highlight native (subtype 9), marcate PDFMBHighlight=1 e NM=pdfmb-h-<uuid>. Il Worker ricontrolla geometria e permessi della sorgente, comprese pagine importate. L’elenco di eliminazione resta un popover nel viewer e non apre un secondo documento.

`PageEditor.highlightChanges` integra aggiunte e tombstone nella chiave dirty e negli snapshot della cronologia comune. La ricostruzione applica le annotazioni prima della rotazione permanente; le geometrie sono già in coordinate PDF. Eliminare un’annotazione aggiunta nella sessione rimuove il record, mentre eliminare una presente nella sorgente conserva un tombstone. Byte, modello e cronologia cambiano soltanto dopo il caricamento riuscito del risultato. Token e revisione impediscono l’uso di selezioni obsolete. Il Worker ricontrolla i permessi di annotazione sulla sorgente prima delle modifiche e della ricostruzione.

La 0.7.0 implementa il primo strumento della roadmap: evidenziatore. Segue la nota adesiva. Le prove delle caselle della 0.6.5 sono state completate dall’utente; la nuova checklist riguarda l’evidenziatore e le sue interazioni con il documento.
