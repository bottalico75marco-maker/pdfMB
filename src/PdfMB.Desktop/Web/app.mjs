import { FormSurface } from './form-surface.mjs';
import { MarkdownSurface } from './markdown-surface.mjs';
import { FormReader } from './form-reader.mjs';
import { installCommandIcons } from './command-icons.mjs';
import { WorkbenchSurface } from './workbench-surface.mjs';
import { printImageBase64 } from './print-image.mjs';
import { installPdfDrop } from './pdf-drop.mjs';
import { HighlightSurface } from './highlight-surface.mjs';
import { createBridge } from './bridge.mjs';
import { createDocumentSession } from './document-session.mjs';
import { PageEditor, decodePdf, encodePdf, createBlankPdf, openProtectedPdf } from './page-editor.mjs';
import { fieldValueError } from './form-validation.mjs';
import { PagesPanel } from './pages-panel.mjs';
import { TextSurface } from './text-surface.mjs';
import { italian } from './italian.mjs';

const welcome = document.querySelector('#welcome');
const openButton = document.querySelector('#open');
const transport = window.chrome?.webview;
let bridge, registry, session, editor, panel, textSurface, highlightSurface, workbench, formSurface, formReader, markdown;
let locked = false, working = false, panelOpen = false, nextView = null, strategy = 'vertical';
let deferredFormView = null;
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
    dirty: !!editor?.state().dirty || !!textSurface?.changed() || !!workbench?.pendingShape || !!formSurface?.pending || !!formSurface?.pendingValue || !!formReader?.changed,
    busy: locked || working || !!markdown?.generating || !!textSurface?.busy || !!workbench?.busy || workbench?.drag != null || !!formSurface?.drag || !!formSurface?.busy, formMode: !!formSurface?.active, textEditing: !!markdown?.textEditing || !!textSurface?.textEditing || !!formSurface?.textEditing || !!formReader?.textEditing,
    markdownDirty: !!markdown?.dirty, markdownEditing: !!markdown?.textEditing,
    textMode: !!textSurface?.active, highlightMode: !!highlightSurface?.active,
    editorOpen: panelOpen && !!editor };
}
function viewerState() {
  try {
    const textState = textSurface?.viewState();
    if (textState) return textState;
    if (formSurface?.active && formSurface.data) return { page: formSurface.pageIndex + 1, pageCount: editor.pages.length, zoom: formSurface.scale || 1, widthMm: Math.round(formSurface.data.width * 25.4 / 72), heightMm: Math.round(formSurface.data.height * 25.4 / 72) };
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
  formSurface?.sync();
  if (!formSurface?.active) highlightSurface?.sync();
  const state = editorState();
  // The text surface drives and guards its own commit. Making it inert for the
  // duration threw away every click in between, so the selection the user
  // asked for never happened and the edit appeared to need a second attempt.
  const blocked = locked || working, textBusy = !locked && !!textSurface?.busy;
  document.querySelector('#workspace').inert = blocked && !textBusy;
  for (const id of ['pages-panel', 'viewer', 'tools-preview', 'markdown-panel'])
    document.querySelector(`#${id}`).inert = blocked && textBusy;
  document.querySelector('#text-toolbar').inert = locked || working;
  document.querySelector('#tools-toolbar').inert = locked || working;
  workbench?.sync();
  panel?.refresh(panelOpen && !!editor);
  textSurface?.sync();
  formReader?.sync();
  markdown?.sync(editor);
  syncSidebarGrip();
  bridge.emit('editor.state', state);
  bridge.emit('viewer.state', viewerState());
  return state;
}
function showError(error) {
  document.querySelector('#error-text').textContent = error?.message ?? String(error);
  document.querySelector('#fatal').hidden = false;
}
// Undo and redo from the application apply a pending text draft first, exactly
// as the keyboard shortcut does: replacing the document under an open draft
// discarded the edit the user had just typed.
async function historyStep(step) {
  if (!editor) return editorState();
  if (textSurface && !await textSurface.flush()) return editorState();
  return withWorking(async () => { await step(); await formSurface?.refresh(); return editorState(); });
}
async function withWorking(action) {
  working = true;
  document.querySelector('#fatal').hidden = true;
  notify();
  try { return await action(); }
  finally { working = false; notify(); }
}
function uiAction(action) {
  if (locked || working || markdown?.generating) return;
  // The host may lock the editor while this action waits in the queue: re-check
  // when it actually runs, or the edit would slip between lock and export.
  enqueue(() => { if (locked || !editor) return; return withWorking(action); }).catch(showError);
}

// The viewer ships a 250 px sidebar with 150 px thumbnails whatever the
// window. Both follow the viewer's width, and the sidebar edge can be dragged:
// the chosen width is kept for the session and across sessions. The sidebar
// width is schema, applied to the open one directly; the thumbnail width is
// plugin configuration this vendored version keeps on the plugin instance, so
// the change is applied only when that surface is still there.
const SIDEBAR_KEY = 'pdfmb.sidebarWidth';
let fittedSidebar = 0, fittedThumbnail = 0, fitFrame = 0, userSidebar = 0;
try { userSidebar = Math.max(0, Number(localStorage.getItem(SIDEBAR_KEY)) || 0); } catch { /* storage may be unavailable */ }
const desktopLayout = () => innerWidth >= 768;
const sidebarBounds = viewerWidth => ({ min: 150, max: Math.max(250, Math.round(viewerWidth * .6)) });
function sidebarWidthFor(viewerWidth) {
  const { min, max } = sidebarBounds(viewerWidth);
  return Math.round(Math.max(min, Math.min(max, userSidebar || Math.max(150, Math.min(250, viewerWidth * .26)))));
}
function applySidebar(width) {
  if (width === fittedSidebar) return;
  fittedSidebar = width;
  plugin('ui').mergeSchema({ sidebars: { 'sidebar-panel': { width: `${width}px` } } });
  const open = document.querySelector('#viewer embedpdf-container')?.shadowRoot?.querySelector('.border-r[style*="width"]');
  if (open) open.style.width = `${width}px`;
  document.querySelector('#sidebar-grip').style.left = `${width}px`;
}
function applyThumbnails(width) {
  if (width === fittedThumbnail) return;
  fittedThumbnail = width;
  const thumbnails = registry.getPlugin('thumbnail');
  if (!thumbnails?.cfg || typeof thumbnails.calculateWindowState !== 'function') return;
  thumbnails.cfg.width = width;
  thumbnails.taskCaches?.forEach(cache => { cache.forEach(task => task.abort?.({ code: 'cancelled', message: 'Larghezza miniature cambiata.' })); cache.clear(); });
  if (session?.currentId) thumbnails.calculateWindowState(session.currentId);
}
function fitThumbnails() {
  const viewerWidth = document.querySelector('#viewer').clientWidth;
  if (!registry || !viewerWidth) return;
  const desktop = desktopLayout();
  const sidebar = desktop ? sidebarWidthFor(viewerWidth) : viewerWidth;
  if (desktop) applySidebar(sidebar);
  applyThumbnails(Math.max(60, Math.min(desktop ? 400 : 220, sidebar - 34)));
}
const scheduleFit = () => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(fitThumbnails); };
function installSidebarGrip() {
  const grip = document.querySelector('#sidebar-grip');
  let drag = null;
  grip.onpointerdown = event => {
    if (event.button !== 0 || locked || working) return;
    drag = { pointerId: event.pointerId, startX: event.clientX, startWidth: fittedSidebar };
    grip.setPointerCapture(event.pointerId); grip.classList.add('dragging'); event.preventDefault();
  };
  grip.onpointermove = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { min, max } = sidebarBounds(document.querySelector('#viewer').clientWidth);
    userSidebar = Math.round(Math.max(min, Math.min(max, drag.startWidth + event.clientX - drag.startX)));
    applySidebar(userSidebar);
  };
  const finish = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null; grip.classList.remove('dragging');
    if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
    try { localStorage.setItem(SIDEBAR_KEY, String(userSidebar)); } catch { /* keep for the session only */ }
    scheduleFit();
  };
  grip.onpointerup = finish; grip.onpointercancel = finish; grip.onlostpointercapture = finish;
  grip.ondblclick = () => { userSidebar = 0; try { localStorage.removeItem(SIDEBAR_KEY); } catch { /* ignore */ } fittedSidebar = 0; scheduleFit(); };
}
function syncSidebarGrip() {
  const grip = document.querySelector('#sidebar-grip');
  grip.hidden = !registry || !session?.currentId || !desktopLayout() || panelOpen || !!textSurface?.active || !!formSurface?.active || !!markdown?.active;
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
  // The viewer is hidden while designing: its layout cannot become ready.
  // Keep parsing each replacement transactionally, but restore layout on exit.
  if (formSurface?.active) { deferredFormView = view; return; }
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
    zoom: deferredFormView?.zoom ?? plugin('zoom').forDocument(id).getState().zoomLevel,
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

async function openDocument(source, name, unsaved = false, password = '') {
  const opened = await openProtectedPdf(source, password);
  source = opened.buffer;
  const candidate = new PageEditor(name, replaceView, () => viewerState().page);
  try {
    await candidate.initialize(source);
    nextView = null;
    const result = await session.openBuffer(candidate.source, name);
    candidate.finishOpen(result.pageCount);
    candidate.unsavedDocument = unsaved;
    candidate.password = candidate.savedPassword = opened.protected ? password : '';
    editor?.dispose(); editor = candidate;
    markdown?.reset();
    welcome.hidden = true;
    return notify();
  } catch (error) { candidate.dispose(); throw error; }
}

try {
  installCommandIcons();
  if (!transport) throw new Error('Aprire PDF MB tramite l’applicazione Windows.');
  const handlers = {
    'markdown.open': async payload => {
      if (!editor || payload.token !== editor.token) throw new Error('Documento cambiato.');
      if (formSurface.active) await formSurface.close();
      if (textSurface.active) textSurface.toggle(false, true);
      highlightSurface.toggle(false); workbench.close(); panelOpen = false;
      plugin('ui').forDocument(session.currentId).closeSidebarSlot('left', 'main');
      markdown.open({ ...payload, name: editor.name, pageCount: editor.pages.length, pdfRevision: editor.revision });
      return notify();
    },
    'markdown.begin': payload => { markdown.begin(payload); return { token: editor.token, pageCount: editor.pages.length }; },
    'markdown.page': async payload => {
      if (!editor || payload.token !== editor.token || payload.revision !== editor.revision) throw new Error('Il PDF è cambiato durante la conversione.');
      const data = await editor.markdownPage(payload.pageIndex, payload.imageIndex);
      return payload.imageIndex === undefined ? data : { base64: printImageBase64(data) };
    },
    'markdown.append': payload => { markdown.append(payload); return {}; },
    'markdown.image': payload => { markdown.appendImage(payload); return {}; },
    'markdown.progress': payload => { markdown.status.textContent = payload.message; return {}; },
    'markdown.finish': payload => { markdown.finish(payload); return notify(); },
    'markdown.export': () => markdown.export(),
    'markdown.saved': payload => { markdown.markSaved(payload); return notify(); },
    'markdown.availability': payload => { markdown.availability(payload); return {}; },
    'stamps.set': payload => workbench.setCustomStamps(payload),
    'stamps.error': payload => workbench.stampError(payload.message),
    'editor.lock': async () => {
      await formReader?.flush();
      await formSurface?.flush();
      if (textSurface && !await textSurface.flush()) throw new Error('Correggere o annullare la modifica alla casella prima di continuare.');
      if (workbench && !await workbench.flushShapes()) throw new Error('Completare l’immagine o la forma prima di salvare o cambiare documento.');
      if (workbench && !workbench.close()) throw new Error('Chiudere o completare gli strumenti pagina.');
      if (!formSurface?.active) highlightSurface?.suspend();
      panel.cancelDialogs(); locked = true; return notify();
    },
    'editor.unlock': () => { locked = false; return notify(); },
    'editor.toggle': togglePanel,
    'editor.forms': () => withWorking(async () => {
      if (!locked || !editor?.canFormDesign) throw new Error('Il documento non consente la progettazione di moduli.');
      if (textSurface.active) textSurface.toggle(false, true);
      highlightSurface.toggle(false); workbench.close(); panelOpen = false;
      try { await formSurface.open(); } catch (error) { await formSurface.close(); throw error; }
      return notify();
    }),
    'editor.text': () => withWorking(async () => {
      if (!locked || !editor?.canTextEdit) throw new Error('Il documento non consente la modifica del testo.');
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
    'editor.undo': () => historyStep(() => editor.undo()),
    'editor.redo': () => historyStep(() => editor.redo()),
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
      return openDocument(decodePdf(payload.base64), payload.name, false, payload.password ?? '');
    }),
    'document.create': payload => withWorking(async () => {
      if (!locked) throw new Error('Operazione documento non sincronizzata con l’applicazione.');
      const bytes = await createBlankPdf(payload);
      const state = await openDocument(bytes, 'Nuovo documento.pdf', true);
      return { state, base64: encodePdf(bytes) };
    }),
    'editor.blankOptions': () => {
      if (!locked || !editor?.canEdit) throw new Error('Documento non modificabile.');
      return { token: editor.token, pageCount: editor.pages.length, page: viewerState().page };
    },
    'editor.insertBlank': payload => withWorking(async () => {
      if (!locked || !editor?.canEdit || payload.token !== editor.token) throw new Error('Documento non disponibile.');
      await editor.insertBlank(payload);
      return notify();
    }),
    'document.close': () => withWorking(async () => {
      if (!locked) throw new Error('Operazione documento non sincronizzata con l’applicazione.');
      await session.close();
      editor?.dispose(); editor = null;
      markdown.reset();
      panelOpen = false;
      panel.clear();
      welcome.hidden = false;
      return notify();
    }),
    'document.export': () => withWorking(async () => {
      if (!locked || !editor) throw new Error('Documento non disponibile per il salvataggio.');
      return editor.export();
    }),
    'document.protect': payload => {
      if (!locked || !editor?.canEdit || typeof payload.password !== 'string' || new TextEncoder().encode(payload.password).length > 127 || payload.password.includes('\0')) throw new Error('Password non valida o documento non modificabile.');
      editor.password = payload.password; editor.revision++;
      return notify();
    },
    'document.email': payload => withWorking(async () => {
      if (!locked || !editor?.canFormDesign || payload.token !== editor.token) throw new Error('Documento cambiato.');
      const fields = editor.pages.flatMap(p => p.formFields ?? []);
      const button = fields.find(f => f.id === payload.fieldId && f.kind === 'button' && !f.readOnly);
      if (!button) throw new Error('Pulsante non disponibile.');
      for (const field of fields) { const error = fieldValueError(field, field.value, true); if (error) throw new Error(`${field.label || field.name}: ${error}`); }
      return { ...await editor.export(), email: button.email || '' };
    }),
    'document.markSaved': payload => {
      if (!locked || !editor) throw new Error('Documento non disponibile per il salvataggio.');
      editor.markSaved(payload);
      return notify();
    }
  };
  bridge = createBridge(transport, Object.fromEntries(Object.entries(handlers)
    .map(([name, handler]) => [name, payload => enqueue(() => handler(payload))])));
  markdown = new MarkdownSurface({ emit: (type, payload) => bridge.emit(type, payload), notify,
    unavailable: () => locked || working,
    navigate: page => {
      if (!session?.currentId || page < 1 || page > editor.pages.length) return;
      plugin('scroll').forDocument(session.currentId).scrollToPage({ pageNumber: page, behavior: 'instant' });
    } });
  installPdfDrop({ target: document, unavailable: () => locked || working || !!markdown?.generating || !session || !!formSurface?.active,
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
    // Thumbnails use the same render plugin: include AcroForm appearances there too.
    render: { withForms: true },
    disabledCategories: ['annotation', 'redaction', 'form', 'insert', 'signature', 'history',
      'document-open', 'document-close', 'document-export', 'document-print',
      'document-protect', 'document-capture', 'document-fullscreen', 'document-menu', 'security'],
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
    insertBlank: () => { if (!locked && !working && editor?.canEdit) bridge.emit('host.insertBlank'); },
    extract: () => { if (!locked && !working && editor?.canEdit && editor.selection.size) bridge.emit('host.extract'); },
    toggle: () => { if (!locked && !working) togglePanel(); }
  });
  textSurface = new TextSurface({ editor: () => editor, plugin, session, notify,
    unavailable: () => locked || working,
    read: (pageIndex, omitId) => enqueue(() => editor.textContext(pageIndex, omitId)),
    run: action => enqueue(action),
    apply: payload => withWorking(() => payload.input.source ? editor.changeWorkbench({ ...payload,
      input: { ...payload.input, remove: payload.remove, operation: payload.input.source === 'content' ? 'object-text-group' : 'annotation-text-group' } }) : editor.changeText(payload)),
    onPage: index => {
      if (!session.currentId) return;
      plugin('scroll').forDocument(session.currentId).scrollToPage({ pageNumber: index + 1, behavior: 'instant' });
    },
    onView: () => bridge.emit('viewer.state', viewerState())
  });
  workbench = new WorkbenchSurface({ editor: () => editor, plugin, session, read: action => enqueue(action), run: action => enqueue(() => withWorking(action)),
    commit: payload => withWorking(() => editor.changeWorkbench(payload)),
    notify, emit: (type, payload) => bridge.emit(type, payload), unavailable: () => locked || working });
  formSurface = new FormSurface({ editor: () => editor, currentPage: () => viewerState().page,
    run: (action, focusOverride) => enqueue(async () => {
      const focus = focusOverride ?? formSurface.captureFocus();
      try { return await withWorking(action); } finally { formSurface.restoreFocus(focus); }
    }), commit: payload => editor.changeForm(payload),
    unavailable: () => locked || working, notify, showError, emit: (type, payload) => bridge.emit(type, payload),
    onPage: () => {},
    onClose: async page => {
      const view = deferredFormView; deferredFormView = null;
      await waitForLayout(session.currentId); await frames();
      if (view) { plugin('zoom').forDocument(session.currentId).requestZoom(view.zoom); await frames(); }
      plugin('scroll').forDocument(session.currentId).scrollToPage({ pageNumber: page + 1, behavior: 'instant' });
    }
  });
  highlightSurface = new HighlightSurface({ editor: () => editor, plugin, session,
    run: action => enqueue(() => withWorking(action)), notify,
    unavailable: () => locked || working || !!textSurface?.active || !!workbench?.active || !!formSurface?.active, showError });
  formReader = new FormReader({ editor: () => editor, plugin, session, notify, showError,
    unavailable: () => locked || working,
    suspended: () => !!markdown?.active || !!formSurface?.active || !!textSurface?.active || !!workbench?.active || !!highlightSurface?.active,
    read: action => enqueue(action), run: action => enqueue(() => withWorking(action)), emit: (type, payload) => bridge.emit(type, payload) });
  plugin('scroll').onLayoutReady(event => { layouts.add(event.documentId); scheduleFit(); });
  new ResizeObserver(scheduleFit).observe(document.querySelector('#viewer'));
  installSidebarGrip(); scheduleFit();
  plugin('document-manager').onDocumentClosed(id => layouts.delete(id));
  plugin('scroll').onStateChange(state => { strategy = state.strategy; });
  plugin('scroll').onPageChange(() => { const view = viewerState(); markdown.showPage(view.page); bridge.emit('viewer.state', view); });
  plugin('zoom').onZoomChange(() => bridge.emit('viewer.state', viewerState()));
  plugin('rotate').onRotateChange(() => { textSurface.layout(); bridge.emit('viewer.state', viewerState()); });
  document.querySelector('#new-document').disabled = false;
  document.querySelector('#new-document').onclick = () => { if (!locked && !working) bridge.emit('host.new'); };
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
      if (document.querySelector(':popover-open')) return;
      event.preventDefault(); workbench.close(); notify(); return;
    }
    if (event.key === 'Escape' && highlightSurface.active && !locked && !working) {
      highlightSurface.toggle(false); notify(); return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (!['n', 'o', 's', 'p', 'z', 'y'].includes(key)) return;
    // Text fields keep their own local undo, including the inline page editor.
    const target = event.composedPath()[0];
    if (['z', 'y'].includes(key) && (document.querySelector('dialog[open]') || target?.matches?.('input,textarea'))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (locked || working || markdown.generating) return;
    if (formSurface.active && ['n', 'o', 'p'].includes(key)) return;
    if (key === 'n') bridge.emit('host.new');
    if (key === 'o') bridge.emit('host.open');
    if (key === 'p') bridge.emit('host.print');
    if (key === 's') bridge.emit(markdown.textEditing ? (event.shiftKey ? 'host.markdownSaveAs' : 'host.markdownSave') : (event.shiftKey ? 'host.saveAs' : 'host.save'));
    if (key === 'z' || key === 'y') enqueue(async () => {
      if (locked || !editor) return;
      await formSurface.flush();
      if (await textSurface.flush()) await withWorking(async () => { await (key === 'z' ? editor?.undo() : editor?.redo()); await formSurface.refresh(); });
    }).catch(showError);
  }, true);
  bridge.emit('viewer.ready');
  markdown.checkModel();
  notify();
} catch (error) {
  showError(error);
  document.querySelector('#hint').textContent = 'Avvio non riuscito';
  bridge?.emit('viewer.error', { message: error?.message ?? String(error) });
}

