import { WorkbenchSurface } from './workbench-surface.mjs';
import { printImageBase64 } from './print-image.mjs';
import { installPdfDrop } from './pdf-drop.mjs';
import { HighlightSurface } from './highlight-surface.mjs';
import { createBridge } from './bridge.mjs';
import { createDocumentSession } from './document-session.mjs';
import { PageEditor, decodePdf } from './page-editor.mjs';
import { PagesPanel } from './pages-panel.mjs';
import { TextSurface } from './text-surface.mjs';
import { italian } from './italian.mjs';

const welcome = document.querySelector('#welcome');
const openButton = document.querySelector('#open');
const transport = window.chrome?.webview;
let bridge, registry, session, editor, panel, textSurface, highlightSurface, workbench;
let locked = false, working = false, panelOpen = false, nextView = null, strategy = 'vertical';
let tail = Promise.resolve();
const layouts = new Set();
const plugin = id => registry.getPlugin(id).provides();
const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const enqueue = action => {
  const result = tail.then(action);
  tail = result.catch(() => {});
  return result;
};

function editorState() {
  return { ...(editor?.state() ?? { token: null, revision: 0, dirty: false, readOnly: true,
    canEdit: false, canText: false, canUndo: false, canRedo: false, blockedReason: '' }),
    dirty: !!editor?.state().dirty || !!textSurface?.changed(),
    busy: locked || working || !!textSurface?.busy, textEditing: !!textSurface?.textEditing,
    textMode: !!textSurface?.active, highlightMode: !!highlightSurface?.active,
    editorOpen: panelOpen && !!editor };
}
function viewerState() {
  try {
    const textState = textSurface?.viewState();
    if (textState) return textState;
    const id = session?.currentId;
    const pdf = id && plugin('document-manager').getDocument(id);
    if (pdf) {
      const page = plugin('scroll').forDocument(id).getCurrentPage();
      const size = pdf.pages[Math.max(0, page - 1)]?.size;
      return { page, pageCount: pdf.pages.length,
        zoom: plugin('zoom').forDocument(id).getState().currentZoomLevel,
        widthMm: size ? Math.round(size.width * 25.4 / 72) : 0,
        heightMm: size ? Math.round(size.height * 25.4 / 72) : 0 };
    }
  } catch { /* Plugin scopes can be transiently unavailable during replacement. */ }
  return { page: 0, pageCount: 0, zoom: 1 };
}
function notify() {
  highlightSurface?.sync();
  const state = editorState();
  document.querySelector('#workspace').inert = locked || working;
  document.querySelector('#text-toolbar').inert = locked || working;
  document.querySelector('#tools-toolbar').inert = locked || working;
  workbench?.sync();
  panel?.refresh(panelOpen && !!editor);
  textSurface?.sync();
  bridge.emit('editor.state', state);
  bridge.emit('viewer.state', viewerState());
  return state;
}
function showError(error) {
  document.querySelector('#error-text').textContent = error?.message ?? String(error);
  document.querySelector('#fatal').hidden = false;
}
async function withWorking(action) {
  working = true;
  document.querySelector('#fatal').hidden = true;
  notify();
  try { return await action(); }
  finally { working = false; notify(); }
}
function uiAction(action) {
  if (locked || working) return;
  enqueue(() => withWorking(action)).catch(showError);
}

