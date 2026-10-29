# Markdown e OCR locale 0.11.0

- [ ] Aprire un PDF con testo e due foto: Confronta Markdown mostra PDF a sinistra e editor/anteprima a destra. Converti testo produce `nomefile.pdf.md` in UTF-8, con sezioni delle immagini.
- [ ] Senza Ollama, con servizio fermo, modello assente o modello solo testo: OCR con icona di scansione disattivato sia nella barra principale sia nel pannello. La conversione del testo funziona.
- [ ] Installare e avviare un modello visivo locale: Verifica modello abilita OCR. Le due immagini vengono estratte e inviate una alla volta, con descrizioni distinte nella pagina corretta.
- [ ] Provare una scansione e un’immagine dentro un gruppo PDF; confrontare trascrizione e descrizione con l’originale. Nessuna schermata di pagina deve essere usata al posto dell’immagine estratta.
- [ ] Modificare titoli, paragrafi e descrizioni: anteprima immediata, Annulla locale, Ctrl+S salva MD. Navigazione Pagina e clic/cursore nel Markdown seguono i marcatori di pagina.
- [ ] Interrompere OCR, verificare il risultato parziale e salvarlo. Riaprire il PDF e il pannello per ritrovare il `.pdf.md`.
- [ ] Cambiare documento/uscire con MD modificato: Salva, Non salvare e Annulla; ripetere con PDF e MD entrambi modificati. Nascondere il pannello non perde il testo.
- [ ] Modificare il `.md` da un altro editor: Salva MD deve rifiutare il conflitto. Salva MD con nome conserva entrambe le versioni. Provare PDF senza permesso di copia.

# Logo schermata iniziale 0.9.5

- [ ] Avviare `artifacts/app-0.9.5/PdfMB.Desktop.exe` senza documenti: al posto del vecchio riquadro PDF compare il biscione nero/azzurro, centrato sopra PDF MB · DOCUMENTI.
- [ ] Verificare Nuovo/Apri e il ritorno alla schermata iniziale dopo la chiusura del documento.

# Icona pdfMB 0.9.4

- [ ] Estrarre `PDF-MB-0.9.4-win-x64.zip`: l’eseguibile mostra il biscione nerazzurro in Esplora file. Provare icone piccole, medie e grandi.
- [ ] Avviare la build: icona del biscione nel titolo, nella barra applicazioni e nelle finestre dell’app, compresa l’anteprima di stampa.
- [ ] Verificare trasparenza e leggibilità con ridimensionamento Windows al 100%, 150% e 200%.

# Tooltip PDF MB 0.9.3

- [ ] Aprire `artifacts/app-0.9.3/PdfMB.Desktop.exe`, caricare un PDF e fermare il puntatore su Gestisci pagine: compare «Mostra o nascondi Gestisci pagine».
- [ ] Verificare i suggerimenti anche per Strumenti, Stampa, Chiudi documento, Recenti e Aiuto, oltre ai comandi con scorciatoie.

# Interfaccia PDF MB 0.9.2

- [ ] Aprire `artifacts/app-0.9.2/PdfMB.Desktop.exe`: assenti la riga del nome documento e la riga menu File/Pagine/Moduli, anche dopo apertura e modifica di un PDF.
- [ ] Progetta modulo si trova tra Testo ed Evidenziatore, con icona e tooltip; resta visibile alla larghezza minima. Verificare ingresso/uscita dalla modalità.
- [ ] Nome e asterisco delle modifiche restano nella barra del titolo. Nuovo documento si apre dalla barra o con Ctrl+N; inserimento pagina vuota e da PDF restano nel menu delle miniature.
- [ ] Verificare che il PDF inizi subito sotto la barra principale, senza spazi lasciati dalle righe rimosse.

# Novità PDF MB 0.9.1

- [ ] Aprire `artifacts/app-0.9.1/PdfMB.Desktop.exe`, anche alla larghezza minima: Progetta modulo resta la prima icona dopo il titolo, con tooltip e percorso Moduli → Progetta modulo.
- [ ] Verificare icone, tooltip e nomi accessibili nelle barre, nei dialoghi e nei menu. Il vecchio menu Documento vuoto del viewer non compare.
- [ ] File → Nuovo documento…: provare A4, A5 e A3, verticale e orizzontale; il primo Salva chiede il percorso. Annullare il dialogo non sostituisce il documento corrente.
- [ ] Nuovo documento con lavoro pendente: provare Salva, Non salvare e Annulla. Non deve essere creato un file automaticamente nella cartella dell'app.
- [ ] Pagine → Inserisci pagina vuota… e menu delle miniature: provare prima pagina, posizione intermedia e fondo; controllare formati, orientamento, Undo/Redo e conservazione di testi e moduli esistenti.

- [ ] Progetta modulo: applicare campi e cambiare pagina senza attese ripetute; uscire dalla modalità e verificare pagina, zoom e strumenti ordinari.
- [ ] Checkbox: inserire con un clic (16 × 16 pt), poi ridimensionare la bozza dalla maniglia prima di applicarla; salvare e riaprire.
- [ ] Dropdown: inserire più opzioni, una per riga; scegliere un valore predefinito, compilare con una scelta diversa e salvare. Verificare opzioni e scelta dopo riapertura, Undo/Redo, importazione e con un altro lettore PDF.
- [ ] Rifiutare opzioni duplicate, vuote o oltre i limiti; consentire Nessuna scelta senza perdere le opzioni.

# Moduli PDF MB 0.9.0

- [ ] Aprire `artifacts/app-0.9.0/PdfMB.Desktop.exe` e verificare la versione nel titolo.
- [ ] Premere l'icona Progetta modulo: spariscono gli altri strumenti e compare la barra dedicata con icone e tooltip.
- [ ] Creare testo e checkbox; provare proprietà, spostamento, maniglia di ridimensionamento, cancellazione e scarto della bozza.
- [ ] Provare multilinea, caratteri accentati/euro, obbligatorio, sola lettura e nomi duplicati.
- [ ] Salvare un campo senza premere Applica e un valore ancora a fuoco; chiudere e riaprire il file.
- [ ] Alternare Progetta/Compila con l'occhio, compilare da tastiera, usare Annulla/Ripeti e uscire con la porta.
- [ ] Verificare il ripristino della barra principale dopo l'uscita e la conservazione delle modifiche.
- [ ] Compilare e salvare il PDF con Acrobat Reader e Microsoft Edge, poi riaprirlo in PDF MB.
- [ ] Verificare stampa, pagine ruotate, CropBox, inserimento con nomi in conflitto ed estrazione delle sole pagine selezionate.
- [ ] Oscurare una pagina: i suoi campi diventano statici e scompaiono dall'albero dei dati; le altre pagine conservano i loro campi.

# Prova unica PDF MB 0.8.4

Questo è il riferimento per provare insieme evidenziatore e nuovi punti 2–5. Le prove delle caselle della 0.6.5 sono già state completate dall’utente; sotto si controllano soltanto le interazioni con i nuovi strumenti. Usare copie dei propri PDF, conservando gli originali per il confronto.

