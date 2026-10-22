import { createFormTools } from './form-engine.mjs';
import { transformPdfSecurity } from './pdf-security.mjs';
import { paperSize } from './paper-sizes.mjs';
import { rewriteFormDocument, FORM_EMAIL_ACTION_VERSION } from './form-document.mjs';
import { createHighlightTools } from './highlight-engine.mjs';
import { createStampTools } from './stamp-engine.mjs';
import { createWorkbenchTools } from './workbench-engine.mjs';
import { init } from './vendor/pdfium-api.js';
import { createTextTools } from './text-engine.mjs';

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_SOURCE_BYTES = 128 * 1024 * 1024;
let sourceFormPages = [];
let api, formTools, textTools, highlightTools, workbenchTools, stampTools, source, sourceCount, nextPageId, pendingImport;
const imports = new Map();
const catalog = new Map();
const overrides = new Map();
async function initialize() {
  if (api) return;
  const response = await fetch(new URL('./vendor/pdfium.wasm', import.meta.url));
  if (!response.ok) throw new Error('Motore di modifica PDF non disponibile.');
  api = await init({ wasmBinary: await response.arrayBuffer() });
  api.PDFiumExt_Init();
  textTools = createTextTools(api);
  formTools = createFormTools(api, textTools);
  highlightTools = createHighlightTools(api, textTools);
  workbenchTools = createWorkbenchTools(api, textTools);
  stampTools = createStampTools(api, textTools);
}
function allocate(length) {
  const pointer = api.pdfium.wasmExports.malloc(length);
  if (!pointer) throw new Error('Memoria insufficiente per elaborare il PDF.');
  return pointer;
}
function withDocument(action, buffer = source) {
  const pointer = allocate(buffer.byteLength);
  let handle = 0;
  try {
    api.pdfium.HEAPU8.set(new Uint8Array(buffer), pointer);
    handle = api.FPDF_LoadMemDocument(pointer, buffer.byteLength, '');
    if (!handle) throw new Error('PDF non leggibile o protetto da password.');
    return action(handle);
  } finally {
    if (handle) api.FPDF_CloseDocument(handle);
    api.pdfium.wasmExports.free(pointer);
  }
}
async function stripManagedForms(buffer) {
  const hasManaged = withDocument(doc => api.FPDF_GetFormType(doc) !== 0 && formTools.documentFields(doc).some(page => page.length), buffer);
  return hasManaged ? rewriteFormDocument(buffer) : buffer;
}
function pageOrigin(id) {
  if (!Number.isSafeInteger(id) || id < 0) return null;
  return id < sourceCount ? { source: 'base', index: id } : catalog.get(id);
}
function prepareImport(buffer) {
  pendingImport = null;
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8 || buffer.byteLength > MAX_BYTES)
    throw new Error('Il PDF di origine deve avere una dimensione massima di 64 MB.');
  const retainedBytes = retainedSourceBytes();
  if (retainedBytes + buffer.byteLength > MAX_SOURCE_BYTES)
    throw new Error('Le sorgenti mantenute in memoria, inclusa la cronologia, superano 128 MB. Salvare e riaprire il documento prima di inserire altri PDF.');
  const metadata = withDocument(handle => {
    const policy = protection(handle);
    if (policy.readOnly) throw new Error(`Impossibile importare questo PDF. ${policy.blockedReason}`);
    const pageCount = api.FPDF_GetPageCount(handle);
    if (pageCount < 1) throw new Error('Il PDF di origine non contiene pagine.');
    return { pageCount, formPages: formTools.documentFields(handle) };
  }, buffer);
  const token = crypto.randomUUID();
  pendingImport = { token, buffer, pageCount: metadata.pageCount, formPages: metadata.formPages };
  return { token, ...metadata };
}
function registerImport({ token, pageIndexes }) {
  if (!pendingImport || pendingImport.token !== token) throw new Error('Il PDF da inserire non è più disponibile.');
  if (!Array.isArray(pageIndexes) || !pageIndexes.length || pageIndexes.length > pendingImport.pageCount)
    throw new Error('Selezionare almeno una pagina da inserire.');
  for (let i = 0; i < pageIndexes.length; i++) {
    const index = pageIndexes[i];
    if (!Number.isInteger(index) || index < 0 || index >= pendingImport.pageCount || (i > 0 && index <= pageIndexes[i - 1]))
      throw new Error('Le pagine da importare devono essere valide, uniche e in ordine di documento.');
  }
  if (!Number.isSafeInteger(nextPageId + pageIndexes.length)) throw new Error('Numero di pagine troppo elevato.');
  const pages = pageIndexes.map(index => {
    const id = nextPageId++;
    catalog.set(id, { source: token, index });
    return { id, rotation: 0, formFields: pendingImport.formPages[index] };
  });
  imports.set(token, { buffer: pendingImport.buffer, pageCount: pendingImport.pageCount, formPages: pendingImport.formPages });
  pendingImport = null;
  return pages;
}
function retainedSourceBytes() {
  return [...imports.values(), ...overrides.values()].reduce((total, item) => total + item.buffer.byteLength, source.byteLength);
}
function originSource(pageId) {
  const origin = pageOrigin(pageId);
  if (!origin) throw new Error('Pagina non disponibile.');
  const buffer = origin.source === 'base' ? source : imports.get(origin.source)?.buffer;
  if (!buffer) throw new Error('Sorgente non disponibile.');
  return { buffer, index: origin.index };
}
function baselineSource(pageId, override) {
  if (!override) return originSource(pageId);
  const item = overrides.get(override);
  if (!item) throw new Error('Versione della pagina non disponibile.');
  return { buffer: item.buffer, index: 0 };
}
function pagePolicy(pageId) {
  const origin = originSource(pageId);
  const base = withDocument(handle => protection(handle));
  const imported = withDocument(handle => protection(handle), origin.buffer);
  return { canAnnotate: base.canAnnotate && imported.canAnnotate, canContent: base.canContent && imported.canContent,
    canFormDesign: base.canFormDesign && imported.canFormDesign, canFormFill: base.canFormFill && imported.canFormFill,
    canPrint: base.canPrint && imported.canPrint,
    canPrintHigh: base.canPrintHigh && imported.canPrintHigh };
}
function retainPages(payload) {
  const ids = Array.isArray(payload) ? payload : payload.ids;
  const overrideIds = new Set(payload.overrides ?? []);
  for (const token of overrides.keys()) if (!overrideIds.has(token)) overrides.delete(token);
  if (!Array.isArray(ids)) throw new Error('Cronologia delle pagine non valida.');
  const retained = new Set(ids);
  for (const id of catalog.keys()) if (!retained.has(id)) catalog.delete(id);
  const retainedSources = new Set([...catalog.values()].map(page => page.source));
  for (const token of imports.keys()) if (!retainedSources.has(token)) imports.delete(token);
  return {};
}
function protection(handle) {
  const signatures = api.FPDF_GetSignatureCount(handle);
  if (signatures < 0) throw new Error('Impossibile controllare le firme.');
  const permissions = api.FPDF_GetDocPermissions(handle) >>> 0;
  // Editing encrypted documents requires an explicit encryption-preserving save
  // workflow. This increment keeps them in consultation to avoid removing it.
  const encrypted = !!api.EPDF_IsEncrypted(handle);
  const reason = signatures ? 'Documento firmato: modifiche alle pagine e sovrascrittura disabilitate.' :
    encrypted ? 'Documento cifrato: disponibile in sola consultazione.' :
    !(permissions & 1024) ? 'Il documento non consente l’assemblaggio delle pagine.' : '';
  return { readOnly: !!reason, blockedReason: reason, signatures, permissions,
    canAnnotate: !reason && !!(permissions & 32), canContent: !reason && !!(permissions & 8),
    canFormDesign: !reason && !!(permissions & 8) && !!(permissions & 32),
    canFormFill: !reason && !!(permissions & (256 | 32)),
    canPrint: !!(permissions & 4), canPrintHigh: !!(permissions & 2048) };
}
function serialize(handle) {
  const writer = api.PDFiumExt_OpenFileWriter();
  if (!writer) throw new Error('Impossibile preparare il PDF modificato.');
  let pointer = 0;
  try {
    // Use the same writer protocol as the pinned EmbedPDF engine. The writer's
    // size and the subsequent viewer load validate the produced document.
    if (!api.FPDF_SaveAsCopy(handle, writer, 2)) throw new Error('Salvataggio PDF non riuscito.');
    const size = api.PDFiumExt_GetFileWriterSize(writer);
    if (!size || size > MAX_BYTES) throw new Error('Il risultato supera il limite di 64 MB o non è valido.');
    pointer = allocate(size);
    api.PDFiumExt_GetFileWriterData(writer, pointer, size);
    return api.pdfium.HEAPU8.slice(pointer, pointer + size).buffer;
  } finally {
    if (pointer) api.pdfium.wasmExports.free(pointer);
    api.PDFiumExt_CloseFileWriter(writer);
  }
}
function createBlank(options) {
  const { width, height } = paperSize(options);
  const doc = api.FPDF_CreateNewDocument();
  if (!doc) throw new Error('Impossibile creare il documento.');
  try {
    const page = api.FPDFPage_New(doc, 0, width, height);
    if (!page) throw new Error('Impossibile creare la pagina vuota.');
    try { if (!api.FPDFPage_GenerateContent(page)) throw new Error('Pagina vuota non valida.'); }
    finally { api.FPDF_ClosePage(page); }
    return serialize(doc);
  } finally { api.FPDF_CloseDocument(doc); }
}
async function rebuild(pages) {
  if (!Array.isArray(pages) || !pages.length)
    throw new Error('Il documento deve conservare almeno una pagina.');
  const ids = new Set();
  for (const page of pages) {
    if (!pageOrigin(page.id) || ids.has(page.id) ||
        !Number.isInteger(page.rotation) || page.rotation < 0 || page.rotation > 3)
      throw new Error('Elenco pagine non valido.');
    ids.add(page.id);
    const origin = pageOrigin(page.id);
    const initial = origin.source === 'base' ? sourceFormPages[origin.index] ?? [] : imports.get(origin.source)?.formPages?.[origin.index] ?? [];
    if (page.formFields && JSON.stringify(page.formFields) !== JSON.stringify(initial) && !pagePolicy(page.id).canFormDesign)
      throw new Error('La pagina non consente la modifica dei campi del modulo.');
  }
  const bytes = withDocument(handle => {
    const policy = protection(handle);
    if (policy.readOnly) throw new Error(policy.blockedReason);
    // Delete backwards so indices refer to the original document until removed.
    for (let i = sourceCount - 1; i >= 0; i--) if (!ids.has(i)) api.FPDFPage_Delete(handle, i);
    // Keep the original document catalog/metadata, then append imported pages.
    // The final permutation puts both original and imported pages in target order.
    const currentIds = [...ids].filter(id => id < sourceCount).sort((a, b) => a - b);
    const groups = new Map();
    for (const page of pages) {
      const origin = pageOrigin(page.id);
      if (origin.source === 'base') continue;
      if (!groups.has(origin.source)) groups.set(origin.source, []);
      groups.get(origin.source).push({ id: page.id, index: origin.index });
    }
    for (const [token, group] of groups) {
      const imported = imports.get(token);
      if (!imported) throw new Error('Sorgente di una pagina importata non disponibile.');
      withDocument(importHandle => {
        const importPolicy = protection(importHandle);
        if (importPolicy.readOnly) throw new Error(importPolicy.blockedReason);
        if (!importPolicy.canAnnotate && group.some(item => pages.find(page => page.id === item.id)?.highlightChanges?.length))
          throw new Error('La pagina importata non consente annotazioni.');
        const pointer = allocate(group.length * 4);
        try {
          api.pdfium.HEAP32.set(group.map(page => page.index), pointer / 4);
          if (!api.FPDF_ImportPagesByIndex(handle, importHandle, pointer, group.length, currentIds.length))
            throw new Error('Inserimento delle pagine non riuscito.');
        } finally { api.pdfium.wasmExports.free(pointer); }
      }, imported.buffer);
      for (const page of group) currentIds.push(page.id);
    }
    if (api.FPDF_GetPageCount(handle) !== pages.length) throw new Error('Il numero di pagine importate non corrisponde alla selezione.');
    const positions = new Map(currentIds.map((id, index) => [id, index]));
    const order = pages.map(page => positions.get(page.id));
    if (order.some((value, index) => value !== index)) {
      const pointer = allocate(order.length * 4);
      try {
        api.pdfium.HEAP32.set(order, pointer / 4);
        if (!api.FPDF_MovePages(handle, pointer, order.length, 0)) throw new Error('Spostamento pagine non riuscito.');
      } finally { api.pdfium.wasmExports.free(pointer); }
    }
    for (let index = 0; index < pages.length; index++) {
      if (pages[index].override) {
        const item = overrides.get(pages[index].override);
        if (!item) throw new Error('Versione della pagina non disponibile.');
        withDocument(replacement => {
          const pointer = allocate(4);
          try {
            api.pdfium.HEAP32[pointer / 4] = 0;
            if (!api.FPDF_ImportPagesByIndex(handle, replacement, pointer, 1, index)) throw new Error('Sostituzione pagina non riuscita.');
            api.FPDFPage_Delete(handle, index + 1);
          } finally { api.pdfium.wasmExports.free(pointer); }
        }, item.buffer);
      }
      const page = api.FPDF_LoadPage(handle, index);
      if (!page) throw new Error('Pagina non disponibile per la rotazione.');
      try {
        if (pages[index].highlightChanges?.length) {
          if (!policy.canAnnotate) throw new Error('Annotazioni non consentite.');
          highlightTools.apply(page, pages[index].highlightChanges);
        }
        if (pages[index].textChanges?.length) {
          if (!policy.canAnnotate) throw new Error('Il documento non consente l’aggiunta o la modifica di annotazioni.');
          textTools.apply(page, pages[index].textChanges);
        }
        if (policy.canAnnotate)
          textTools.repairAppearances(page, new Set((pages[index].textChanges ?? []).map(change => change.id)));
        const rotation = api.FPDFPage_GetRotation(page);
        if (rotation < 0) throw new Error('Rotazione della pagina non leggibile.');
        api.FPDFPage_SetRotation(page, (rotation + pages[index].rotation) % 4);
      } finally { api.FPDF_ClosePage(page); }
    }
    // Export redacted revisions through a fresh catalog: no attachments, metadata
    // or obsolete source objects are copied into the result.
    if (pages.some(page => overrides.get(page.override)?.redacted)) {
      const clean = api.FPDF_CreateNewDocument();
      if (!clean) throw new Error('Impossibile creare il PDF bonificato.');
      const pointer = allocate(pages.length * 4);
      try {
        api.pdfium.HEAP32.set(pages.map((_, index) => index), pointer / 4);
        if (!api.FPDF_ImportPagesByIndex(clean, handle, pointer, pages.length, 0)) throw new Error('Bonifica PDF non riuscita.');
        return serialize(clean);
      } finally { api.pdfium.wasmExports.free(pointer); api.FPDF_CloseDocument(clean); }
    }
    return serialize(handle);
  });
  const fields = pages.map(page => {
    const origin = pageOrigin(page.id);
    return page.formFields ?? (origin.source === 'base' ? sourceFormPages[origin.index] ?? [] : imports.get(origin.source)?.formPages?.[origin.index] ?? []);
  });
  fields.flat().forEach(formTools.validate);
  return fields.some(p => p.length) ? rewriteFormDocument(bytes, fields) : bytes;
}

