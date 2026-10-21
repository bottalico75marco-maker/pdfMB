# Analisi: creazione e compilazione di moduli PDF in PDF MB

Data: 21 ottobre 2026. Base analizzata: sorgenti desktop 0.8.4 e pacchetti EmbedPDF/PDFium 2.15.1 installati.

## Obiettivo e perimetro

Si assume che la richiesta riguardi una nuova funzione di PDF MB: trasformare un PDF esistente in un modulo compilabile, posizionando campi sulle pagine e salvandoli come AcroForm standard. Questa analisi non implementa la funzione e non attesta ancora la compatibilità dei file prodotti.

Il primo flusso consigliato parte da un PDF già impaginato. La creazione di un documento vuoto, con scelta del formato e aggiunta di pagine, è un'estensione distinta: attualmente il flusso dell'app parte dall'apertura di un file.

## Risultato della verifica

La funzione è tecnicamente plausibile con le dipendenze attuali: non emerge la necessità di introdurre subito un secondo motore PDF.

- `app.mjs` disabilita la categoria `form` e imposta `fillForms: false`.
- Le caselle esistenti sono annotazioni FreeText: occorre aggiungere veri campi AcroForm.
- Il pacchetto PDFium installato espone `EPDFPage_CreateFormField`, `EPDFAnnot_SetFormFieldName`, `EPDFAnnot_SetFormFieldValue`, `EPDFAnnot_SetFormFieldOptions`, `EPDFAnnot_ShareFormField` e `EPDFAnnot_GenerateFormFieldAP`.
- L'implementazione dell'engine installato usa queste API per widget testo, checkbox, radio, combo ed elenchi. È una base concreta da seguire, con gestione esplicita dell'ambiente form e delle risorse native.
- Il plugin form installato espone lettura/scrittura dei valori, eventi, selezione e raggruppamento dei widget.
- La documentazione ufficiale descrive compilazione nel viewer ed esportazione dei valori. Questo non rende automaticamente compatibile il salvataggio personalizzato di PDF MB.

Queste evidenze derivano dalla lettura del codice e delle API. Serve una prova sul WASM effettivamente distribuito prima di confermare l'intero flusso.

## Esperienza proposta

Comando principale: **Strumenti > Moduli**.

Due modalità esplicite:

1. **Progetta modulo**: scegliere un controllo, trascinare sulla pagina, modificarne proprietà, posizione e dimensioni.
2. **Compila modulo**: scrivere e selezionare valori, con navigazione da tastiera e senza spostare i controlli.

Un pannello mostra l'elenco dei campi del documento, la pagina e le proprietà del selezionato. Il pulsante Anteprima passa alla compilazione. Salva e Salva con nome conservano l'interattività. I valori inseriti nell'anteprima devono essere gestiti come modifiche reali, con un comando esplicito per ripristinare i valori predefiniti.

| Controllo | Prima versione | Proprietà essenziali |
| --- | --- | --- |
| Testo | Sì | Nome, descrizione accessibile, valore predefinito, riga singola/multilinea, lunghezza massima |
| Casella di spunta | Sì | Nome, stato iniziale, valore esportato |
| Pulsanti radio | Seconda fase | Nome del gruppo, valore distinto per opzione, selezione iniziale |
| Menu a discesa | Seconda fase | Etichette, valori esportati, selezione iniziale |
| Elenco | Seconda fase | Opzioni e selezione singola; multipla dopo verifica del motore |
| Data e numero | Successivamente | Campi testo con assistenza e validazione nell'app; comportamento negli altri lettori da verificare |

Proprietà comuni: obbligatorio, sola lettura, font e dimensione, colore testo, bordo, sfondo, allineamento e ordine di navigazione. Il flag obbligatorio non deve impedire il salvataggio di una bozza incompleta; l'app può mostrare un riepilogo dei campi mancanti.