async function waitForLayout(id) {
  if (layouts.has(id)) return;
  await new Promise(resolve => {
    let stop = () => {}, timer, finished = false;
    function finish() { finished = true; clearTimeout(timer); stop(); resolve(); }
    stop = plugin('scroll').onLayoutReady(event => { if (event.documentId === id) finish(); });
    if (finished) stop(); else timer = setTimeout(finish, 3000);
  });
}
async function configureView(id) {
  const view = nextView;
  const ui = plugin('ui').forDocument(id);
  if (panelOpen) ui.closeSidebarSlot('left', 'main');
  else ui.setActiveSidebar('left', 'main', 'sidebar-panel', 'thumbnails');
  if (view) {
    plugin('spread').forDocument(id).setSpreadMode(view.spread);
    plugin('scroll').forDocument(id).setScrollStrategy(view.strategy);
    plugin('rotate').forDocument(id).setRotation(view.rotation);
  }
  await waitForLayout(id);
  await frames();
  if (view) {
    plugin('zoom').forDocument(id).requestZoom(view.zoom);
    await frames();
    plugin('scroll').forDocument(id).scrollToPage({ pageNumber: view.page, behavior: 'instant' });
  }
}
async function replaceView(buffer, name, page) {
  const id = session.currentId;
  nextView = id ? {
    zoom: plugin('zoom').forDocument(id).getState().zoomLevel,
    spread: plugin('spread').forDocument(id).getSpreadMode(),
    rotation: plugin('rotate').forDocument(id).getRotation(), strategy, page
  } : null;
  try { return await session.openBuffer(buffer, name); }
  finally { nextView = null; }
}
function togglePanel() {
  if (!editor) return editorState();
  panel.cancelDialogs();
  panelOpen = !panelOpen;
  const ui = plugin('ui').forDocument(session.currentId);
  if (panelOpen) ui.closeSidebarSlot('left', 'main');
  else ui.setActiveSidebar('left', 'main', 'sidebar-panel', 'thumbnails');
  return notify();
}