function withPage(buffer, index, action) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8 || buffer.byteLength > MAX_BYTES)
    throw new Error('Dimensione documento non valida (massimo 64 MB).');
  return withDocument(handle => {
    if (!Number.isInteger(index) || index < 0 || index >= api.FPDF_GetPageCount(handle)) throw new Error('Pagina non valida.');
    const page = api.FPDF_LoadPage(handle, index);
    if (!page) throw new Error('Pagina non leggibile.');
    try { return action(page, handle); }
    finally { api.FPDF_ClosePage(page); }
  }, buffer);
}
function textRequest(type, { buffer, pageIndex, pageId, pageOverride, input, remove = false, omitId }) {
  if (type === 'text-context') return withPage(buffer, pageIndex, (page, document) => {
    const geometry = textTools.geometry(page), notes = textTools.notes(page);
    textTools.repairAppearances(page);
    // Only the temporary rendering copy is changed. This lets an inline editor
    // replace the selected appearance without painting its text twice.
    if (omitId && notes.some(note => note.id === omitId)) textTools.apply(page, [{ id: omitId, value: null }]);
    return { ...geometry, notes, image: textTools.render(page, 1400, 2, document) };
  });
  const policy = withDocument(handle => protection(handle));
  if (!policy.canAnnotate) throw new Error('Il documento non consente l’aggiunta o la modifica di annotazioni.');
  if (!pagePolicy(pageId).canAnnotate) throw new Error('La pagina non consente annotazioni.');
  const baselineSourceData = baselineSource(pageId, pageOverride);
  const baseline = withPage(baselineSourceData.buffer, baselineSourceData.index, page => {
    const note = textTools.notes(page).find(note => note.id === input.id);
    if (!note) return null;
    const { position, ...value } = note;
    return value;
  });
  const value = remove ? null : withPage(buffer, pageIndex, page => textTools.prepare(page, input));
  return { baseline, value };
}

