// Keep the current document when a replacement fails to parse or requires a password.
export function createDocumentSession(manager, onOpened) {
  let currentId = null;
  return {
    get currentId() { return currentId; },
    async openBuffer(buffer, name) {
      if (typeof name !== 'string' || !(buffer instanceof ArrayBuffer) || buffer.byteLength > 64 * 1024 * 1024)
        throw new Error('Dati documento non validi (massimo 64 MB).');
      const previous = currentId;
      const id = crypto.randomUUID();
      try {
        // EmbedPDF may transfer this buffer. Preserve the editor's byte arrays.
        const response = await manager.openDocumentBuffer({ documentId: id, name, buffer: buffer.slice(0), autoActivate: false }).toPromise();
        const document = await response.task.toPromise();
        currentId = id;
        manager.setActiveDocument(id);
        await onOpened?.(id, document);
        // Once activated successfully, failure to release an old handle must not
        // report a failed open while leaving the new document on screen.
        if (previous) await manager.closeDocument(previous).toPromise().catch(() => {});
        return { documentId: id, pageCount: document.pages.length };
      } catch (error) {
        currentId = previous;
        // The manager creates a loading/error state even when parsing fails.
        await manager.closeDocument(id).toPromise().catch(() => {});
        if (previous) manager.setActiveDocument(previous);
        throw new Error(error?.message ?? 'Impossibile aprire il PDF (corrotto o protetto da password).');
      }
    },
    async close() {
      if (currentId) await manager.closeDocument(currentId).toPromise();
      currentId = null;
      return {};
    }
  };
}
