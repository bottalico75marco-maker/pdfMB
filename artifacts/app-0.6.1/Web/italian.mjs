// Viewer keys can be extended here without changing the native bridge.
export const italian = {
  code: 'it', name: 'Italiano',
  translations: {
    zoom: {
      in: 'Ingrandisci', out: 'Riduci', fitPage: 'Adatta pagina', fitWidth: 'Adatta larghezza',
      marquee: 'Zoom su area', menu: 'Zoom', level: 'Zoom ({level}%)', automatic: 'Automatico'
    },
    pan: { toggle: 'Mano' }, pointer: { toggle: 'Seleziona testo' },
    document: {
      menu: 'Documento', open: 'Apri PDF', close: 'Chiudi documento',
      print: 'Stampa', export: 'Esporta', fullscreen: 'Schermo intero'
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
    search: { placeholder: 'Cerca nel documento', noResults: 'Nessun risultato' },
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