## Preparazione

- [ ] Scaricare l’artefatto **PDF-MB-0.8.4-win-x64** dalla workflow **Verifica e build Windows** del commit della PR. Estrarre tutta la cartella e avviare PdfMB.Desktop.exe. Devono essere installati .NET Desktop Runtime 10 e WebView2 Runtime.
- [ ] Verificare la versione 0.8.4 nella barra. Non usare l’EXE storico della 0.6.5.
- [ ] Preparare: PDF testuale di almeno 3 pagine; PDF con immagini e tracciati; scansione senza testo; pagina con CropBox/rotazioni; PDF con note/moduli/link/segnalibri; PDF firmato/cifrato/con permessi ridotti. Per l’oscuramento usare una parola di prova univoca e una zona di immagine riconoscibile.
- [ ] Registrare per ogni problema file, pagina, comando, risultato atteso/osservato e screenshot. Non inviare referti o altri dati personali se non necessari: si possono riprodurre i casi su dati di prova.

## Guida e barra Windows

- [ ] In alto a destra non compare la scritta Gestione pagine; il pulsante Gestisci pagine continua a funzionare.
- [ ] Aiuto → Guida Windows apre la guida locale nel browser predefinito anche senza un PDF aperto. F1 apre la stessa guida, anche con il focus sul viewer.
- [ ] La cartella estratta contiene GUIDA-WINDOWS.html accanto all’EXE; la guida è consultabile offline, indice e collegamenti interni funzionano e la stampa dal browser è leggibile.
- [ ] Trascinare un PDF sulla pagina, sulla barra e sulla zona del nome file: apertura nel programma. Provare file con spazi, estensione PDF maiuscola, documenti grandi/non validi e più file: niente navigazione esterna o perdita del PDF già aperto.
- [ ] Con modifiche pendenti, trascinare un altro PDF e provare Salva / Non salvare / Annulla: il flusso deve essere quello di Apri PDF.
- [ ] Aiuto → Imposta come lettore PDF predefinito apre le impostazioni Windows; PDF MB compare per `.pdf` e in Apri con. Dopo averlo scelto, doppio clic su un PDF con spazi nel percorso apre il documento. Nessuna modifica automatica alla scelta del lettore predefinito.

## 1. Evidenziatore nel PDF

- [ ] Pulsante attivo → cursore a pennarello sul PDF; select del colore adiacente con Giallo/Verde/Azzurro/Rosa/Arancione. Nessuna finestra alternativa.
- [ ] Trascinare sul testo selezionabile; al rilascio compare il colore scelto. Ripetere più tratti e cambiare colore. Lo strumento resta attivo.
- [ ] Provare selezione inversa, più righe e più pagine, zoom e rotazioni. Ogni gesto deve essere un solo Annulla/Ripeti e corrispondere alla selezione.
- [ ] Secondo clic/Esc → selezione e copia normali, senza evidenziare. Sfondo e scansione senza OCR non devono produrre rettangoli liberi.
- [ ] Eliminare un’evidenziazione, annullare/ripetere, salvare e riaprire; verificare anche con lettore esterno.

## 2. Note e disegni

- [ ] Strumenti → Nota adesiva: scrivere testo con accenti, cliccare sulla pagina, applicare. Deve comparire una nota nel PDF e nell’elenco.
- [ ] Selezionare la nota dall’elenco, cambiare contenuto, applicare; salvare/riaprire e rileggere il contenuto. Eliminare e usare Annulla/Ripeti.
- [ ] Disegnare rettangolo, ellisse, linea (anche orizzontale, verticale e con pendenza inversa) e penna; provare colore/spessore. Dopo Applica e riapertura devono restare nello stesso punto e poter essere eliminati dall’elenco.
- [ ] Rettangolo ed ellisse non mostrano campi note/commento. Su un PDF appena aperto disegnarli e premere direttamente Salva senza Applica: riaprendo il file devono essere visibili. Riprovare cambiando colore/spessore di una forma salvata e verificare il risultato dopo riapertura.
- [ ] Spostarsi tra pagine con i pulsanti degli strumenti; le modifiche applicate restano. Con una bozza, Chiudi/cambio strumento chiede se scartarla; annullando la domanda, la bozza deve restare.
- [ ] Aprire un PDF con annotazioni di altri programmi: devono restare inalterate, senza possibilità di cancellarle dall’elenco delle annotazioni PDF MB.

## 3. Stampa

- [ ] Con modifiche applicate ma non salvate, Stampa… o Ctrl+P deve mostrare il risultato corrente su tutte le pagine. Confrontare anteprima e PDF.
- [ ] Scegliere stampante/stampa PDF, intervallo, copie, orientamento e scala. Provare fogli verticali/orizzontali, dimensioni diverse e una pagina con campi modulo compilati. Controllare che nulla sia tagliato o perso.
- [ ] Annullare il dialogo di stampa: documento, cronologia, percorso e dirty invariati. Provare il messaggio oltre 500 pagine/36 MB e ristampare intervalli estratti.

## 4. Testo e oggetti originali

- [ ] Strumenti → Modifica testo e oggetti: scegliere sulla pagina e dall’elenco un oggetto Testo. Sostituire il contenuto con Helvetica/Times/Courier, dimensione 6–144, e applicare.
- [ ] Cercare/copiare il nuovo testo dopo salvataggio/riapertura; il vecchio oggetto deve essere stato rimosso, senza una semplice copertura. Controllare posizione, larghezza, colore e sovrapposizioni: non c’è ricomposizione dei paragrafi.
- [ ] Provare lettere accentate e €. Un carattere non supportato o testo su più righe deve produrre un errore esplicito senza cambiare il PDF.
- [ ] Su testo, immagine, tracciato e gruppo: provare spostamento X/Y, scala, rotazione ed eliminazione. Le trasformazioni si applicano all’oggetto selezionato; i gruppi sono unità intere.
- [ ] Controllare Annulla/Ripeti dopo ogni operazione e dopo Salva. Verificare documenti complessi, contenuti ritagliati, link, segnalibri e moduli sulle pagine ricostruite.

## 5. Oscuramento effettivo

- [ ] Selezionare l’area della parola di prova e una porzione di immagine. Leggere la conferma: l’intera pagina diventa immagine, perde testo selezionabile e oggetti/moduli/annotazioni modificabili; metadati, allegati e segnalibri del documento vengono esclusi.
- [ ] Annullare la conferma: nessuna modifica. Ripetere e applicare: l’area è nera, il resto resta leggibile e orientato correttamente. Provare zoom, CropBox e rotazioni 90/180/270°.
- [ ] Salvare con un nome nuovo, chiudere e riaprire in PDF MB e in un lettore esterno. Cercare/copiare la parola dalla pagina oscurata: non deve esserci un livello testuale. Tentare selezione/modifica/rimozione del riquadro: non deve rivelare il contenuto originale.
- [ ] Ispezionare il PDF risultante: la pagina oscurata ha solo l’immagine ricostruita; assenza di allegati/metadati/segnalibri originali. I dati ripetuti su altre pagine non selezionate possono restare: verificare tutte le aree che si desidera oscurare.
- [ ] Nella sessione ancora aperta provare Annulla/Ripeti e Salva dopo Annulla: il contenuto ripristinato deve essere considerato nuovamente presente. Condividere soltanto la versione salvata dopo l’oscuramento.
- [ ] Aggiungere una nuova nota/casella/evidenziazione dopo l’oscuramento, salvare e riaprire: il contenuto originale non deve ricomparire. Ruotare/spostare/estrarre la pagina e ripetere il controllo.

