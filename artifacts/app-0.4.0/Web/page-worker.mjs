import { init } from './vendor/pdfium-api.js';

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_SOURCE_BYTES = 128 * 1024 * 1024;
let api, source, sourceCount, nextPageId, pendingImport;
const imports = new Map();
const catalog = new Map();
async function initialize() {
  if (api) return;
  const response = await fetch(new URL('./vendor/pdfium.wasm', import.meta.url));
  if (!response.ok) throw new Error('Motore di modifica PDF non disponibile.');
  api = await init({ wasmBinary: await response.arrayBuffer() });
  api.PDFiumExt_Init();
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
function pageOrigin(id) {
  if (!Number.isSafeInteger(id) || id < 0) return null;
  return id < sourceCount ? { source: 'base', index: id } : catalog.get(id);
}
function prepareImport(buffer) {
  pendingImport = null;
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8 || buffer.byteLength > MAX_BYTES)
    throw new Error('Il PDF di origine deve avere una dimensione massima di 64 MB.');
  const retainedBytes = [...imports.values()].reduce((total, item) => total + item.buffer.byteLength, source.byteLength);
  if (retainedBytes + buffer.byteLength > MAX_SOURCE_BYTES)
    throw new Error('Le sorgenti mantenute in memoria, inclusa la cronologia, superano 128 MB. Salvare e riaprire il documento prima di inserire altri PDF.');
  const metadata = withDocument(handle => {
    const policy = protection(handle);
    if (policy.readOnly) throw new Error(`Impossibile importare questo PDF. ${policy.blockedReason}`);
    const pageCount = api.FPDF_GetPageCount(handle);
    if (pageCount < 1) throw new Error('Il PDF di origine non contiene pagine.');
    return { pageCount };
  }, buffer);
  const token = crypto.randomUUID();
  pendingImport = { token, buffer, pageCount: metadata.pageCount };
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
    return { id, rotation: 0 };
  });
  imports.set(token, { buffer: pendingImport.buffer, pageCount: pendingImport.pageCount });
  pendingImport = null;
  return pages;
}
function retainPages(ids) {
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
  return { readOnly: !!reason, blockedReason: reason, signatures, permissions };
}
function serialize(handle) {
  const writer = api.PDFiumExt_OpenFileWriter();
  if (!writer) throw new Error('Impossibile preparare il PDF modificato.');
  let pointer = 0;
  try {
    // Use the same writer protocol as the pinned EmbedPDF engine. The writer's
    // size and the subsequent viewer load validate the produced document.
    api.PDFiumExt_SaveAsCopy(handle, writer);
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
function rebuild(pages) {
  if (!Array.isArray(pages) || !pages.length)
    throw new Error('Il documento deve conservare almeno una pagina.');
  const ids = new Set();
  for (const page of pages) {
    if (!pageOrigin(page.id) || ids.has(page.id) ||
        !Number.isInteger(page.rotation) || page.rotation < 0 || page.rotation > 3)
      throw new Error('Elenco pagine non valido.');
    ids.add(page.id);
  }
  return withDocument(handle => {
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
      if (!pages[index].rotation) continue;
      const page = api.FPDF_LoadPage(handle, index);
      if (!page) throw new Error('Pagina non disponibile per la rotazione.');
      try {
        const rotation = api.FPDFPage_GetRotation(page);
        if (rotation < 0) throw new Error('Rotazione della pagina non leggibile.');
        api.FPDFPage_SetRotation(page, (rotation + pages[index].rotation) % 4);
      } finally { api.FPDF_ClosePage(page); }
    }
    return serialize(handle);
  });
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

self.onmessage = async ({ data: { id, type, payload } }) => {
  try {
    await initialize();
    let result;
    if (type === 'load') {
      if (!(payload instanceof ArrayBuffer) || payload.byteLength < 8 || payload.byteLength > MAX_BYTES)
        throw new Error('Dimensione documento non valida (massimo 64 MB).');
      source = payload;
      imports.clear(); catalog.clear(); pendingImport = null;
      result = withDocument(handle => {
        sourceCount = api.FPDF_GetPageCount(handle);
        nextPageId = sourceCount;
        if (sourceCount < 1) throw new Error('Il PDF non contiene pagine.');
        return { ...protection(handle), pageCount: sourceCount };
      });
    } else if (type === 'rebuild' && source) result = rebuild(payload);
    else if (type === 'extract' && source) result = extract(payload);
    else if (type === 'prepare-import' && source) result = prepareImport(payload);
    else if (type === 'register-import' && source) result = registerImport(payload);
    else if (type === 'retain-pages' && source) result = retainPages(payload);
    else if (type === 'cancel-import' && source) { pendingImport = null; result = {}; }
    else throw new Error('Operazione sulle pagine non disponibile.');
    self.postMessage({ id, ok: true, result }, result instanceof ArrayBuffer ? [result] : []);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message ?? String(error) });
  }
};