function extract({ buffer, pageIndexes }) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8 || buffer.byteLength > MAX_BYTES)
    throw new Error('Dimensione documento non valida (massimo 64 MB).');
  return withDocument(handle => {
    const policy = protection(handle);
    if (policy.readOnly) throw new Error(policy.blockedReason);
    const count = api.FPDF_GetPageCount(handle);
    if (!Array.isArray(pageIndexes) || !pageIndexes.length || pageIndexes.length > count)
      throw new Error('Selezionare almeno una pagina da estrarre.');
    for (let i = 0; i < pageIndexes.length; i++) {
      const index = pageIndexes[i];
      if (!Number.isInteger(index) || index < 0 || index >= count || (i > 0 && index <= pageIndexes[i - 1]))
        throw new Error('Le pagine da estrarre devono essere valide, uniche e in ordine di documento.');
    }
    // Import into a new document instead of retaining the source catalog with
    // pages removed. The current viewer and the editing sources are untouched.
    const destination = api.FPDF_CreateNewDocument();
    if (!destination) throw new Error('Impossibile creare il PDF delle pagine estratte.');
    let pointer = 0;
    try {
      pointer = allocate(pageIndexes.length * 4);
      api.pdfium.HEAP32.set(pageIndexes, pointer / 4);
      if (!api.FPDF_ImportPagesByIndex(destination, handle, pointer, pageIndexes.length, 0) ||
          api.FPDF_GetPageCount(destination) !== pageIndexes.length)
        throw new Error('Estrazione delle pagine non riuscita.');
      const result = serialize(destination);
      // Validate the saved document before returning bytes to the host.
      withDocument(saved => {
        if (api.FPDF_GetPageCount(saved) !== pageIndexes.length)
          throw new Error('Il PDF estratto non contiene il numero di pagine previsto.');
      }, result);
      return result;
    } finally {
      if (pointer) api.pdfium.wasmExports.free(pointer);
      api.FPDF_CloseDocument(destination);
    }
  }, buffer);
}

