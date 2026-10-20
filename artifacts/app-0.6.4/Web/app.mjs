import { createBridge } from './bridge.mjs';
import { createDocumentSession } from './document-session.mjs';
import { PageEditor, decodePdf } from './page-editor.mjs';
import { PagesPanel } from './pages-panel.mjs';
import { TextSurface } from './text-surface.mjs';
import { italian } from './italian.mjs';

const welcome = document.querySelector('#welcome');
const openButton = document.querySelector('#open');
const transport = window.chrome?.webview;
let bridge, registry, session, editor, panel, textSurface;
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
    textMode: !!textSurface?.active,
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
  const state = editorState();
  document.querySelector('#workspace').inert = locked || working;
  document.querySelector('#text-toolbar').inert = locked || working;
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
      panel.cancelDialogs(); locked = true; return notify();
    },
    'editor.unlock': () => { locked = false; return notify(); },
    'editor.toggle': togglePanel,
    'editor.text': () => withWorking(async () => {
      if (!locked || !editor?.canText) throw new Error('Il documento non consente l’inserimento di testo.');
      textSurface.toggle(undefined, true);
      return notify();
    }),
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
    'document.export': () => {
      if (!locked || !editor) throw new Error('Documento non disponibile per il salvataggio.');
      return editor.export();
    },
    'document.markSaved': payload => {
      if (!locked || !editor) throw new Error('Documento non disponibile per il salvataggio.');
      editor.markSaved(payload);
      return notify();
    }
  };
  bridge = createBridge(transport, Object.fromEntries(Object.entries(handlers)
    .map(([name, handler]) => [name, payload => enqueue(() => handler(payload))])));
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
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (!['o', 's', 'z', 'y'].includes(key)) return;
    // Text fields keep their own local undo, including the inline page editor.
    const target = event.composedPath()[0];
    if (['z', 'y'].includes(key) && (document.querySelector('dialog[open]') || target?.matches?.('input,textarea'))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (locked || working) return;
    if (key === 'o') bridge.emit('host.open');
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
