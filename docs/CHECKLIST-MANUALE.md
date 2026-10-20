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