function workbenchContext({ buffer, pageIndex, pageId }) {
  const policy = pagePolicy(pageId);
  return withPage(buffer, pageIndex, (page, document) => ({ ...textTools.geometry(page), ...policy,
    image: textTools.render(page, 1400, 2, document),
    objects: policy.canContent ? workbenchTools.objects(page, true) : [],
    annotations: policy.canAnnotate ? workbenchTools.annotations(page) : [] }));
}
function workbenchChange({ buffer, pageIndex, pageId, pageOverride, input }) {
  const policy = pagePolicy(pageId);
  const content = input.operation.startsWith('object-') || input.operation === 'redact';
  if (content ? !policy.canContent : !policy.canAnnotate) throw new Error('Operazione non consentita dal documento.');
  const single = api.FPDF_CreateNewDocument();
  if (!single) throw new Error('Impossibile creare la pagina.');
  let sanitized = 0;
  try {
    withDocument(handle => {
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= api.FPDF_GetPageCount(handle)) throw new Error('Pagina non valida.');
      const p = allocate(4);
      try {
        api.pdfium.HEAP32[p / 4] = pageIndex;
        if (!api.FPDF_ImportPagesByIndex(single, handle, p, 1, 0)) throw new Error('Pagina non importabile.');
      } finally { api.pdfium.wasmExports.free(p); }
    }, buffer);
    if (input.operation === 'redact') {
      sanitized = withDocument(handle => {
        const originalPage = api.FPDF_LoadPage(handle, pageIndex);
        if (!originalPage) throw new Error('Pagina non leggibile.');
        try { return workbenchTools.rasterizeRedacted(handle, originalPage, input.region); }
        finally { api.FPDF_ClosePage(originalPage); }
      }, buffer);
    }
    const page = api.FPDF_LoadPage(single, 0);
    if (!page) throw new Error('Pagina non leggibile.');
    try {
      if (input.operation === 'redact') { /* Sanitized from the complete current document, including form appearances. */ }
      else if (input.operation === 'stamp') stampTools.apply(single, page, input);
      else if (input.operation.startsWith('object-')) workbenchTools.mutateObject(single, page, input);
      else workbenchTools.mutateAnnotation(page, input);
    } finally { api.FPDF_ClosePage(page); }
    const bytes = serialize(sanitized || single);
    if (retainedSourceBytes() + bytes.byteLength > MAX_SOURCE_BYTES) throw new Error('Cronologia e sorgenti oltre 128 MB: salvare e riaprire prima di continuare.');
    const override = crypto.randomUUID();
    const redacted = !!sanitized || !!overrides.get(pageOverride)?.redacted;
    overrides.set(override, { buffer: bytes, redacted });
    return { override, redacted };
  } finally { if (sanitized) api.FPDF_CloseDocument(sanitized); api.FPDF_CloseDocument(single); }
}

