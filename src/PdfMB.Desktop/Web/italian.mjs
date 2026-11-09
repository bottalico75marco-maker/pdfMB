// Viewer keys can be extended here without changing the native bridge.
export const italian = {
  code: 'it', name: 'Italiano',
  translations: {
    zoom: {
      in: 'Ingrandisci', out: 'Riduci', fitPage: 'Adatta pagina', fitWidth: 'Adatta larghezza',
      marquee: 'Zoom su area', menu: 'Zoom', level: 'Zoom ({level}%)', automatic: 'Automatico',
      dragTip: 'Trascinare per selezionare l’area da ingrandire'
    },
    pan: { toggle: 'Mano' }, pointer: { toggle: 'Seleziona testo' },
    document: {
      menu: 'Documento', open: 'Apri PDF', close: 'Chiudi documento',
      print: 'Stampa', export: 'Esporta', fullscreen: 'Schermo intero', protect: 'Protezione',
      loading: 'Caricamento del documento…'
    },
    panel: {
      sidebar: 'Pannello pagine', search: 'Trova nel documento', comment: 'Commenti',
      thumbnails: 'Miniature', outline: 'Segnalibri'
    },
    page: {
      settings: 'Visualizzazione pagina', single: 'Pagina singola',
      twoOdd: 'Affiancate, prima pagina a destra', twoEven: 'Affiancate, prima pagina a sinistra',
      vertical: 'Scorrimento verticale', horizontal: 'Scorrimento orizzontale',
      next: 'Pagina successiva', previous: 'Pagina precedente',
      spreadMode: 'Disposizione pagine', scrollLayout: 'Scorrimento', rotation: 'Rotazione vista'
    },
    rotate: { clockwise: 'Ruota vista a destra', counterClockwise: 'Ruota vista a sinistra' },
    menu: { moreOptions: 'Altre opzioni', viewControls: 'Visualizzazione', zoomControls: 'Zoom' },
    mode: { view: 'Visualizza' },
    selection: { copyToClipboard: 'Copia negli appunti', copy: 'Copia' },
    search: { placeholder: 'Cerca nel documento', noResults: 'Nessun risultato',
      caseSensitive: 'Maiuscole/minuscole', wholeWord: 'Parola intera',
      resultsFound: '{count} risultati trovati', page: 'Pagina {page}' },
    outline: { title: 'Segnalibri', loading: 'Caricamento segnalibri…',
      noOutline: 'Nessun segnalibro disponibile', noBookmarks: 'Il documento non contiene segnalibri' },
    emptyState: { title: 'Nessun documento aperto', description: 'Aprire un PDF per iniziare.',
      descriptionMulti: 'È possibile anche trascinare un PDF nella finestra.', openButton: 'Apri documento', supportedFormats: 'Formato supportato: PDF' },
    passwordPrompt: { title: 'Password richiesta',
      required: 'Il documento è protetto da password. Inserire la password per aprirlo.',
      incorrect: 'La password inserita non è corretta. Riprovare.',
      incorrectWarning: 'Password non corretta. Controllare e riprovare.',
      label: 'Password', placeholder: 'Password del documento', open: 'Apri', opening: 'Apertura…',
      cancel: 'Annulla', close: 'Chiudi' },
    documentError: { title: 'Errore nel caricamento del documento', unknown: 'Si è verificato un errore sconosciuto',
      errorCode: 'Codice errore: {code}', close: 'Chiudi documento' },
    history: { undo: 'Annulla', redo: 'Ripeti' },
    commands: {
      zoom: { in: 'Ingrandisci', out: 'Riduci', fitWidth: 'Adatta larghezza', fitPage: 'Adatta pagina',
        automatic: 'Automatico', level: 'Zoom ({level}%)', inArea: 'Zoom su area' },
      rotate: { clockwise: 'Ruota vista a destra', counterclockwise: 'Ruota vista a sinistra' },
      menu: 'Menu', sidebar: 'Pannello pagine', search: 'Trova', comment: 'Commenti',
      download: 'Scarica', print: 'Stampa', openFile: 'Apri PDF', save: 'Salva', settings: 'Impostazioni',
      view: 'Visualizza', pan: 'Mano', pointer: 'Seleziona testo', copy: 'Copia',
      nextPage: 'Pagina successiva', previousPage: 'Pagina precedente'
    }
  }
};