## 6. Prova incrociata e protezioni

- [ ] Sullo stesso documento: evidenzia → nota → forma → modifica testo → sposta/ruota pagina → casella → stampa → oscuramento → salva/riapri. Annulla/Ripeti deve attraversare tutte le modifiche, con un’azione per comando e dirty coerente.
- [ ] Su PDF firmato/cifrato: nessuna modifica e copia originale conservata. La stampa deve rispettare i relativi permessi. Senza permesso annotazioni: note/forme/evidenziatore disabilitati; senza permesso modifica: oggetti/oscuramento disabilitati.
- [ ] Provare pagine importate con permessi diversi: nessuna operazione deve aggirare i permessi della sorgente. Provare anche inserimento, eliminazione ed estrazione dopo una modifica di contenuto.
- [ ] File destinazione modificato da un altro programma, errore di scrittura, risultato oltre 64 MB o sorgenti/cronologia oltre 128 MB: lavoro precedente recuperabile, dirty non cancellato e nessuna scrittura parziale.
- [ ] Scala Windows 100/125/150/200%, finestra ridotta e monitor diversi: comandi raggiungibili, selezioni allineate e dialoghi utilizzabili.

## Verifiche automatiche disponibili

Eseguire dalla radice: `npm ci`, `npm run assets`, `npm test`, `dotnet build PdfMB.sln -c Release`. Per il browser: `npx playwright install chromium`, `npm run test:browser`. La workflow GitHub esegue le stesse verifiche e pubblica la cartella Windows come artefatto.

Le suite coprono cronologia/sorgenti immutabili/errori/permessi, coordinate e sostituzione dei pixel, PDFium reale con note e forme, testo/oggetti, oscuramento e riapertura, Worker completo e un flusso Chromium con trasporto WebView2 simulato. La prova della finestra Windows, del dialogo stampante e dei documenti reali resta da segnare sopra. Le sezioni storiche sotto restano come riferimento per casi più dettagliati.

---

# Prove manuali — gestione pagine base

Le prove sul programma sono affidate all'utente. È stata effettuata la compilazione Release e la verifica sintattica dei moduli JavaScript; questi controlli non verificano il comportamento dell'applicazione.

Avviare `artifacts/app-0.6.5/PdfMB.Desktop.exe`. Usare copie di documenti di prova, compreso un PDF di almeno cinque pagine riconoscibili, un PDF con pagine già ruotate, uno scannerizzato e uno con dimensioni miste. Per l'inserimento preparare un secondo PDF con almeno cinque pagine riconoscibili e diverse dal primo. Tenere una copia iniziale per controllare il risultato.

La versione aggiornata mostra **PDF MB 0.6.5** nella barra dei comandi e nel titolo della finestra. Il percorso versionato permette di distinguerla dalle pubblicazioni precedenti ancora aperte.

## Selezione e posizione finale

| Cosa provare | Risultato atteso |
| --- | --- |
| Apri PDF e Gestisci pagine | Miniature di gestione visibili, prima pagina selezionata; il pannello standard lascia spazio al nuovo pannello |
| Clic sinistro su una miniatura | Selezione e visualizzazione della pagina, senza apertura del menu |
| Clic destro su una miniatura | Menu a elenco con Ruota a sinistra/destra, Elimina, Sposta…, Inserisci… ed Estrai pagine… |
| Ctrl/Maiusc+clic su più miniature, poi clic destro su una di quelle selezionate | Selezione multipla conservata; il menu indica quante pagine verranno modificate |
| Clic destro su una pagina fuori dalla selezione | Selezione della sola pagina cliccata e apertura del suo menu |
| Maiusc+F10 o tasto Menu sulla miniatura con focus | Apertura del menu anche da tastiera |
| Clic fuori dal menu, Esc, scorrimento miniature o ridimensionamento | Menu chiuso, nessuna modifica; Esc riporta il focus alla miniatura |
| Frecce, Invio e Spazio nel menu | Comandi navigabili e attivabili; le azioni non consentite restano disabilitate |
| Ctrl+clic su pagine separate | Aggiunta/rimozione dalla selezione senza cancellare le altre selezioni |
| Maiusc+clic e Ctrl+Maiusc+clic | Selezione dell'intervallo dall'ancora; Ctrl aggiunge l'intervallo alla selezione esistente |
| Frecce, Inizio/Fine nel pannello; Ctrl+A | Spostamento del focus e selezione; Ctrl+A seleziona tutte le pagine |
| Sposta… con una pagina selezionata | Finestra che chiede la posizione finale, con Sposta e Annulla |
| Seleziona pagine 2 e 4, posizione 1 | Ordine finale: **2, 4, 1, 3, 5…**; il blocco conserva il proprio ordine |
| Seleziona pagine 2 e 4, posizione 2 | Ordine finale: **1, 2, 4, 3, 5…** |
| Seleziona pagine 2 e 4 in un PDF di 5 pagine, posizione 4 | Ordine finale: **1, 3, 5, 2, 4**; 4 è l'ultima posizione ammessa |
| Selezione effettuata in ordine inverso con Ctrl+clic | Lo spostamento mantiene l'ordine nel documento, non quello dei clic |
| Posizione vuota, zero, negativa, decimale o oltre il massimo | Validazione visibile; nessuna modifica al documento |
| Annulla o Esc nella finestra Sposta | Nessuna modifica a ordine, selezione, asterisco o cronologia |
| Spostamento che lascia invariato l'ordine | Nessuna nuova voce Annulla; documento non segnato come modificato |

## Rotazione, eliminazione e cronologia

