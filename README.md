# PDF MB

**Il tuo editor PDF per Windows:** organizza pagine, modifica testi, aggiungi annotazioni, stampa e oscura contenuti. Tutto in locale.

## Stato del progetto e versione attuale

| Riferimento | Stato |
| --- | --- |
| **0.10.7** | Lucchetto aperto e comando Rimuovi password quando il PDF è protetto; clic per rimuovere la protezione, da confermare con Salva. Barra principale, Strumenti e modulo sincronizzati. Build completa nella [Release 0.10.7](https://github.com/bottalico75marco-maker/pdfMB/releases/tag/v0.10.6) e in `artifacts/app-0.10.7`. |
| **0.10.6** | Lucchetto aperto e comando Rimuovi password quando il PDF è protetto; clic per rimuovere la protezione, da confermare con Salva. Barra principale, Strumenti e modulo sincronizzati. Build completa nella [Release 0.10.6](https://github.com/bottalico75marco-maker/pdfMB/releases/tag/v0.10.6) e in `artifacts/app-0.10.6`. |
| **0.10.5** | Miniature del viewer e di Gestisci pagine complete di testo, data/ora e pulsanti del modulo, anche su pagine senza contenuti statici. Build locale in `artifacts/app-0.10.5`. |
| **0.10.4** | Moduli compilabili anche nella vista normale: pulsante email visibile, data/ora modificabili da tastiera e selettore, salvataggio e cronologia condivisi con la progettazione. Build locale in `artifacts/app-0.10.4`. |
| **0.10.3** | Avviso regex all’uscita dal campo, script PDF compatibili ECMAScript 5, riparazione delle validazioni precedenti e nuovo Strumenti → Immagine con upload e incorporamento statico al salvataggio. Build locale in `artifacts/app-0.10.3`. |
| **0.10.2** | Corretto Invio PDF nei lettori esterni: destinazione email URL ASCII, senza interpretazione come file locale. I pulsanti delle versioni precedenti sono riparati riaprendo e salvando il PDF. Build locale in `artifacts/app-0.10.2`. |
| **0.10.1** | Default `NOW()` per data e ora, upload immagine visibile nel campo e nelle proprietà anche in progettazione, lucchetto nella barra principale. Build locale in `artifacts/app-0.10.1`. |
| **0.10.0** | Validazione regex, campo data/ora con formati e calendario, upload immagini, pulsante email con PDF compilato e password AES-256. Build locale in `artifacts/app-0.10.0`. |
| **0.9.5** | Logo del biscione nerazzurro nella schermata iniziale al posto del riquadro PDF. Build locale in `artifacts/app-0.9.5`. |
| **0.9.4** | Icona del biscione nerazzurro applicata all’eseguibile e alle finestre. ICO trasparente in sette dimensioni, da 16 a 256 px. Build locale in `artifacts/app-0.9.4`. |
| **0.9.3** | Ripristinati i tooltip dei comandi a icona, incluso Gestisci pagine. Proposta grafica nero/azzurro con biscione in `docs/branding`, separata dall’icona dell’app. Build locale in `artifacts/app-0.9.3`. |
| **0.9.2** | Rimosse le due righe superiori con nome documento e menu; Progetta modulo spostato tra Testo ed Evidenziatore. Build locale in `artifacts/app-0.9.2`. |
| **0.9.1** | Barre e pulsanti a icone con tooltip; Progetta modulo fissato all’inizio della barra e disponibile nel menu Moduli; Nuovo documento e inserimento di pagine vuote A4/A5/A3, orientamento e cronologia; progettazione più reattiva, checkbox standard e dropdown a scelta singola. Build locale in `artifacts/app-0.9.1`. |
| **0.9.0** | Moduli PDF compilabili: progettazione dedicata con barra a icone, campi testo e checkbox, anteprima di compilazione, salvataggio e cronologia comune. Build locale in `artifacts/app-0.9.0`. |
| **0.8.4** | Build locale in `artifacts/app-0.8.4`: rettangoli ed ellissi senza campo note; Salva include anche le forme ancora da applicare; colore, spessore e aspetto conservati dopo riapertura. |
| **0.8.3** | Build locale in `artifacts/app-0.8.3`: preview live di testo/font/dimensione, tavolozza con 14 timbri statici e data, PNG personali trasparenti in raccolta locale. |
| **0.8.2** | Build locale in `artifacts/app-0.8.2`: selezione degli oggetti dal menu o dal PDF, apertura con trascinamento, registrazione come lettore PDF per Windows. |
| **0.8.0** | Versione storica con strumenti di annotazione, modifica oggetti, stampa, oscuramento e guida Windows, confluita in `main`. |
| **0.6.5** | Versione storica con correzioni del salvataggio delle caselle di testo; cartella binaria conservata nel repository. |

Questo README presenta le funzioni aggiornate alla **0.10.6**. Tutti i branch sono stati consolidati in `main`, unico ramo di sviluppo del progetto, conservando la cronologia completa. Per usare le nuove funzioni scegliere la build corrispondente.

**Collegamenti:** [Guida Windows](https://github.com/bottalico75marco-maker/pdfMB/blob/main/docs/GUIDA-WINDOWS.html) · [Checklist unica delle prove](https://github.com/bottalico75marco-maker/pdfMB/blob/main/docs/CHECKLIST-MANUALE.md) · [Build Windows su GitHub Actions](https://github.com/bottalico75marco-maker/pdfMB/actions) · [Architettura](https://github.com/bottalico75marco-maker/pdfMB/blob/main/docs/ARCHITETTURA.md)

## Installazione su Windows

1. Scaricare [PDF-MB-0.10.6-win-x64.zip](https://github.com/bottalico75marco-maker/pdfMB/releases/download/v0.10.6/PDF-MB-0.10.6-win-x64.zip) dalla [Release 0.10.6](https://github.com/bottalico75marco-maker/pdfMB/releases/tag/v0.10.6). La pagina include anche il checksum SHA-256.
2. Estrarre **l’intera cartella** dello ZIP.
3. Verificare la presenza di **.NET Desktop Runtime 10** e **Microsoft Edge WebView2 Runtime** su Windows a 64 bit.
4. Avviare **PdfMB.Desktop.exe**.

Tenere insieme EXE, DLL, cartelle `Web` e `ThirdParty` e `GUIDA-WINDOWS.html`. Per usare una build già compilata non servono Visual Studio, Node.js o l’SDK .NET.

Le build dei singoli commit restano disponibili tra gli artefatti della workflow **Verifica e build Windows** in GitHub Actions, dopo la riuscita dei controlli.

La guida si apre offline con **Aiuto → Guida Windows** o **F1**, nel browser predefinito. Include istruzioni per tutti gli strumenti e per la risoluzione dei problemi più comuni. La scritta fissa “Gestione pagine” in alto a destra è stata rimossa; il pulsante **Gestisci pagine** resta disponibile.

## Tutte le funzionalità disponibili nella 0.10.6

### Nuovo documento e pagine vuote

- **Nuovo documento…** con `Ctrl+N` o icona del foglio con +: scelta **A4, A5 o A3**, verticale oppure orizzontale.
- Il primo Salva chiede il percorso; fino ad allora il nuovo documento è segnalato come non salvato.
- **Inserisci pagina vuota…** dal menu contestuale delle miniature: formato, orientamento e posizione da 1 a N+1. L'inserimento partecipa ad Annulla/Ripeti.
- Tutti i comandi nelle barre e nei pulsanti dell'app usano icone con tooltip e nomi accessibili. I menu aggiungono icone ai nomi dei comandi; formati e altre proprietà restano leggibili nei campi di scelta.
- La barra principale occupa una sola riga, senza intestazione del documento né menu superiore. **Progetta modulo** si trova tra **Testo** ed **Evidenziatore**. Il menu Documento vuoto del viewer incorporato è stato rimosso.

### Apertura e consultazione

- Apertura mediante dialogo Windows, elenco degli ultimi dieci file, trascinamento di un PDF sulla finestra o percorso passato all’avvio.
- Registrazione in **Apri con** e comando **Aiuto → Imposta come lettore PDF predefinito…**: Windows permette di scegliere PDF MB per i file `.pdf`; il doppio clic apre il documento nel programma.
- Un documento alla volta, fino a **64 MB**.
- Miniature delle pagine, navigazione, ricerca e selezione/copia del testo quando consentite.
- Zoom, adattamento alla pagina, vista singola/affiancata e modalità di scorrimento.
- Rotazione della sola vista, senza modificare il contenuto del PDF.
- Barra di stato con pagina corrente, totale delle pagine, zoom e dimensioni della pagina.
- Conservazione del documento aperto se il caricamento del PDF successivo fallisce.

### Salvataggio e cronologia

- **Salva** sul percorso corrente e **Salva con nome…** su un nuovo percorso, che diventa quello corrente.
- Nome del documento e asterisco nella barra del titolo della finestra per le modifiche pendenti.
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

L’evidenziatore usa la selezione nativa del viewer e mantiene zoom, scorrimento e rotazioni. Non apre una finestra alternativa e non disegna rettangoli liberi sullo sfondo. Per eliminare un tratto, fare **clic destro sull’evidenziazione → Elimina evidenziazione**, anche dopo salvataggio e riapertura. Il comando agisce sul tratto cliccato. Le evidenziazioni sono incluse nel salvataggio, nell’estrazione e nella cronologia comune.

### Note adesive, forme e penna

Dal menu **Strumenti** sono disponibili **Nota adesiva, Rettangolo, Ellisse, Linea e Penna**. I controlli compaiono sopra il documento e si opera direttamente sulle pagine del viewer, mantenendo disponibili zoom, scorrimento e rotazione della vista. **Chiudi** o `Esc` termina la modalità strumenti.

- Le note hanno un contenuto testuale modificabile.
- Forme e disegni hanno colore e spessore selezionabili, senza campo note/commento.
- Posizione e dimensioni si impostano cliccando o trascinando sulla pagina di lavoro.
- **Applica** conferma la modifica in memoria; **Salva** la conserva nel file e conferma anche la forma ancora in anteprima.
- L’elenco degli elementi mostra quelli dello strumento corrente e permette di aggiornare le note, cambiare colore/spessore dei disegni ed eliminare gli elementi di PDF MB, anche dopo riapertura.
- Le annotazioni sono PDF native; quelle di altri programmi vengono conservate e non sono modificabili dall’elenco dell’app.
- I pulsanti Pagina precedente/successiva navigano il PDF aperto; si può anche scorrere o iniziare una selezione su un’altra pagina.

### Immagini statiche

**Strumenti → Immagine** permette di disegnare un riquadro e cliccarlo per caricare o sostituire un PNG/JPEG. Un singolo clic crea il riquadro iniziale e apre direttamente il caricamento; è disponibile anche il selettore file nella barra.

- Anteprima nel riquadro con proporzioni e trasparenza conservate; stessi limiti di upload dei campi immagine.
- **Applica** oppure direttamente **Salva** incorpora l’immagine nel contenuto della pagina, senza widget, azioni o possibilità di ricaricarla facendo clic nel lettore PDF. Un riquadro senza immagine richiede di completare il caricamento o scartare la selezione.
- Annulla/Ripeti comune, conservazione di testi e campi esistenti, estrazione e riapertura. È richiesto il permesso di modifica del contenuto.
- Il campo immagine nella progettazione modulo resta invece un controllo di upload interattivo.

### Modifica del testo e degli oggetti originali

**Strumenti → Modifica testo e oggetti** permette di selezionare un oggetto sulla pagina o dall’elenco.

- **Sostituire il testo** di un singolo oggetto con un nuovo oggetto testuale nella stessa posizione e ordine: il vecchio contenuto non viene semplicemente coperto.
- Scegliere **Helvetica, Times o Courier**, con dimensione **6–144 pt**.
- Vedere **l’anteprima live sulla pagina** mentre si modificano testo, font e dimensione. L’anteprima usa il motore PDF e non aggiunge cronologia; **Applica** conferma e **Annulla anteprima** ripristina l’originale.
- **Spostare, scalare, ruotare o eliminare** testo, immagini, tracciati e gruppi.
- Applicare le modifiche alla cronologia comune e conservarle dopo salvataggio/riapertura.

L’editor lavora sui singoli oggetti: non ricompone paragrafi e non modifica gli elementi interni dei gruppi/Form XObject. Il testo sostitutivo è occidentale, su una riga e fino a 10.000 caratteri; il font standard scelto può cambiare la larghezza rispetto all’originale. Verificare il risultato su pagine complesse, con ritagli, link, segnalibri o moduli.

### Timbri statici e personali

**Strumenti → Timbri** apre una tavolozza con Approvato, Come è, Confidenziale, Dipartimentale, Brutta copia, Esperimento, Scaduto, Finale, Per commento, Per il pubblico rilasciato, Non approvato, Non per rilascio pubblico, Venduta e Segretissimo.

- **Data** permette di scegliere giorno e formato italiano; il valore inserito nel PDF resta statico.
- **Carica PNG personale** importa un’immagine trasparente nella raccolta locale, disponibile anche dopo riavvio. PNG fino a 8 MB, 4096 pixel per lato e 8 milioni di pixel; l’importazione ottimizza il lato maggiore a 1200 pixel senza aggiungere sfondi.
- Clic sulla pagina per la dimensione iniziale oppure trascinamento e campo **Larghezza mm** per dimensionarla. Le proporzioni sono bloccate; la dimensione iniziale arriva a circa **64 × 35 mm**, riducendosi per pagine piccole e immagini strette o alte.
- **Applica** aggiunge un’annotazione Stamp al PDF; **Salva** la conserva. Timbri applicati selezionabili dall’elenco e rimovibili; Annulla/Ripeti opera nella cronologia comune.
- Fino a 25 PNG personali, conservati in `%LOCALAPPDATA%\PdfMB\Stamps`. La libreria non contiene i documenti PDF.

### Moduli compilabili

L'icona **Progetta modulo** apre una modalità dedicata: nasconde gli altri strumenti e mostra una barra a icone con tooltip e nomi accessibili. Si parte da un PDF esistente oppure da un nuovo documento vuoto.

- Campi testo ed elenchi a tendina disegnati sulla pagina; checkbox inserite con un clic a **16 × 16 pt**, subito ridimensionabili. Tutti i campi si possono selezionare, spostare, ridimensionare ed eliminare.
- Dropdown con **1–200 opzioni**, una per riga, scelta singola e valore predefinito facoltativo. Opzioni, scelta corrente e proprietà restano nel PDF salvato.
- Aggiornamenti senza attesa del visualizzatore nascosto e trascinamento diretto dei campi.
- Nome univoco, descrizione, valore predefinito, obbligatorio e sola lettura; per il testo multilinea, limite caratteri, font, dimensione e colore.
- I campi PDF MB si compilano anche nella **vista normale**: testo, data/ora con selettore, checkbox, dropdown, immagine da upload e pulsante email. La compilazione usa la stessa cronologia e lo stesso salvataggio della progettazione; i campi in sola lettura conservano la restrizione. `NOW()` resta un valore predefinito e non blocca la modifica di data/ora.
- L'occhio alterna progettazione e compilazione; il dischetto salva anche la bozza del campo e l'ultimo valore digitato. La porta con freccia ripristina gli strumenti ordinari.
- Campi AcroForm interattivi dopo riapertura, Annulla/Ripeti comune, conservazione durante le operazioni sulle pagine; nomi in conflitto rinominati durante l'importazione.
- **Regex** nelle proprietà del testo, senza delimitatori `/.../`: corrispondenza dell’intero valore e messaggio personalizzabile. Esempio: `[A-Z]{2}[0-9]{6}`. Una regex o un valore non valido mantiene la bozza correggibile. Un valore non valido mostra un avviso all’uscita dal campo in Compila modulo. Gli script dei PDF esportati usano sintassi compatibile ECMAScript 5; nei lettori esterni le azioni JavaScript devono essere abilitate. I moduli precedenti con regex/data si aggiornano riaprendo e salvando nella nuova versione.
- **Data e ora**: un unico campo con nove formati per sola data, sola ora o entrambe, tra cui `gg/mm/aaaa`, `aaaa-mm-gg`, `HH:mm`, `HH:mm:ss` e `gg/mm/aaaa HH:mm`. Valore predefinito `NOW()` per data e ora locali correnti, calcolato quando si applica il campo nel formato scelto; i valori compilati restano conservati. Digitazione e selettore calendario/orario; controllo dei giorni del mese, anni bisestili e intervalli dell’ora.
- **Immagine da upload**: **Carica immagine…** direttamente nel campo selezionato o nelle proprietà, disponibile anche in progettazione; in Compila modulo, clic sul campo per scegliere PNG/JPEG fino a 8 MB e 16 milioni di pixel. Riduzione a 1200 pixel sul lato maggiore e massimo circa 1 MB incorporato, proporzioni conservate, sostituzione/rimozione e Annulla/Ripeti.
- **Pulsante email**: etichetta e destinatario facoltativo. In compilazione controlla i campi obbligatori e apre il client di posta con il PDF aggiornato allegato, anche prima di Salva. Usa MAPI; se non disponibile apre una bozza `.eml` con allegato, quando il sistema dispone di un’app associata. Nei PDF salvati la destinazione `mailto:` è una specifica URL esplicita in ASCII. Per aggiornare un PDF delle versioni 0.10.0/0.10.1, riaprirlo nella nuova app e premere Salva, senza dover ricreare i campi. Un lettore esterno può comunque chiedere una conferma prima di aprire il client email. Le bozze `.eml` restano nella cartella temporanea `%TEMP%\PdfMB\Email`.
- **Proteggi con password**: lucchetto nella barra principale accanto a Salva, nella barra del modulo oppure Strumenti → Proteggi con password. Password ripetuta due volte, applicata con Salva mediante AES-256. Riapertura con password e protezione mantenuta nei salvataggi, negli allegati email e nelle estrazioni; campi e immagini restano modificabili. Quando il PDF è protetto il pulsante diventa un lucchetto aperto con il comando **Rimuovi password**: cliccarlo e salvare per rimuovere la protezione.
- Fino a 1.000 campi; caratteri occidentali, accenti ed euro. Modifica e compilazione riguardano i campi creati da PDF MB. Radio, elenchi a selezione multipla, XFA e calcoli non sono inclusi. Nei lettori esterni regex, importazione immagini e invio email dipendono dal supporto alle azioni PDF e dalle impostazioni di sicurezza; in PDF MB sono gestiti dall’app.

### Stampa

**Stampa… / Ctrl+P** prepara il documento corrente, comprese le modifiche applicate ma non ancora salvate. L’anteprima separata offre il dialogo di stampa del browser per scegliere stampante, intervallo, copie, orientamento e scala.

La stampa è raster, fino a **144 dpi** oppure **72 dpi** se il documento permette solo bassa qualità. Il limite per lavoro è **500 pagine e 36 MB di immagini**; per documenti più grandi si possono estrarre intervalli e stamparli separatamente.


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
- Permessi separati per annotazioni, modifica del contenuto, copia e stampa, ricontrollati anche sulle sorgenti importate.
- Documenti firmati, senza permessi di assemblaggio o con controlli falliti mantenuti in sola consultazione. I PDF protetti creati da PDF MB si riaprono con la password e mantengono la cifratura nei successivi salvataggi; per PDF con password proprietario distinta occorre quella del proprietario. I documenti con sole restrizioni e password di apertura vuota restano in sola consultazione.
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
- OCR non ancora gestito; progettazione e compilazione dedicate ai campi creati da PDF MB. L’apertura di PDF cifrati e firmati insieme non è supportata. Per l’inserimento di pagine da un PDF protetto aprirlo prima con la password e salvarne una copia senza protezione.
- Font remoti di fallback disabilitati: un PDF con font mancanti può richiedere una verifica sull’originale.
- Fino a 1.000 modifiche a caselle o evidenziazioni per pagina; fino a 1.000 rettangoli per tratto di evidenziatore e pagina.
- La superficie Strumenti ispeziona pagine con un massimo di 2.000 oggetti/annotazioni.
- Alcune finestre interne del viewer possono mostrare testo inglese di fallback.
- Nessuna certificazione della validità delle firme digitali o della conformità PDF/A.
- Dopo ricostruzioni/importazioni verificare segnalibri, link interni, annotazioni e moduli sui PDF effettivamente utilizzati.

## Changelog di tutte le versioni disponibili

La cronologia seguente è ricostruita dai sorgenti, dalla documentazione e dalle cartelle versionate presenti nel repository. Non vengono inventate date di rilascio o modifiche non documentate. Le versioni sviluppate nei branch precedenti e le relative cartelle applicative sono ora consolidate in `main`.

| Versione | Funzionalità e modifiche |
| --- | --- |
| **0.8.0** | Note adesive modificabili; rettangoli, ellissi, linee e penna; stampa con anteprima; modifica del testo originale per oggetto, trasformazione/eliminazione di oggetti; oscuramento effettivo mediante ricostruzione raster; sorgenti immutabili nella cronologia; controlli separati dei permessi; correzione dei canali colore e rendering degli aspetti dei moduli; test con PDFium reale, prova browser e workflow di build Windows. Aggiornamento successivo della stessa versione: guida Windows offline, menu Aiuto/F1 e rimozione dell’etichetta fissa “Gestione pagine” in alto a destra. |
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

Tecnologie: **C# / WinForms, .NET 10, WebView2 ed EmbedPDF/PDFium 2.15.1**. I sorgenti aggiornati sono nel ramo `main`.

Su Windows, con SDK .NET 10, Node.js 24 e WebView2 Runtime:

```powershell
git clone https://github.com/bottalico75marco-maker/pdfMB.git
cd pdfMB
git switch main
npm ci
npm run assets
npm test
dotnet build PdfMB.sln -c Release
dotnet run --project src/PdfMB.Desktop
```

Pubblicazione della cartella Windows a 64 bit:

```powershell
dotnet publish src/PdfMB.Desktop -c Release -r win-x64 --self-contained false -o artifacts/app-0.10.6
```

Prova browser facoltativa:

```powershell
npx playwright install chromium
npm run test:browser
```

Sono state eseguite verifiche automatiche su cronologia, errori, permessi, pixel, annotazioni e oggetti con PDFium WASM reale, salvataggio/riapertura e flusso Chromium con trasporto WebView2 simulato, oltre alla compilazione/pubblicazione per Windows. La [checklist unica](https://github.com/bottalico75marco-maker/pdfMB/blob/main/docs/CHECKLIST-MANUALE.md) raccoglie le prove della finestra Windows, della stampante e dei documenti reali da completare prima di considerare consolidata la nuova versione.

Le licenze e gli avvisi delle dipendenze sono inclusi nella distribuzione, in `ThirdParty` e `Web/vendor/THIRD-PARTY-NOTICES.txt`.

## Roadmap restante

- **Verifica della conformità PDF/A.**
- **Conversione da PDF a PDF/A.**
- Ampliamenti delle caselle: font aggiuntivi, stili misti/per intervallo, sottolineato, barrato, apice/pedice ed evidenziazione dei caratteri.

Integrazione DMS e sostituzione pagine sono state rimosse dalla roadmap. La verifica dei referti CDA R2 è rinviata a una valutazione futura.