Nomi unici per i campi indipendenti. La duplicazione crea un nuovo nome; la condivisione intenzionale dello stesso campo deve essere un'azione distinta. Nei radio, più widget appartengono deliberatamente allo stesso gruppo.

Firme digitali, XFA, riconoscimento automatico dei campi, calcoli, script PDF e invio a server restano fuori dalla prima versione proposta.

## Architettura consigliata

Il Worker deve restare la fonte autorevole dei byte persistenti. La UI invia comandi; il Worker valida ed esegue; il controller conferma modello e cronologia soltanto dopo la riapertura riuscita del risultato, coerentemente con il comportamento attuale.

Componenti proposti, ancora da creare:

- `form-engine.mjs`: lettura dei campi, creazione/modifica/rimozione dei widget, valori, gruppi e generazione degli aspetti PDF.
- `form-surface.mjs`: selezione, trascinamento, ridimensionamento, pannello proprietà e interazione di compilazione.
- `page-worker.mjs`: comandi form e composizione con modifiche alle pagine.
- `page-editor.mjs`: stato dei campi e dei valori, dirty, snapshot, Annulla/Ripeti e conferma delle bozze.
- `app.mjs`, `index.html`, `app.css` e `MainForm.cs`: comandi, toolbar, stato e collegamento con Salva.

Il modello deve distinguere **campo logico**, **widget sulla pagina** e **valore corrente**. Ogni campo ha un identificativo stabile e un nome PDF; ogni widget ha un identificativo e un riferimento alla pagina stabile, distinto dal suo indice corrente.

### Punto critico: struttura globale e sostituzione delle pagine

`workbenchChange()` esporta una pagina in un documento temporaneo e registra un override. `rebuild()` può importare quella pagina e cancellare la precedente. Anche Estrai pagine crea un nuovo documento per importazione.

Un modulo richiede la coerenza fra `/AcroForm/Fields`, annotazioni `/Widget`, relazioni `/Parent` e `/Kids`, valori e risorse. Non è sufficiente che il riquadro continui a vedersi dopo un'importazione. I riferimenti e i gruppi possono coinvolgere altre pagine.

Si propone di aggiungere lo stato logico dei moduli agli snapshot a livello di documento, includendolo nella chiave dirty e nella ricostruzione. Il sistema dovrà riconciliare i campi con le pagine effettive dopo importazioni e sostituzioni, preservando i campi estranei alle modifiche richieste. La strategia precisa va scelta dopo una prova su gruppi multipagina e campi preesistenti: se l'importazione perde informazioni che le API non permettono di ricostruire fedelmente, le operazioni interessate dovranno lavorare sul documento completo o essere limitate esplicitamente nella prima versione.

La sola attivazione del plugin non basta: il viewer ha un proprio documento e `PageEditor.export()` restituisce attualmente `this.bytes`. Una modifica rimasta nel viewer potrebbe quindi apparire a schermo e non entrare nel file salvato. Se si riusa la compilazione del plugin, gli eventi devono diventare transazioni del controller, con gestione dei conflitti, dei ricaricamenti e della cronologia. Evitare due cronologie indipendenti.

### Permessi e operazioni esistenti

- Aggiungere capacità separate per progettare e per compilare; non riutilizzare indiscriminatamente `canAnnotate` o il requisito di assemblaggio. Il Worker deve verificare i permessi specifici di ogni operazione.
- La policy attuale mantiene firmati e cifrati in sola consultazione: supportarli richiederebbe un progetto ulteriore sul salvataggio.
- Ruota, sposta ed elimina devono aggiornare riferimenti, widget e gruppi; importare un modulo richiede una politica esplicita per collisioni dei nomi.
- Estrai pagine deve conservare soltanto i widget e i campi pertinenti, senza riferimenti a pagine escluse.
- L'oscuramento attuale rende statica l'intera pagina: nella pagina oscurata i campi perdono l'interattività. Vanno rimossi anche i relativi riferimenti e valori non più necessari, preservando i gruppi ancora presenti altrove e impedendo il ripristino successivo dei widget oscurati durante la ricostruzione.
- La stampa deve includere i valori confermati anche prima del salvataggio, come già previsto per le altre modifiche.