| Cosa provare | Risultato atteso |
| --- | --- |
| Ruota a destra/sinistra una pagina | Rotazione permanente solo della pagina selezionata; miniature e vista aggiornate |
| Ruota una pagina già ruotata nel PDF iniziale | La nuova rotazione si somma a quella originale |
| Ruota più pagine | Un solo Annulla ripristina tutta la selezione |
| Ruota a destra quattro volte da uno stato iniziale non modificato | Orientamento iniziale e asterisco rimosso; le operazioni restano annullabili |
| Rotazione della vista dal menu del viewer | Non altera le rotazioni permanenti e non aggiunge modifiche da salvare |
| Elimina una o più pagine | Conferma con Elimina e Annulla; dopo Elimina conteggio, miniature e numeri coerenti |
| Annulla eliminazione | Documento e selezione invariati |
| Seleziona tutte le pagine, oppure apri un PDF di una sola pagina | Elimina disabilitato; impossibile ottenere un documento senza pagine |
| Elimina la pagina corrente o l'ultima | Una pagina ancora esistente viene mostrata; contatore valido |
| Annulla/Ripeti con pulsanti e Ctrl+Z/Ctrl+Y | Ripristino corretto di ordine, rotazioni, pagine eliminate e selezione |
| Annulla e poi esegui una nuova operazione | La precedente possibilità di Ripeti viene eliminata |
| Salva, poi Annulla e Ripeti | La cronologia resta disponibile; l'asterisco segue il confronto con lo stato salvato |
| Oltre 100 operazioni | Annulla conserva le ultime 100 operazioni; documento ancora utilizzabile |

## Inserisci pagine da un altro PDF

| Cosa provare | Risultato atteso |
| --- | --- |
| Tasto destro su una miniatura → Inserisci… | Scelta del PDF tramite dialogo Windows; poi finestra con nome sorgente, numero pagine, intervalli e posizione |
| Annulla il dialogo del file oppure il dialogo delle opzioni | Nessuna modifica a documento, colore del nome, selezione e cronologia; un precedente Ripeti resta disponibile |
| Inserisci Tutte alla posizione 1 | Tutte le pagine del secondo PDF prima della prima pagina del documento aperto |
| Inserisci Tutte alla posizione N + 1 | Aggiunta dopo l'ultima pagina attuale |
| Inserisci pagine 1, 3-5 nel mezzo | Inserimento prima della posizione indicata, nell'ordine 1, 3, 4, 5 del PDF di origine |
| Indica 5, 1, 3, 3 | Importate una sola volta le pagine 1, 3 e 5, in ordine di documento |
| Intervallo vuoto, 0, pagina oltre il totale, 5-3, decimali o testo non valido | Messaggio nella finestra delle opzioni; nessuna modifica prima di una selezione valida |
| Posizione di inserimento | Valore ammesso da 1 a N + 1; la posizione proposta corrisponde alla pagina corrente |
| Conferma Inserisci | Conteggio e miniature aggiornati; le nuove pagine sono selezionate, la prima importata è visualizzata e il nome del file diventa rosso |
| Annulla e Ripeti dopo un inserimento multiplo | L'intero inserimento viene rimosso/ripristinato con una sola azione |
| Annulla inserimento, esegui una nuova modifica, poi Ripeti | La vecchia possibilità di ripetere l'inserimento non è più disponibile |
| Più inserimenti da PDF diversi, poi rotazione, spostamento ed eliminazione delle pagine importate | Tutte le operazioni mantengono contenuto e provenienza corretti anche dopo annulla/ripeti |
| Salva e riapri dopo inserimento | Pagine presenti nell'ordine scelto, anche in un altro lettore; il PDF di origine è invariato |
| Salva dopo inserimento, poi Annulla/Ripeti | Cronologia conservata; il colore del nome segue lo stato salvato |
| PDF di origine con pagine già ruotate, dimensioni miste, immagini, testo e annotazioni | Verificare resa, orientamento, ricerca e selezione testo nel risultato; controllare anche moduli e link se presenti |
| Origine firmata, cifrata, senza permessi, con password, corrotta o oltre 64 MB | Importazione rifiutata con messaggio; documento corrente e cronologia intatti |
| Destinazione in sola lettura | Inserisci… disabilitato nel menu |
| Risultato oltre 64 MB o errore di importazione/caricamento | Nessuna modifica parziale; stato precedente e cronologia ancora disponibili |
| Sorgenti trattenute, compresa la cronologia, oltre 128 MB | Messaggio esplicito; salvare e riaprire prima di ulteriori importazioni |
| Inserisci con rete disattivata | Funzionamento tramite file locali e motore già distribuito |

## Estrai pagine in un nuovo PDF

| Cosa provare | Risultato atteso |
| --- | --- |
| Tasto destro su una miniatura → Estrai pagine… | Dialogo Windows con nome proposto «nome documento - estratto.pdf» e scelta del percorso |
| Estrai una pagina, più pagine contigue oppure separate (es. 2 e 4) | Nuovo PDF contenente solo la selezione, una volta per pagina, nell'ordine del documento corrente |
| Seleziona le pagine con clic in ordine inverso | Il risultato segue l'ordine nel documento, non l'ordine dei clic |
| Ctrl+A ed Estrai pagine…; ripeti con un documento di una sola pagina | Estrazione consentita di tutte le pagine o dell'unica pagina |
| Sposta, ruota, elimina o inserisci pagine, poi estrai prima di salvare | Il nuovo PDF contiene la selezione corrente, incluse le pagine importate, con ordine e rotazioni permanenti attuali |
| Ruota soltanto la vista, poi estrai | Nel nuovo file resta la rotazione permanente del PDF; quella della vista non viene esportata |
| Estrai da uno stato salvato, da uno modificato e dopo Annulla con Ripeti disponibile | Percorso/nome corrente, pagina visualizzata, miniature, selezione, stato «file non salvato» e disponibilità Annulla/Ripeti invariati; l'estrazione non aggiunge cronologia |
| Dopo l'estrazione premi Salva sul documento con modifiche | Viene aggiornato il documento corrente, non il file estratto |
| Annulla il dialogo o la conferma di sovrascrittura | Nessun file estratto e sessione invariata; comandi nuovamente disponibili |
| Scegli lo stesso percorso del documento corrente; dopo Salva con nome prova anche quello originale | Operazione rifiutata con richiesta di un percorso diverso |
| Scegli un file di destinazione già esistente | Conferma di sovrascrittura; a conferma avvenuta sostituzione con il PDF estratto |
| Destinazione bloccata, cartella non scrivibile o errore di elaborazione | Messaggio chiaro; documento e cronologia invariati, file esistente non sostituito parzialmente |
| File di destinazione modificato esternamente durante l'estrazione | Nessuna sovrascrittura; avviso e nuova scelta del percorso |
| PDF firmato, cifrato, senza permessi di assemblaggio o Worker non disponibile | Estrai pagine… disabilitato; copia originale ancora disponibile |
| Riapri il PDF estratto, anche in un altro lettore | Numero pagine, contenuto, orientamento e dimensioni corrispondono alla selezione; testo ricercabile/selezionabile quando presente |
| Estrai pagine con immagini, annotazioni, moduli e link | Controllare resa e contenuto; verificare i collegamenti interni, soprattutto se la pagina destinazione è esclusa. Segnalibri e metadati dell'intero documento non sono inclusi nell'estrazione |
| Estrai con rete disattivata; prova ripetutamente anche dopo Annulla/Ripeti | Funzionamento locale; risultato corretto per lo stato corrente e comandi sbloccati a fine operazione |
| Risultato oltre 64 MB | Esportazione rifiutata; nessuna modifica alla sessione o alla destinazione |

