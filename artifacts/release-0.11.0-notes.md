# PDF MB 0.11.0 · build locale

Conversione in `nomefile.pdf.md`, confronto PDF/Markdown affiancato, modifica e anteprima live. Salvataggio UTF-8 con controllo delle modifiche esterne e conferma delle modifiche pendenti.

OCR e descrizione delle immagini con Ollama locale: ogni immagine viene estratta e inviata singolarmente, aspettando la risposta prima della successiva. Il selettore propone i modelli installati; il comando con icona resta disabilitato senza servizio e modello visivo locale. Interrompi conserva il risultato parziale. Durante la conversione sono bloccati anche Annulla/Ripeti da tastiera e l’apertura per trascinamento.

Estrarre **tutta** la cartella da `PDF-MB-0.11.0-win-x64.zip` e avviare `PdfMB.Desktop.exe`. Richiede .NET Desktop Runtime 10 e Microsoft Edge WebView2 Runtime. La guida offline è inclusa e si apre con F1. Il checksum SHA-256 è nel file `.zip.sha256`.

Verifiche locali eseguite il 29 ottobre 2026:

- 55 test Node/PDFium superati.
- Build Release .NET con zero avvisi ed errori.
- Controlli desktop superati: salvataggio Markdown, UTF-8 e limite 8 MB, conflitti esterni, disponibilità dei modelli, esclusione modelli remoti/non visivi, errori e annullamento OCR, una sola immagine per richiesta.
- Smoke test Chromium completo superato, compresi confronto affiancato, anteprima live inerte, salvataggio per revisione, conservazione delle correzioni e del risultato parziale, blocco scorciatoie/trascinamento durante conversione e regressioni degli strumenti PDF.
- Prova su Ollama locale con `gemma3:12b`: lettura corretta di `PDF MB TEST 123` da un PNG sintetico. Le descrizioni del modello possono contenere inesattezze; confrontarle con l’originale.

La checklist manuale per i documenti reali resta in `docs/CHECKLIST-MANUALE.md`. Il Markdown non aggiunge un livello OCR al PDF; l’estrazione automatica riguarda le immagini raster, comprese quelle delle scansioni. Questa build è preparata localmente e non è stata pubblicata su GitHub.