## Prove necessarie e criteri di accettazione

Prima prova tecnica: creare testo e checkbox nel motore distribuito, salvarli, riaprirli, compilarli, modificarli nuovamente e rimuoverli. Controllare anche l'albero dei campi con un lettore strutturale indipendente, ad esempio pypdf, come strumento di verifica e non come nuova dipendenza dell'app.

Per considerare pronta la funzione:

1. Ogni campo è rilevabile strutturalmente dopo riapertura e continua a essere compilabile.
2. Valore logico `/V`, stato visivo dei pulsanti e aspetto `/AP` sono coerenti. Non affidarsi soltanto a `/NeedAppearances`.
3. Salva acquisisce anche l'ultimo valore ancora in modifica; un errore conserva la bozza e lo stato precedente.
4. Annulla/Ripeti copre creazione, proprietà, geometria, compilazione, cancellazione e operazioni di pagina.
5. Campi multilinea, accenti ed euro vengono verificati; gli altri alfabeti richiedono una politica esplicita per font locali incorporati.
6. Geometrie e interazione funzionano con zoom, CropBox e rotazioni permanenti e della vista.
7. Gruppi radio e campi condivisi su più pagine restano coerenti dopo modifica, eliminazione, estrazione e importazione.
8. La cancellazione non lascia campi orfani e non elimina accidentalmente i widget fratelli.
9. Il file viene compilato e salvato con Adobe Acrobat Reader e Microsoft Edge, quindi riaperto in PDF MB; verificare anche stampa e valori esportati.
10. I limiti attuali di 64 MB per documento e 128 MB per sorgenti/cronologia restano rispettati; introdurre un limite documentato al numero di campi dopo la misura delle prestazioni.

I test già esistenti sui form controllano gli aspetti in stampa e nell'oscuramento; non dimostrano ancora creazione o compilazione completa.

## Sequenza di lavoro proposta

1. **Prova del motore e della ricostruzione**: testo, checkbox, albero campi, salvataggio e casi multipagina. È il passaggio che decide l'architettura.
2. **Prima versione utilizzabile**: creazione manuale su PDF esistente, testo e checkbox, proprietà, anteprima compilabile, Salva e cronologia comune.
3. **Completamento dei controlli**: radio, menu a discesa, elenchi, duplicazione, allineamenti e ordine di navigazione.
4. **Estensioni separate**: documento vuoto, esportazione/importazione dati, formattazione avanzata e riconoscimento automatico.

Complessità stimata qualitativamente: medio-alta. La parte grafica è riutilizzabile; la conservazione dei campi nelle operazioni sul documento è il rischio principale. Una stima temporale attendibile richiede il risultato della prima prova.

## Riferimenti verificati

- [Configurazione attuale del viewer](../src/PdfMB.Desktop/Web/app.mjs).
- [Controller, snapshot ed esportazione](../src/PdfMB.Desktop/Web/page-editor.mjs).
- [Worker, policy e ricostruzione](../src/PdfMB.Desktop/Web/page-worker.mjs).
- [Test di integrazione PDFium](../tests/pdfium.integration.test.mjs).
- API e implementazione locali: `node_modules/@embedpdf/pdfium/dist/index.d.ts`, `node_modules/@embedpdf/plugin-form/dist/lib/types.d.ts`, `node_modules/@embedpdf/engines/dist/direct-engine-C8xTbxym.js`.
- [Documentazione ufficiale EmbedPDF: Forms](https://www.embedpdf.com/docs/snippet/plugins/plugin-form), consultata il 21 ottobre 2026. Le capacità della documentazione corrente vanno confrontate con la versione 2.15.1 installata.