## Salvataggio e modifiche non salvate

| Cosa provare | Risultato atteso |
| --- | --- |
| Apri un PDF, anche con nome lungo; ridimensiona la finestra e prova il ridimensionamento Windows | Nome file a 18 pt in grassetto nell'intestazione, leggibile senza tagli verticali; puntini di sospensione se lo spazio orizzontale non basta |
| Prima modifica permanente | Nome file rosso e in grassetto con la scritta rossa «file non salvato» accanto; titolo di Windows 11 rosso, anche se l'asterisco è poco visibile |
| Nome lungo con modifiche pendenti e finestra ridotta | Nome abbreviato con puntini; la scritta «file non salvato» rimane visibile senza sovrapposizioni |
| Salvataggio riuscito o Annulla fino allo stato salvato | Nome file nuovamente nel colore normale e scritta «file non salvato» nascosta; un successivo Ripeti che crea modifiche ripristina entrambi gli indicatori |
| Salva o Ctrl+S dopo una modifica | Aggiorna il file corrente senza dialogo del percorso; asterisco rimosso dopo successo |
| Riapri il file salvato | Ordine, rotazioni e pagine eliminate persistono anche in un altro lettore PDF |
| Salva con nome / Ctrl+Maiusc+S | Dialogo del percorso; il nuovo file diventa corrente e viene aggiunto ai Recenti |
| Modifica dopo Salva con nome e premi Salva | Viene aggiornato il nuovo percorso; il precedente resta invariato |
| Annulla Salva con nome o conferma di sovrascrittura | Nessun salvataggio; modifiche e asterisco conservati |
| Destinazione esistente | Richiesta di conferma prima di sostituirla |
| Cartella non scrivibile o file bloccato da un altro processo | Errore visibile; modifiche e cronologia conservate |
| Modifica o elimina il file su disco con un altro strumento prima di Salva | Nessuna sovrascrittura delle modifiche esterne; avviso e proposta Salva con nome |
| Annulla Salva con nome dopo un conflitto esterno | Modifiche ancora disponibili nell'app |
| Apri un altro documento, Chiudi documento o esci con modifiche | Finestra con Salva / Non salvare / Annulla |
| Salva nella finestra delle modifiche | Procede con l'azione soltanto se il salvataggio riesce |
| Non salvare | Esegue l'azione senza scrivere le modifiche sul file |
| Annulla, salvataggio fallito o percorso annullato | Rimane aperto il documento con le modifiche intatte |
| Apri un PDF corrotto dopo Non salvare | Apertura fallita; il documento precedente conserva ancora le modifiche e la cronologia |
| Riapri il percorso corrente dai Recenti e scegli Salva | Il documento ricaricato contiene le modifiche appena scritte, non la versione precedente |

## Protezioni, regressioni e distribuzione

| Cosa provare | Risultato atteso |
| --- | --- |
| PDF con firma digitale | Motivo della sola lettura visibile; rotazione permanente, eliminazione, spostamento e Salva disabilitati |
| Salva copia… di un PDF firmato | Nuovo percorso, byte identici all'originale; la firma non viene dichiarata validata dall'app |
| Tentativo di copiare un documento in sola lettura sul percorso originale/corrente | Operazione rifiutata; richiesta di un altro percorso |
| PDF senza permesso di assemblaggio | Consultazione e copia disponibili; gestione pagine bloccata con motivo visibile |
| PDF cifrato apribile senza password | Sola consultazione e copia identica; cifratura non rimossa |
| PDF con password di apertura | Errore gestito; il documento precedente resta aperto |
| Worker di editing non disponibile, ad esempio su una copia della distribuzione privata di page-worker.mjs | Consultazione disponibile, editing bloccato perché i controlli non sono disponibili |
| File inesistente, non PDF o maggiore di 64 MB | Errore gestito senza sostituire il documento corrente |
| Errore durante una modifica o risultato oltre 64 MB | Stato e cronologia precedenti conservati; messaggio visibile |
| Click e scorciatoie durante elaborazione/salvataggio | Comandi incompatibili temporaneamente bloccati; nessuna operazione sovrapposta |
| Ricerca e selezione testo dopo riordino/rotazione/eliminazione | Risultati corrispondenti alle pagine presenti, testo ancora selezionabile quando disponibile |
| PDF con annotazioni, moduli esistenti, segnalibri e link interni | Controllare resa e riferimenti dopo le modifiche e dopo la riapertura del risultato |
| Documento con font non incorporati | Controllare i caratteri; i font remoti di fallback restano disabilitati |
| Zoom, affiancate, scorrimento e rotazione della vista durante una modifica permanente | Impostazioni di visualizzazione mantenute e pagina corrente coerente |
| Dimensioni miste, finestra ridimensionata e scala Windows 125/150/200% | Miniature, dialoghi, toolbar e barra di stato utilizzabili; dimensioni in mm coerenti |
| Rete disattivata | Apertura, miniature, gestione pagine e salvataggio funzionano con gli asset locali |
| Riavvio e Recenti | Percorsi aggiornati disponibili; file non più presenti gestiti con errore |

Per confrontare una **copia non modificata**, soprattutto firmata o cifrata, usare:

```powershell
Get-FileHash "C:\documenti\originale.pdf"
Get-FileHash "C:\documenti\copia.pdf"
```

Gli hash della copia non modificata devono coincidere. Per un PDF modificato controllare invece le pagine e il contenuto: l'hash normalmente cambia. Il confronto non valida firme digitali né conformità PDF/A.

## Caselle sulla pagina e barra Carattere — Release 0.6.5

Attivare **Testo** nella barra principale. Tutti i controlli contestuali sono sotto il nome del file; non devono comparire né il precedente dialogo né il pulsante duplicato Modifica testo. Posizione e dimensioni si impostano direttamente col mouse. La modifica supporta le caselle create da PDF MB, comprese quelle dei PDF salvati con la 0.5.0. Queste prove non sono state eseguite dall'assistente.