self.onmessage = async ({ data: { id, type, payload } }) => {
  try {
    await initialize();
    let result;
    if (type === 'security') result = transformPdfSecurity(api, payload.buffer, payload.password, payload.encrypt);
    else if (type === 'create-blank') result = createBlank(payload);
    else if (type === 'load') {
      if (!(payload instanceof ArrayBuffer) || payload.byteLength < 8 || payload.byteLength > MAX_BYTES)
        throw new Error('Dimensione documento non valida (massimo 64 MB).');
      source = payload;
      imports.clear(); catalog.clear(); overrides.clear(); pendingImport = null;
      result = withDocument(handle => {
        sourceCount = api.FPDF_GetPageCount(handle);
        nextPageId = sourceCount;
        if (sourceCount < 1) throw new Error('Il PDF non contiene pagine.');
        const policy = protection(handle);
        let textRepairNeeded = false;
        if (policy.canAnnotate) {
          for (let i = 0; i < sourceCount && !textRepairNeeded; i++) {
            const page = api.FPDF_LoadPage(handle, i);
            if (!page) throw new Error('Pagina non leggibile.');
            try { textRepairNeeded = textTools.needsRepair(page); }
            finally { api.FPDF_ClosePage(page); }
          }
        }
        const allForms = formTools.documentFields(handle, true);
        sourceFormPages = allForms.map(page => page.filter(f => f.managed));
        const externalFormNames = allForms.flat().filter(f => !f.managed).map(f => f.name);
        const formRepairNeeded = policy.canFormDesign && sourceFormPages.flat().some(f => f.kind === 'button' && f.emailActionVersion !== FORM_EMAIL_ACTION_VERSION);
        return { ...policy, pageCount: sourceCount, textRepairNeeded, formRepairNeeded, formPages: sourceFormPages, externalFormNames };
      });
      if (!result.readOnly && sourceFormPages.some(p => p.length)) source = await rewriteFormDocument(source);
    } else if (type === 'rebuild' && source) result = await rebuild(payload);
    else if (['text-context', 'text-change'].includes(type) && source) result = textRequest(type, payload);
    else if (type === 'form-context' && source) result = withPage(payload.buffer, payload.pageIndex, (page, document) => ({
      ...textTools.geometry(page), fields: formTools.list(document, page), image: textTools.render(page, 1800, 2, document) }));
    else if (type === 'form-prepare' && source) {
      const policy = pagePolicy(payload.pageId);
      if (!policy.canFormDesign) throw new Error('La progettazione dei moduli non è consentita.');
      result = withPage(payload.buffer, payload.pageIndex, page => formTools.prepare(page, payload.input));
    }
    else if (type === 'workbench-context' && source) result = workbenchContext(payload);
    else if (type === 'workbench-change' && source) {
      const buffer = payload.input.operation === 'redact' ? payload.buffer : await stripManagedForms(payload.buffer);
      result = workbenchChange({ ...payload, buffer });
    }
    else if (type === 'workbench-preview' && source) {
      if (!pagePolicy(payload.pageId).canContent || !['object-text', 'object-transform'].includes(payload.input.operation))
        throw new Error('Anteprima non consentita.');
      result = withPage(payload.buffer, payload.pageIndex, (page, document) => {
        workbenchTools.mutateObject(document, page, payload.input);
        const scale = Number.isFinite(payload.scale) ? Math.max(1, Math.min(4, payload.scale)) : 2;
        return { image: textTools.render(page, 2800, scale, document),
          position: workbenchTools.objects(page, false).find(item => item.index === payload.input.index)?.position };
      });
    }
    else if (type === 'output-page' && source) {
      const policy = pagePolicy(payload.pageId);
      if (payload.kind !== 'print' || !policy.canPrint) throw new Error('Esportazione non consentita.');
      result = withPage(payload.buffer, payload.pageIndex, (page, document) => ({ ...textTools.geometry(page), image: textTools.render(page, !policy.canPrintHigh ? 1400 : 2800, !policy.canPrintHigh ? 1 : 2, document) }));
    }
    else if (type === 'highlight-list'  && source) result = withPage(payload.buffer, payload.pageIndex, page => highlightTools.list(page));
    else if (type === 'highlight-change' && source) {
      const policy = withDocument(handle => protection(handle));
      if (!policy.canAnnotate) throw new Error('Annotazioni non consentite.');
      if (!pagePolicy(payload.pageId).canAnnotate) throw new Error('La pagina non consente annotazioni.');
      const original = baselineSource(payload.pageId, payload.pageOverride);
      const exists = withPage(original.buffer, original.index, page => highlightTools.list(page).some(h => h.id === payload.input.id));
      const current = withPage(payload.buffer, payload.pageIndex, page => {
        if (payload.remove) {
          if (!highlightTools.list(page).some(h => h.id === payload.input.id)) throw new Error('Evidenziazione non disponibile.');
          return null;
        }
        return highlightTools.prepare(page, payload.input);
      });
      result = { value: current, exists };
    }
    else if (type === 'extract' && source) {
      const all = withDocument(doc => formTools.documentFields(doc), payload.buffer);
      const buffer = await stripManagedForms(payload.buffer);
      const fields = payload.pageIndexes.map(i => all[i]);
      const bytes = extract({ ...payload, buffer });
      result = fields.some(p => p.length) ? await rewriteFormDocument(bytes, fields) : bytes;
    }
    else if (type === 'prepare-import' && source) { result = prepareImport(payload); pendingImport.buffer = await stripManagedForms(pendingImport.buffer); }
    else if (type === 'register-import' && source) result = registerImport(payload);
    else if (type === 'retain-pages' && source) result = retainPages(payload);
    else if (type === 'cancel-import' && source) { pendingImport = null; result = {}; }
    else throw new Error('Operazione sulle pagine non disponibile.');
    self.postMessage({ id, ok: true, result }, result instanceof ArrayBuffer ? [result] : []);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message ?? String(error) });
  }
};

