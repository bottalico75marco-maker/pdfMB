# Markdown e OCR locale · PDF MB 0.11.0

Aprire un PDF e premere **Confronta Markdown** (icona M con freccia). Il PDF resta a sinistra; a destra compaiono il testo Markdown modificabile e l’anteprima aggiornata durante la scrittura. Il selettore Pagina naviga entrambi i pannelli. I marcatori `<!-- pdfmb-page:1 -->` collegano le sezioni al PDF: conservarli durante la modifica.

**Converti testo in MD** estrae il testo selezionabile sul PC, senza AI. Alla fine salva `nomefile.pdf.md` nella stessa cartella del PDF; per documenti nuovi viene chiesto il percorso. I caratteri accentati restano in UTF-8. Se esiste già un Markdown, il pannello lo carica e una riconversione richiede conferma.

Le foto rilevate hanno una sezione numerata per la descrizione. Per completarla automaticamente usare **OCR e descrivi foto**, identificato dall’icona con angoli di scansione e T. Il comando riconverte il testo e analizza le immagini. Le modifiche al Markdown non modificano il PDF; **Salva MD** o `Ctrl+S` mentre si lavora nel pannello conservano le correzioni. **Salva MD con nome** sceglie un altro percorso. Prima di cambiare documento o uscire vengono richieste le modifiche pendenti a entrambi i file.

## Preparare Ollama

Installare e avviare [Ollama](https://ollama.com/download/windows), quindi installare un modello visivo. Per partire con il download più piccolo:

```powershell
ollama pull qwen3-vl:2b-instruct
```

Nel campo Modello scegliere il nome esatto del modello installato e premere **Verifica modello**. Quando il servizio risponde, il campo propone i nomi dei modelli effettivamente installati; il comando OCR si abilita solo se quello scelto supporta le immagini ed è locale. Si possono usare anche altri modelli visivi già presenti, per esempio `gemma3:12b`. Il modello scelto viene ricordato sul PC. Vedere [i tag di Qwen3-VL](https://ollama.com/library/qwen3-vl/tags) e [MiniCPM-V](https://ollama.com/library/minicpm-v) per dimensioni e requisiti aggiornati.

L’app verifica il servizio su `127.0.0.1:11434`, la presenza del modello nell’elenco locale e la capacità `vision`. Modelli remoti/cloud non abilitano il comando. Se Ollama non è installato o avviato, oppure manca il modello visivo, **OCR rimane disabilitato** con il motivo nel pannello. La verifica si ripete ogni 15 secondi e prima di iniziare l’OCR; non vengono installati modelli automaticamente.

## Immagini e scansioni

Il motore PDF estrae ogni oggetto immagine, compresi quelli dentro gruppi PDF. Una richiesta a Ollama contiene **una sola immagine**: si attende la risposta prima di estrarre e inviare la successiva. Una scansione incorporata come immagine viene trattata allo stesso modo. Il modello trascrive il testo visibile mantenendone la lingua e descrive foto e grafici in italiano. Il PDF completo e le schermate delle pagine non sono inviati al modello. L’integrazione usa le [API locali di Ollama](https://docs.ollama.com/api/generate).

Le descrizioni compaiono nelle sezioni Immagine della rispettiva pagina, nell’ordine degli oggetti PDF. L’ordine non ricostruisce necessariamente l’impaginazione di colonne e didascalie. Sono estratte immagini raster; disegni vettoriali, tracciati e grafici costruiti da singole forme non sono rasterizzati automaticamente. Le immagini molto grandi vengono ridimensionate fino a 2200 pixel sul lato maggiore; sono ammessi al massimo 32 milioni di pixel per bitmap.

**Interrompi** annulla la richiesta in corso e conserva le pagine e le descrizioni già ricevute. In caso di errore il risultato parziale resta modificabile e può essere salvato manualmente. Il limite del file Markdown è 8 MB. L’OCR restituisce testo nel Markdown, senza aggiungere uno strato di testo ricercabile al PDF.

Durante la conversione sono bloccati i comandi che cambiano documento o contenuto, comprese le scorciatoie Annulla/Ripeti e l’apertura mediante trascinamento. Il pulsante **Interrompi** resta disponibile.

L’estrazione rispetta il permesso di copia del PDF. Il salvataggio usa sostituzione atomica e controllo dell’impronta del file: modifiche esterne al Markdown non vengono sovrascritte. La conversione locale ricostruisce titoli semplici in base alle dimensioni dei caratteri; tabelle, colonne, formule e la trascrizione del modello richiedono confronto e correzione. L’anteprima mostra titoli, elenchi, enfasi, codice, citazioni e tabelle semplici; HTML e link restano testo inerte.