| Cosa provare | Risultato atteso |
| --- | --- |
| Apri un PDF in consultazione | Barra Carattere nascosta; comando Testo disponibile nella barra principale se consentito dai permessi |
| Attiva Testo dal comando principale | Barra Carattere visibile sotto il nome e pagine modificabili direttamente; controlli di font, stile, caselle, appunti e zoom senza dialoghi né campi numerici per posizione/dimensioni |
| Apri il PDF già salvato con le due caselle «prova prova prova», senza modificare il testo | Nome rosso e Salva disponibile per la riparazione; nessuna richiesta di ricreare le caselle |
| Premi Salva sul file precedente, chiudi e riapri anche in un altro lettore | Entrambe le scritte visibili, opache, nelle posizioni originali; testo e stile ancora modificabili in PDF MB |
| Ripeti il recupero con Salva con nome e annulla o provoca un errore di scrittura | Il nuovo percorso diventa corrente solo dopo il successo; annullamento/errore lascia il documento da salvare e l’originale intatto |
| Recupera le caselle precedenti, modifica, salva e usa Annulla/Ripeti fino allo stato iniziale | Nessun ritorno ad aspetti trasparenti o risorse mancanti; contenuto delle caselle e cronologia conservati |
| Aggiungi nuove caselle con ogni famiglia/font, colore e più righe; salva e riapri in un altro lettore | Testo visibile anche fuori dalla modalità testo; annotazioni con opacità piena e aspetto valido |
| Controlla la barra testo | Pulsante Applica assente; Annulla modifica ed Elimina disponibili sulla casella selezionata |
| Scrivi e clicca fuori; rientra con un solo clic e cambia il contenuto più volte prima di Salva | Testo persistente, modificabile e visibile tra un ingresso e l’altro; un’azione annullabile per ogni uscita con modifiche |
| Scrivi e premi direttamente Salva/Ctrl+S oppure Salva con nome/Ctrl+Maiusc+S senza uscire dal campo | L’ultimo testo entra nel PDF salvato; nome torna normale solo dopo la scrittura riuscita; riapertura con contenuto corretto |
| Crea una casella vuota e clicca fuori | Casella scartata, nessuna annotazione vuota e nessuna voce di cronologia |
| Modifica una casella e clicca direttamente su un’altra oppure sceglila dall’elenco | Prima casella applicata e seconda aperta per scrivere, senza perdere selezione o geometria |
| Cambia font, colore e dimensione mentre scrivi, poi torna al campo | La barra non interrompe la bozza; testo conservato e applicato uscendo dalla casella |
| Lascia il campo con un testo non valido e prova Salva/Apri/Chiudi | Errore visibile, bozza recuperabile, nessun file salvato e azione interrotta; correggi e riprova |
| Nuova casella, trascina sulla pagina in tutte le direzioni e scrivi | Rettangolo corrispondente al trascinamento; scrittura direttamente dentro la casella |
| Trascinamento troppo piccolo, rilascio fuori pagina o annullamento del puntatore | Nessuna casella invalida o trascinamento bloccato; coordinate mantenute entro la pagina |
| Seleziona una casella con clic o dall'elenco della barra | Bordo e otto maniglie visibili; font e stile della casella caricati nella barra |
| Trascina una casella, anche selezionandola all'inizio del trascinamento | Movimento con il mouse, senza dover digitare coordinate; nessun duplicato |
| Trascina ognuna delle otto maniglie, anche verso i bordi della pagina | Posizione/dimensioni aggiornate; minimo 12 × 12 pt e contenimento nella pagina |
| Un solo clic sul testo o Invio sulla casella selezionata, poi seleziona singole parole | Modifica e selezione dei caratteri direttamente nella casella, senza sovrapporre il testo al suo aspetto precedente |
| Modifica font, dimensione, grassetto, corsivo e colore dalla barra | Stile applicato all'intera casella; aggiornamento visibile durante la modifica e conservato dopo l’applicazione automatica |
| Esci dalla casella dopo aver scritto; rilascia il mouse dopo movimento o ridimensionamento; prova anche Ctrl+Invio | Una sola operazione annullabile; nome rosso e «file non salvato»; posizione di scorrimento mantenuta e casella nuovamente selezionabile |
| Scrivi «marco bottalico», clicca fuori dalla casella e passa a un’altra casella | Il testo rimane visibile anche senza campo attivo; nessun rettangolo vuoto al posto del contenuto |
| Copia la casella con il tasto destro e incollala accanto; seleziona e deseleziona ripetutamente originale e copia | Entrambi i testi restano visibili e indipendenti, anche spostando rapidamente la selezione |
| Ripeti su un PDF con moduli AcroForm e font già presenti | Aspetto del testo indipendente dai font del documento originale; testo visibile anche in consultazione dopo l’applicazione automatica |
| Salva il PDF con le due caselle, riaprilo anche in un altro lettore | Originale e copia visibili con font/colore corretti; contenuto ancora modificabile in PDF MB |
| Apri una copia di un PDF salvato con caselle vuote nelle versioni precedenti, poi modifica una casella e salva | Le caselle PDF MB vengono rigenerate nel rendering e nel risultato ricostruito; contenuti e posizioni conservati |
| Seleziona una casella applicata, Ctrl+C, sposta il mouse e Ctrl+V | Nuova casella nella posizione del puntatore, con testo, font, dimensione, colore e dimensioni conservati; originale invariato |
| Ripeti la copia su una pagina diversa, vicino ai bordi, a diversi zoom e con rotazione della vista | Posizione coerente con il puntatore e nuova casella contenuta nella pagina; nessun cambio indesiderato all'originale |
| Tasto destro su una casella non ancora selezionata → Copia | Selezione della casella cliccata e menu a elenco; copia dell'intera casella senza modificarla né creare cronologia. Pulsanti Copia/Incolla assenti dalla barra |
| Dopo Copia: tasto destro nel punto della pagina → Incolla, muovendo il mouse per scegliere la voce | Duplicato nel punto del clic destro originale, non nel punto del menu; testo, stile e dimensioni conservati, originale invariato e un solo Annulla per rimuovere la copia |
| Menu Incolla su un'altra pagina, vicino ai bordi, con zoom e rotazioni | Posizione riferita alla pagina cliccata; casella contenuta nei bordi e trasformazioni coerenti |
| Tasto destro sul testo mentre si modifica una casella | Menu per copiare l'intera casella; Ctrl+C dentro il testo continua a copiare solo i caratteri selezionati |
| Menu sulla pagina senza una casella copiata; ripeti con una bozza corrente valida | Incolla disabilitato senza copia; una bozza valida viene applicata prima di aprire il menu sulla pagina |
| Esc, clic fuori dal menu, scorrimento, ridimensionamento o cambio modalità/documento | Menu chiuso e nessuna operazione; Esc dal menu conserva la selezione senza annullare la bozza |
| Maiusc+F10/tasto Menu su una casella; frecce, Invio e Spazio nel menu | Menu accessibile da tastiera e comandi disabilitati non attivabili |
| Incolla senza una posizione del mouse valida sulla pagina | Richiesta di scegliere il punto con un clic, senza inserimenti in posizioni arbitrarie |
| Copia alcuni caratteri mentre scrivi e incollali nella stessa casella o in un editor esterno | Appunti di testo normali, distinti dalla copia dell'intera casella |
| Incolla testo semplice da un'applicazione esterna sulla pagina | Nuova casella al puntatore con lo stile corrente |
| Seleziona una casella e premi Elimina/Canc oppure Backspace fuori dal campo | Conferma e rimozione della sola casella; Annulla/Ripeti conservati |
| Aggiungi una casella e poi eliminala; applica una modifica identica all'originale | Stato salvato coerente; nessuna nuova azione per un'applicazione senza cambiamenti |
| Annulla modifica/Esc durante una bozza o un trascinamento | Ripristino della geometria del trascinamento; conferma prima di scartare testo o stile non applicati |
| Cambia casella, apri/salva, chiudi o usa la cronologia con una bozza valida ancora attiva | Applicazione automatica prima dell’azione; nessuna perdita del testo e nessun blocco permanente |
| Ctrl+Z/Ctrl+Y nel testo, poi dopo l’applicazione automatica dalla barra principale | Cronologia locale mentre scrivi e cronologia del PDF dopo l'applicazione |
| Salva, chiudi e riapri; attiva Testo, seleziona e copia una casella | Caselle ancora modificabili e duplicabili con il mouse, senza rasterizzazione del contenuto salvato |
| Zoom testo 50/75/100/125/150/200% e Adatta larghezza; finestra ridimensionata | Bordo, maniglie, puntatore e testo allineati alla pagina; scala della barra di stato coerente |
| Rotazione permanente e della vista di 90/180/270°, CropBox con origine diversa e pagine di dimensioni miste | Creazione, spostamento, ridimensionamento e copia/incolla corretti anche dopo salvataggio e riapertura |
| Scorri molte pagine e torna a quelle precedenti | Pagine caricate su richiesta; caselle e stato conservati dopo il rilascio dei rendering lontani |
| Disattiva Testo dalla barra principale; ripeti ingresso/uscita | Barra Carattere nascosta in consultazione e nuovamente visibile rientrando; nessun pulsante Modifica testo aggiuntivo; testo applicato ancora visibile |
| Sposta/elimina pagine con testo, Annulla/Ripeti, inserisci o estrai pagine contenenti caselle PDF MB | Testo associato alle pagine corrette e modificabile anche nel risultato estratto |
| Accenti, €, virgolette, righe multiple e tabulazioni incollate | Contenuto conservato; tabulazioni normalizzate in spazi |
| Caratteri non supportati, emoji o più di 10.000 caratteri | Validazione esplicita e bozza recuperabile |
| Testo troppo grande per la casella | Ridimensionabile con le maniglie; il risultato dopo l’applicazione automatica permette di controllare eventuali tagli |
| PDF firmato, cifrato, senza permessi di assemblaggio/annotazione o controlli falliti | Comando Testo disabilitato; copia originale e altre protezioni conservate |
| Errore del Worker, del caricamento o risultato oltre 64 MB durante l’applicazione automatica | PDF e cronologia precedenti intatti; possibilità di copiare o annullare la bozza e tornare alla consultazione |
| Documento con altre annotazioni e moduli, rete disattivata, scala Windows 125/150/200% | Altre annotazioni conservate; funzionamento locale e barra utilizzabile anche su più righe |