try {
  if (!transport) throw new Error('Aprire PDF MB tramite l’applicazione Windows.');
  const handlers = {
    'editor.lock': async () => {
      if (textSurface && !await textSurface.flush()) throw new Error('Correggere o annullare la modifica alla casella prima di continuare.');
      if (workbench && !workbench.close()) throw new Error('Chiudere o completare gli strumenti pagina.');
      highlightSurface?.suspend();
      panel.cancelDialogs(); locked = true; return notify();
    },
    'editor.unlock': () => { locked = false; return notify(); },
    'editor.toggle': togglePanel,
    'editor.text': () => withWorking(async () => {
      if (!locked || !editor?.canText) throw new Error('Il documento non consente l’inserimento di testo.');
      highlightSurface.toggle(false);
      textSurface.toggle(undefined, true);
      return notify();
    }),
    'editor.highlight': () => withWorking(async () => {
      if (!locked || !editor?.canText) throw new Error('Annotazioni non consentite.');
      if (textSurface.active) textSurface.toggle(false, true);
      highlightSurface.toggle();
      return notify();
    }),
    'editor.tools': payload => withWorking(async () => {
      if (!locked || !editor) throw new Error('Documento non disponibile.');
      highlightSurface.toggle(false);
      const pageIndex = Math.max(0, viewerState().page - 1);
      if (textSurface.active) textSurface.toggle(false, true);
      await workbench.open(pageIndex, payload.mode);
      return notify();
    }),
    'output.print': () => withWorking(async () => {
      if (!locked || !editor?.policy.canPrint) throw new Error('Stampa non consentita.');
      if (editor.pages.length > 500) throw new Error('Stampare al massimo 500 pagine per volta: estrarre un intervallo.');
      const pages = []; let total = 0;
      for (let index = 0; index < editor.pages.length; index++) {
        const data = await editor.outputPage(index, 'print');
        const base64 = printImageBase64(data.image);
        total += base64.length;
        if (total > 48 * 1024 * 1024) throw new Error('Anteprima oltre 36 MB. Estrarre un intervallo e stampare separatamente.');
        pages.push({ base64, widthMm: data.width * 25.4 / 72, heightMm: data.height * 25.4 / 72 });
      }
      return { token: editor.token, pages };
    }),
    'editor.highlightColor': payload => {
      highlightSurface.setColor(payload.color);
      return notify();
    },
    'editor.change': payload => withWorking(async () => { if (editor) await editor.change(payload); return editorState(); }),
    'editor.undo': () => withWorking(async () => { if (editor) await editor.undo(); return editorState(); }),
    'editor.redo': () => withWorking(async () => { if (editor) await editor.redo(); return editorState(); }),
    'editor.extract': payload => withWorking(async () => {
      if (!locked || !editor || payload.token !== editor.token)
        throw new Error('Documento non disponibile per l’estrazione.');
      return editor.extract();
    }),
    'editor.prepareInsert': payload => withWorking(async () => {
      if (!locked || !editor || payload.token !== editor.token)
        throw new Error('Documento non disponibile per l’inserimento.');
      return editor.prepareInsert(payload);
    }),
    'editor.insert': payload => withWorking(async () => {
      if (!locked || !editor || payload.token !== editor.token)
        throw new Error('Documento non disponibile per l’inserimento.');
      await editor.insert(payload);
      return notify();
    }),
    'editor.cancelInsert': async payload => {
      if (!locked || !editor || payload.token !== editor.token)
        throw new Error('Documento non disponibile per l’inserimento.');
      await editor.cancelInsert(payload.importToken);
      return notify();
    },
    'document.open': payload => withWorking(async () => {
      if (!locked) throw new Error('Operazione documento non sincronizzata con l’applicazione.');
      if (typeof payload.name !== 'string') throw new Error('Nome documento non valido.');
      const candidate = new PageEditor(payload.name, replaceView, () => viewerState().page);
      try {
        await candidate.initialize(decodePdf(payload.base64));
        // A new input document starts with the default view; edits preserve it.
        nextView = null;
        const result = await session.openBuffer(candidate.source, payload.name);
        candidate.finishOpen(result.pageCount);
        editor?.dispose();
        editor = candidate;
        welcome.hidden = true;
        return notify();
      } catch (error) { candidate.dispose(); throw error; }
    }),
    'document.close': () => withWorking(async () => {
      if (!locked) throw new Error('Operazione documento non sincronizzata con l’applicazione.');
      await session.close();
      editor?.dispose(); editor = null;
      panelOpen = false;
      panel.clear();
      welcome.hidden = false;
      return notify();
    }),
    'document.export': () => withWorking(async () => {
      if (!locked || !editor) throw new Error('Documento non disponibile per il salvataggio.');
      return editor.export();
    }),
    'document.markSaved': payload => {
      if (!locked || !editor) throw new Error('Documento non disponibile per il salvataggio.');
      editor.markSaved(payload);
      return notify();
    }
  };
  bridge = createBridge(transport, Object.fromEntries(Object.entries(handlers)
    .map(([name, handler]) => [name, payload => enqueue(() => handler(payload))])));
  installPdfDrop({ target: document, unavailable: () => locked || working || !session,
    open: file => transport.postMessageWithAdditionalObjects({ version: 1, kind: 'event', type: 'host.drop', payload: {} }, [file]),
    showError });
  const { default: EmbedPDF } = await import('./vendor/embedpdf.js');
  const viewer = EmbedPDF.init({
    type: 'container', target: document.querySelector('#viewer'), worker: true,
    wasmUrl: new URL('./vendor/pdfium.wasm', location.href).href,
    fontFallback: null, fonts: { ui: null, signature: null },
    stamp: { manifests: [], defaultLibrary: false }, theme: { preference: 'light' },
    i18n: { defaultLocale: 'it', fallbackLocale: 'en', locales: [italian] },
    tabBar: 'never', documentManager: { maxDocuments: 2 },
    zoom: { defaultZoomLevel: 'fit-page' },
    disabledCategories: ['annotation', 'redaction', 'form', 'insert', 'signature', 'history',
      'document-open', 'document-close', 'document-export', 'document-print',
      'document-protect', 'document-capture', 'document-fullscreen', 'security'],
    // The snippet remains a viewer. Persistent editing is isolated in our Worker.
    permissions: { enforceDocumentPermissions: true, overrides: {
      modifyContents: false, modifyAnnotations: false, fillForms: false, assembleDocument: false
    } }
  });
  registry = await viewer.registry;
  session = createDocumentSession(plugin('document-manager'), configureView);
  panel = new PagesPanel({ plugin, session, editor: () => editor, unavailable: () => locked || working || !!textSurface?.pending,
    select: (index, event, preserve = false) => {
      if (!preserve) editor.select(index, event);
      panel.updateSelection();
      plugin('scroll').forDocument(session.currentId).scrollToPage({ pageNumber: index + 1, behavior: 'instant' });
    },
    change: payload => uiAction(() => editor.change(payload)),
    insert: () => { if (!locked && !working && editor?.canEdit) bridge.emit('host.insert'); },
    extract: () => { if (!locked && !working && editor?.canEdit && editor.selection.size) bridge.emit('host.extract'); },
    toggle: () => { if (!locked && !working) togglePanel(); }
  });
  textSurface = new TextSurface({ editor: () => editor, plugin, session, notify,
    unavailable: () => locked || working,
    read: (pageIndex, omitId) => enqueue(() => editor.textContext(pageIndex, omitId)),
    run: action => enqueue(action),
    apply: payload => withWorking(() => editor.changeText(payload)),
    onPage: index => {
      if (!session.currentId) return;
      plugin('scroll').forDocument(session.currentId).scrollToPage({ pageNumber: index + 1, behavior: 'instant' });
    },
    onView: () => bridge.emit('viewer.state', viewerState())
  });
  workbench = new WorkbenchSurface({ editor: () => editor, plugin, session, read: action => enqueue(action), run: action => enqueue(() => withWorking(action)),
    notify, unavailable: () => locked || working });
  highlightSurface = new HighlightSurface({ editor: () => editor, plugin, session,
    run: action => enqueue(() => withWorking(action)), notify,
    unavailable: () => locked || working || !!textSurface?.active || !!workbench?.active, showError });
  plugin('scroll').onLayoutReady(event => layouts.add(event.documentId));
  plugin('document-manager').onDocumentClosed(id => layouts.delete(id));
  plugin('scroll').onStateChange(state => { strategy = state.strategy; });
  plugin('scroll').onPageChange(() => bridge.emit('viewer.state', viewerState()));
  plugin('zoom').onZoomChange(() => bridge.emit('viewer.state', viewerState()));
  plugin('rotate').onRotateChange(() => { textSurface.layout(); bridge.emit('viewer.state', viewerState()); });
  openButton.disabled = false;
  document.querySelector('#hint').textContent = 'Ctrl+O per aprire · Elaborazione locale';
  openButton.onclick = () => { if (!locked && !working) bridge.emit('host.open'); };
  document.querySelector('#dismiss-error').onclick = () => { document.querySelector('#fatal').hidden = true; };
  document.querySelector('#move-position').onkeydown = event => {
    if (event.key === 'Enter') { event.preventDefault(); document.querySelector('#move-confirm').click(); }
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'F1') {
      event.preventDefault(); event.stopImmediatePropagation(); bridge.emit('host.guide'); return;
    }
    if (event.key === 'Escape' && workbench.active && !locked && !working) {
      event.preventDefault(); workbench.close(); notify(); return;
    }
    if (event.key === 'Escape' && highlightSurface.active && !locked && !working) {
      highlightSurface.toggle(false); notify(); return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (!['o', 's', 'p', 'z', 'y'].includes(key)) return;
    // Text fields keep their own local undo, including the inline page editor.
    const target = event.composedPath()[0];
    if (['z', 'y'].includes(key) && (document.querySelector('dialog[open]') || target?.matches?.('input,textarea'))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (locked || working) return;
    if (key === 'o') bridge.emit('host.open');
    if (key === 'p') bridge.emit('host.print');
    if (key === 's') bridge.emit(event.shiftKey ? 'host.saveAs' : 'host.save');
    if (key === 'z' || key === 'y') enqueue(async () => {
      if (await textSurface.flush()) await withWorking(() => key === 'z' ? editor?.undo() : editor?.redo());
    }).catch(showError);
  }, true);
  bridge.emit('viewer.ready');
  notify();
} catch (error) {
  showError(error);
  document.querySelector('#hint').textContent = 'Avvio non riuscito';
  bridge?.emit('viewer.error', { message: error?.message ?? String(error) });
}

