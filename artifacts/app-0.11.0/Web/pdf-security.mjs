// Operates on a temporary document. The editable session stays in memory;
// every export is encrypted again when a password is configured.
export function transformPdfSecurity(api, buffer, password = '', encrypt = false) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8 || buffer.byteLength > 64 * 1024 * 1024) throw new Error('Dimensione PDF non valida.');
  if (typeof password !== 'string' || new TextEncoder().encode(password).length > 127 || password.includes('\0') || (encrypt && !password)) throw new Error('Password: da 1 a 127 byte, senza caratteri nulli.');
  const alloc = n => { const p = api.pdfium.wasmExports.malloc(n); if (!p) throw new Error('Memoria insufficiente.'); return p; };
  const pointer = alloc(buffer.byteLength); let doc = 0, writer = 0, output = 0;
  try {
    api.pdfium.HEAPU8.set(new Uint8Array(buffer), pointer);
    doc = api.FPDF_LoadMemDocument(pointer, buffer.byteLength, encrypt ? '' : password);
    if (!doc) throw new Error(api.FPDF_GetLastError() === 4 ? '[PASSWORD] Password richiesta o errata.' : 'PDF non leggibile.');
    const encrypted = !!api.EPDF_IsEncrypted(doc);
    if (!encrypt && !encrypted) return { buffer, protected: false };
    if (!encrypt && !password) return { buffer, protected: false }; // Retain owner-only protection and consultation policy.
    if (api.FPDF_GetSignatureCount(doc) !== 0) throw new Error('La protezione di documenti firmati non è modificabile.');
    if (encrypt) {
      if (!api.EPDF_SetEncryption(doc, password, password, -4)) throw new Error('Impossibile proteggere il PDF.');
    } else {
      if (!api.EPDF_IsOwnerUnlocked(doc)) throw new Error('[PASSWORD] Per aprire questo PDF serve la password proprietario.');
      if (!api.EPDF_RemoveEncryption(doc)) throw new Error('Impossibile aprire il PDF protetto.');
    }
    writer = api.PDFiumExt_OpenFileWriter();
    if (!writer || !api.FPDF_SaveAsCopy(doc, writer, 2)) throw new Error('Salvataggio del PDF protetto non riuscito.');
    const n = api.PDFiumExt_GetFileWriterSize(writer);
    if (!n || n > 64 * 1024 * 1024) throw new Error('Il risultato supera 64 MB.');
    output = alloc(n); api.PDFiumExt_GetFileWriterData(writer, output, n);
    return { buffer: api.pdfium.HEAPU8.slice(output, output + n).buffer, protected: encrypt || encrypted };
  } finally {
    if (output) api.pdfium.wasmExports.free(output);
    if (writer) api.PDFiumExt_CloseFileWriter(writer);
    if (doc) api.FPDF_CloseDocument(doc);
    api.pdfium.wasmExports.free(pointer);
  }
}