Sottolineato, barrato, apice/pedice, evidenziazione dei caratteri, maiuscole/minuscole, rimozione della formattazione e stili misti sono ancora previsti per incrementi successivi.


## Evidenziatore 0.7.0

- Premere il pulsante Evidenziatore: deve risultare attivo e il cursore sul PDF deve diventare un pennarello. Il viewer deve conservare pagina, zoom, scorrimento e rotazione; non si apre una finestra di lavoro alternativa.
- Cambiare colore dal select accanto al pulsante (Giallo/Verde/Azzurro/Rosa/Arancione), trascinare sul testo selezionabile e rilasciare: il tratto deve applicarsi subito. Ripetere più volte senza riattivare il pulsante. La scelta del colore da sola non deve sporcare il documento.
- Premere di nuovo Evidenziatore o Esc: ritorno alla selezione normale; selezionare/copiare testo non deve produrre annotazioni.
- Selezionare parole, più righe, più pagine e in direzione inversa. Ogni trascinamento deve contare come una sola azione Annulla/Ripeti, anche su più pagine.
- Provare zoom diversi, rotazione della vista e rotazioni permanenti 90/180/270°, CropBox diverso dall’origine, colonne e testo ruotato: selezione e annotazioni salvate devono coincidere.
- Trascinare su una scansione senza testo o sullo sfondo: nessuna evidenziazione a rettangolo libero e nessuna modifica al documento.
- Fare clic destro su una evidenziazione e scegliere Elimina evidenziazione; verificare Annulla/Ripeti. Eliminare l’unica evidenziazione appena creata: ritorno allo stato pulito se non ci sono altre modifiche.
- Salvare, chiudere, riaprire e verificare aspetto in PDF MB e in un lettore esterno. Eliminare con il tasto destro una evidenziazione riaperta, salvare e controllare che resti eliminata. Conservare le annotazioni estranee.
- Alternare evidenziazioni, caselle, rotazione, spostamento, inserimento ed estrazione delle pagine; verificare anche Annulla/Ripeti dopo Salva.
- Provare PDF firmati, cifrati e senza permessi di annotazione: comandi disabilitati. Un errore di caricamento/salvataggio deve mantenere lavoro, cronologia e stato non salvato.
- Attivare Evidenziatore mentre si modifica una casella: la bozza deve applicarsi prima. Attivare Testo deve spegnere il pennarello. Apri/Salva/Chiudi devono interrompere i gesti pendenti; cambiando documento il pulsante torna inattivo.
- Compilare e pubblicare su Windows con SDK .NET 10 e asset EmbedPDF 2.15.1; la barra deve mostrare 0.7.0. Non distribuire la cartella 0.6.5 come 0.7.0.

## Strumenti sul viewer

- Aprire ogni voce di Strumenti: barra sopra il documento, nessuna finestra con una copia della pagina. Il viewer deve rimanere visibile e navigabile.
- Creare note, rettangoli, ellissi, linee e tratti di penna direttamente sulle pagine. Verificare anteprima, Applica, Salva e Annulla/Ripeti.
- Cambiare pagina con i pulsanti, scorrendo e cliccando un’altra pagina; verificare che creazione, selezione di oggetti, oscuramento riguardino la pagina indicata nella barra.
- Ripetere con zoom diversi, vista ruotata e pagine con rotazione permanente. Il tratto e la selezione devono seguire la pagina durante scorrimento e zoom.
- Clic destro su evidenziazioni di più righe: selezionare solo il tratto cliccato; clic nello spazio tra le righe o fuori dai tratti non deve proporre eliminazioni di altri elementi.
- Alternare Strumenti, Testo ed Evidenziatore; Chiudi/Esc deve ripristinare la consultazione. Le bozze non applicate devono restare protette dalla conferma esistente.

## Preview live e timbri 0.8.3

- Selezionare un testo dal menu senza passare il mouse sulla pagina; cambiare font e dimensione. Verificare preview immediata nella posizione corretta, senza doppio testo, a vari zoom e rotazioni. Ripetere con selezione mediante clic.
- Durante la preview, il PDF e la cronologia non cambiano. Annulla anteprima ripristina contenuto, font e dimensione; Applica crea una sola modifica annullabile. Cambiare rapidamente stile, pagina e strumento non deve mostrare risposte obsolete.
- Aprire Strumenti → Timbri e la tavolozza: 14 diciture e Data. Scegliere data e formato, applicare, salvare e riaprire: la data resta quella scelta.
- Posizionare un timbro con clic; crearne un altro mediante trascinamento. Modificare Larghezza mm prima di Applica: proporzioni e misura visualizzata devono corrispondere. Provare i bordi e pagine piccole o ruotate.
- Importare un PNG con trasparenza e semitrasparenza, sopra testo o sfondo colorato. Lo sfondo del PDF deve restare visibile attraverso il timbro, anche dopo salvataggio/riapertura ed estrazione.
- Riavviare PDF MB e selezionare il PNG dalla raccolta Personali; importare non deve sporcare il documento. Provare un file non PNG, un’immagine troppo grande e un campo larghezza temporaneamente vuoto: errore gestito e programma utilizzabile.
- Selezionare un timbro applicato dall’elenco, eliminarlo e usare Annulla/Ripeti; salvare e riaprire. Le annotazioni esterne devono rimanere intatte.

## Moduli e password 0.10.0

- Creare un testo con regex `[A-Z]{2}[0-9]{6}` e messaggio personalizzato; provare regex sintatticamente errata, valore errato e valore corretto. L’errore deve conservare la bozza; riaprire e verificare regola e messaggio.
- Creare Data e ora e provare tutti i formati, selettore nativo, febbraio bisestile, 31 aprile, ore 24 e minuti 60. Salvare, riaprire, cambiare pagina e usare Annulla/Ripeti.
- Caricare PNG trasparente e JPEG nel campo immagine. Provare file non immagine, file oltre 8 MB e immagine oltre 16 milioni di pixel. Verificare proporzioni, sostituzione, rimozione, Annulla/Ripeti, salvataggio, stampa, estrazione e riapertura.
- Creare un pulsante email con e senza destinatario. Verificare che un obbligatorio vuoto blocchi la composizione e che un valore digitato ma non ancora salvato sia nell’allegato. Con client predefinito configurato, controllare manualmente destinatario, allegato e valori senza inviare il messaggio. Ripetere con fallback .eml e un’app associata.
- Proteggere con password, verificare conferma diversa, Salva e Salva con nome, rifiuto di password assente/errata e riapertura corretta. Compilare e salvare nuovamente: il file deve restare protetto. Controllare password anche per allegati email ed estratti. Rimuoverla con il lucchetto aperto / Rimuovi password e salvare.
- Nei lettori esterni verificare aspetto dei nuovi campi e supporto effettivo a regex, importazione immagini e invio PDF via email; i lettori possono disabilitare le azioni PDF. I documenti firmati devono conservare le restrizioni esistenti.

## Correzioni moduli 0.10.1

- Impostare `NOW()` come valore predefinito, applicare e provare data, ora e data/ora cambiando il formato: il valore deve essere locale e concreto; l’espressione deve restare nelle proprietà dopo riapertura. Una successiva modifica manuale o cancellazione del valore non deve essere sovrascritta da Salva o da modifiche alla geometria.
- In progettazione verificare Carica immagine nel campo selezionato e Carica / sostituisci immagine nelle proprietà, anche prima di Applica. Controllare miniatura, sostituzione, rimozione, salvataggio e riapertura.
- Verificare il lucchetto nella barra principale accanto a Salva, visibile anche alla larghezza minima; aprire il dialogo senza entrare nella progettazione modulo.

## Destinazione email 0.10.2

- Aprire un modulo 0.10.0/0.10.1 con pulsante Invia PDF e salvare senza modificare i campi: l’app deve proporre Salva come modifica pendente e il file deve conservare valori e immagini. Alla successiva riapertura il file deve risultare pulito.
- In un lettore esterno verificare che il pulsante punti a `mailto:` e non a un percorso `file:///`. La destinazione deve essere un dizionario `/Filespec` con `/FS /URL` e stringa ASCII senza BOM UTF-16; provare anche destinatario vuoto, indirizzo con + e caratteri accentati codificati nell’URL.
- Verificare manualmente l’apertura del client email e l’allegato PDF compilato, rispettando le conferme di sicurezza del lettore; non inviare il messaggio durante la prova.

## Validazione e immagini statiche 0.10.3

- In un testo con regex `^[A-Z]{2}[0-9]{6}$`, digitare AB123 e uscire con Tab o clic: deve comparire l’avviso, senza salvare il valore errato. Correggere in AB123456 e verificare assenza di errori. Ripetere nel PDF salvato con un lettore che supporta JavaScript, controllando che sia abilitato. I vecchi moduli vanno riaperti e salvati con PDF MB per aggiornare gli script.
- Strumenti → Immagine: clic singolo e caricamento, oppure trascinamento del riquadro e clic per l’upload. Provare PNG trasparente, JPEG, sostituzione, file errato e annullamento del selettore. Un riquadro vuoto deve richiedere caricamento o annullamento prima del salvataggio.
- Salvare l’immagine senza premere Applica; alla riapertura deve essere un oggetto immagine statico, privo di widget e azioni. Controllare proporzioni, trasparenza, colori, rotazioni, stampa, estrazione e testi/campi preesistenti. Annulla deve rimuoverla e Ripeti ripristinarla.

## Compilazione nella vista normale 0.10.4

- Aprire un modulo con testo, data/ora NOW(), pulsante email, immagine, checkbox e dropdown: tutti devono essere visibili e utilizzabili senza entrare in Progetta modulo. I campi in sola lettura devono mantenere la restrizione.
- Modificare data/ora da tastiera e selettore, inizializzato sul valore corrente. Salvare mentre il testo è ancora a fuoco, riaprire e verificare il valore; NOW() non deve sovrascriverlo.
- Premere il pulsante email nella vista normale: la bozza deve includere il PDF con i valori correnti. Controllare invalidi regex/data, Tab, Annulla/Ripeti, zoom, scorrimento su più pagine e rotazione della vista.
- Entrare in progettazione, compilazione dedicata e negli altri Strumenti: i controlli della vista normale non devono sovrapporsi agli editor. All’uscita devono tornare nella posizione corretta.

## Miniature con campi modulo 0.10.5

- Aprire una pagina priva di testo statico con campo testo, data/ora e pulsante email: la miniatura laterale deve mostrare tutti e tre, compresa l’etichetta del pulsante. Ripetere in Gestisci pagine.
- Modificare i valori, uscire dal campo, salvare e riaprire: pagina e miniature devono mostrare i valori aggiornati; controllare anche Annulla/Ripeti e pagine ruotate.

## Lucchetto e rimozione password 0.10.6

- Su PDF non protetto controllare lucchetto chiuso e Proteggi con password. Impostare la password: barra principale, menu Strumenti e barra modulo devono mostrare lucchetto aperto e Rimuovi password, anche dopo Salva e riapertura.
- Cliccare Rimuovi password: nessuna richiesta di una nuova password, modifica pendente, lucchetto chiuso ripristinato. Salvare e riaprire senza password; verificare campi e valori conservati. Chiudere o aprire un altro documento non protetto deve ripristinare il comando Proteggi con password.
