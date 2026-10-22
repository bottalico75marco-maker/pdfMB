export const MAX_BYTES = 64 * 1024 * 1024;
export function decodePdf(base64) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_BYTES / 3) * 4)
    throw new Error('Il PDF supera il limite di 64 MB.');
  const binary = atob(base64);
  if (binary.length < 8 || binary.length > MAX_BYTES) throw new Error('Dimensione PDF non valida.');
  return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
}
export function encodePdf(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  for (let start = 0; start < bytes.length; start += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(start, start + 32768)));
  return btoa(chunks.join(''));
}

class EditingWorker {
  constructor() {
    this.worker = new Worker(new URL('./page-worker.mjs', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.alive = true;
    this.worker.onmessage = ({ data }) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(data.id);
      if (data.ok) pending.resolve(data.result);
      else pending.reject(new Error(data.error));
    };
    this.worker.onerror = event => { event.preventDefault(); this.dispose('Il motore di modifica si è arrestato.'); };
    this.worker.onmessageerror = () => this.dispose('Risposta del motore di modifica non leggibile.');
  }
  request(type, payload, transfer = []) {
    if (!this.alive) return Promise.reject(new Error('Motore di modifica non disponibile. Riaprire il documento.'));
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => this.dispose('Tempo massimo di elaborazione superato. Riaprire il documento.'), 45000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ id, type, payload }, transfer); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  dispose(message = 'Documento chiuso.') {
    this.alive = false;
    this.worker.terminate();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.pending.clear();
  }
}
export async function createBlankPdf(options) {
  const worker = new EditingWorker();
  try { return await worker.request('create-blank', options); }
  finally { worker.dispose(); }
}
export async function openProtectedPdf(buffer, password = '') {
  const worker = new EditingWorker();
  const copy = buffer.slice(0);
  try { return await worker.request('security', { buffer: copy, password, encrypt: false }, [copy]); }
  finally { worker.dispose(); }
}

const key = pages => JSON.stringify(pages.map(page => [page.id, page.rotation, page.textChanges ?? [], page.highlightChanges ?? [], page.override ?? null, page.formFields ?? []]));
// Text records are immutable; snapshots share them and only copy page/array containers.
const copyPages = pages => pages.map(page => ({ ...page, ...(page.textChanges ? { textChanges: [...page.textChanges] } : {}), ...(page.highlightChanges ? { highlightChanges: [...page.highlightChanges] } : {}) }));

export class PageEditor {
  constructor(name, replaceView, currentPage) {
    this.name = name;
    this.replaceView = replaceView;
    this.currentPage = currentPage;
    this.token = crypto.randomUUID();
    this.revision = 0;
    this.past = [];
    this.future = [];
    this.selection = new Set();
    this.anchor = null;
  }
  async initialize(source) {
    this.source = source;
    this.bytes = source;
    this.policy = { readOnly: true, blockedReason: 'Controlli di firma e permessi non disponibili: sola consultazione.' };
    try {
      this.worker = new EditingWorker();
      const workerSource = source.slice(0);
      this.policy = await this.worker.request('load', workerSource, [workerSource]);
      this.legacyTextSource = this.textRepairPending = !!this.policy.textRepairNeeded;
      this.formRepairPending = !!this.policy.formRepairNeeded;
    } catch { this.worker?.dispose(); }
  }
  finishOpen(pageCount) {
    this.pages = Array.from({ length: pageCount }, (_, id) => ({ id, rotation: 0, formFields: this.policy.formPages?.[id] ?? [] }));
    this.initialKey = this.savedKey = key(this.pages);
    this.selection = new Set([0]);
    this.anchor = 0;
  }
  get dirty() { return (this.password ?? '') !== (this.savedPassword ?? '') || !!this.unsavedDocument || !!this.textRepairPending || !!this.formRepairPending || key(this.pages) !== this.savedKey; }
  get canEdit() { return !this.policy.readOnly && !!this.worker?.alive; }
  get canText() { return this.canEdit && !!this.policy.canAnnotate; }
  get canFormDesign() { return this.canEdit && !!this.policy.canFormDesign; }
  get blockedReason() {
    return this.policy.blockedReason || (!this.worker?.alive ? 'Motore di modifica non disponibile: salvare il lavoro e riaprire il documento.' : '');
  }
  state() {
    return { token: this.token, revision: this.revision, dirty: this.dirty, readOnly: this.policy.readOnly,
      canFormDesign: this.canFormDesign, canFormFill: this.canEdit && !!this.policy.canFormFill,
      canEdit: this.canEdit, canText: this.canText, canContent: this.canEdit && !!this.policy.canContent,
      canPrint: !!this.policy.canPrint, blockedReason: this.blockedReason,
      canUndo: this.canEdit && this.past.length > 0, canRedo: this.canEdit && this.future.length > 0 };
  }
  snapshot() {
    const index = Math.max(0, this.currentPage() - 1);
    return { pages: copyPages(this.pages), selection: [...this.selection], anchor: this.anchor,
      focus: this.pages[index]?.id, pageIndex: index };
  }
  select(index, { ctrlKey, metaKey, shiftKey }) {
    const id = this.pages[index].id;
    if (shiftKey && this.anchor !== null) {
      const anchorIndex = this.pages.findIndex(page => page.id === this.anchor);
      if (!ctrlKey && !metaKey) this.selection.clear();
      for (let i = Math.min(anchorIndex < 0 ? index : anchorIndex, index); i <= Math.max(anchorIndex, index); i++)
        this.selection.add(this.pages[i].id);
    } else if (ctrlKey || metaKey) {
      if (this.selection.has(id)) this.selection.delete(id); else this.selection.add(id);
      this.anchor = id;
    } else { this.selection = new Set([id]); this.anchor = id; }
  }
  async apply(target) {
    if (!this.canEdit) throw new Error(this.blockedReason);
    const bytes = key(target.pages) === this.initialKey && !this.legacyTextSource ? this.source : await this.worker.request('rebuild', target.pages);
    if (bytes.byteLength > MAX_BYTES) throw new Error('Il risultato supera il limite di 64 MB.');
    let index = target.pages.findIndex(page => page.id === target.focus);
    if (index < 0) index = Math.min(target.pageIndex, target.pages.length - 1);
    // A failed replacement leaves both the old viewer and model unchanged.
    await this.replaceView(bytes, this.name, index + 1);
    this.bytes = bytes;
    this.pages = copyPages(target.pages);
    this.selection = new Set(target.selection.filter(id => this.pages.some(page => page.id === id)));
    if (!this.selection.size) this.selection.add(this.pages[index].id);
    this.anchor = this.selection.has(target.anchor) ? target.anchor : [...this.selection][0];
    this.revision++;
  }
  async change({ operation, position }) {
    if (!this.canEdit) throw new Error(this.blockedReason);
    if (!this.selection.size) throw new Error('Selezionare almeno una pagina.');
    const before = this.snapshot();
    const target = this.snapshot();
    if (operation === 'rotate-right' || operation === 'rotate-left') {
      const delta = operation === 'rotate-right' ? 1 : 3;
      target.pages.forEach(page => { if (this.selection.has(page.id)) page.rotation = (page.rotation + delta) % 4; });
    } else if (operation === 'delete') {
      if (this.selection.size === this.pages.length) throw new Error('Non è possibile eliminare tutte le pagine.');
      target.pages = target.pages.filter(page => !this.selection.has(page.id));
      target.selection = [];
    } else if (operation === 'move') {
      const selected = target.pages.filter(page => this.selection.has(page.id));
      const remaining = target.pages.filter(page => !this.selection.has(page.id));
      if (!Number.isInteger(position) || position < 1 || position > remaining.length + 1)
        throw new Error(`Indicare una posizione da 1 a ${remaining.length + 1}.`);
      target.pages = [...remaining.slice(0, position - 1), ...selected, ...remaining.slice(position - 1)];
      target.focus = selected[0].id;
    } else throw new Error('Operazione non supportata.');
    if (key(before.pages) === key(target.pages)) return;
    await this.apply(target);
    this.past.push(before);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    await this.releaseUnusedSources();
  }
  async prepareInsert({ name, base64 }) {
    if (!this.canEdit) throw new Error(this.blockedReason);
    if (typeof name !== 'string') throw new Error('Nome del PDF di origine non valido.');
    await this.cancelInsert();
    const buffer = decodePdf(base64);
    const metadata = await this.worker.request('prepare-import', buffer, [buffer]);
    this.pendingImport = { ...metadata, name };
    return { documentToken: this.token, importToken: metadata.token, sourcePages: metadata.pageCount,
      destinationPages: this.pages.length, position: Math.max(1, Math.min(this.currentPage(), this.pages.length + 1)) };
  }
  async insertBlank({ format, landscape, position }) {
    if (!this.canEdit) throw new Error(this.blockedReason);
    if (!Number.isInteger(position) || position < 1 || position > this.pages.length + 1)
      throw new Error(`Indicare una posizione da 1 a ${this.pages.length + 1}.`);
    await this.cancelInsert();
    const buffer = await this.worker.request('create-blank', { format, landscape });
    const metadata = await this.worker.request('prepare-import', buffer, [buffer]);
    this.pendingImport = { ...metadata, name: 'Pagina vuota' };
    try { await this.insert({ importToken: metadata.token, pageIndexes: [0], position }); }
    finally { await this.cancelInsert(); }
  }
  async cancelInsert(importToken) {
    if (importToken && this.pendingImport?.token !== importToken) return;
    if (this.pendingImport && this.worker?.alive) await this.worker.request('cancel-import');
    this.pendingImport = null;
  }
  async insert({ importToken, pageIndexes, position }) {
    if (!this.canEdit) throw new Error(this.blockedReason);
    if (!this.pendingImport || importToken !== this.pendingImport.token)
      throw new Error('Il PDF da inserire non è più disponibile.');
    if (!Number.isInteger(position) || position < 1 || position > this.pages.length + 1)
      throw new Error(`Indicare una posizione da 1 a ${this.pages.length + 1}.`);
    const before = this.snapshot();
    const target = this.snapshot();
    const imported = await this.worker.request('register-import', { token: importToken, pageIndexes });
    const formNames = new Set([...(this.policy.externalFormNames ?? []), ...this.pages.flatMap(p => p.formFields ?? []).map(f => f.name)]);
    for (const page of imported) page.formFields = (page.formFields ?? []).map(f => {
      let name = f.name, suffix = 2;
      while (formNames.has(name)) name = `${f.name.slice(0, 70)}_${suffix++}`;
      formNames.add(name);
      return { ...f, id: 'pdfmb-f-' + crypto.randomUUID(), name };
    });
    this.pendingImport = null;
    this.hasImportedSources = true;
    try {
      // Avoid spreading a potentially large selection into a function call.
      target.pages = [...target.pages.slice(0, position - 1), ...imported, ...target.pages.slice(position - 1)];
      target.selection = imported.map(page => page.id);
      target.anchor = target.focus = imported[0].id;
      await this.apply(target);
      this.past.push(before);
      if (this.past.length > 100) this.past.shift();
      this.future = [];
    } finally { await this.releaseUnusedSources(); }
  }
  async releaseUnusedSources() {
    if ((!this.hasImportedSources && !this.hasWorkSources) || !this.worker?.alive) return;
    const ids = new Set(this.pages.map(page => page.id));
    for (const snapshot of [...this.past, ...this.future]) for (const page of snapshot.pages) ids.add(page.id);
    // A cleanup failure must not turn a committed edit into a reported failure.
    const overrideIds = new Set();
    for (const snapshot of [{ pages: this.pages }, ...this.past, ...this.future])
      for (const page of snapshot.pages) if (page.override) overrideIds.add(page.override);
    await this.worker.request('retain-pages', { ids: [...ids], overrides: [...overrideIds] }).catch(() => {});
  }
  async undo() {
    if (!this.past.length) return;
    const current = this.snapshot();
    await this.apply(this.past.at(-1));
    this.past.pop(); this.future.push(current);
    await this.releaseUnusedSources();
  }
  async redo() {
    if (!this.future.length) return;
    const current = this.snapshot();
    await this.apply(this.future.at(-1));
    this.future.pop(); this.past.push(current);
    await this.releaseUnusedSources();
  }
  async extract() {
    if (!this.canEdit) throw new Error(this.blockedReason);
    const pageIndexes = [];
    this.pages.forEach((page, index) => { if (this.selection.has(page.id)) pageIndexes.push(index); });
    if (!pageIndexes.length) throw new Error('Selezionare almeno una pagina da estrarre.');
    // Use the committed result so imported pages and permanent rotations are
    // included. Transfer a copy: the open document keeps its own byte buffer.
    const buffer = this.bytes.slice(0);
    let extracted = await this.worker.request('extract', { buffer, pageIndexes }, [buffer]);
    if (this.password) extracted = (await this.worker.request('security', { buffer: extracted, password: this.password, encrypt: true }, [extracted])).buffer;
    return { token: this.token, revision: this.revision, pageCount: pageIndexes.length, base64: encodePdf(extracted) };
  }
  async textContext(pageIndex, omitId) {
    if (!this.canText) throw new Error('Il documento non consente l’aggiunta o la modifica di annotazioni.');
    const buffer = this.bytes.slice(0);
    return this.worker.request('text-context', { buffer, pageIndex, omitId }, [buffer]);
  }
  async changeText({ pageIndex, token, revision, input, remove = false }) {
    if (!this.canText) throw new Error('Il documento non consente l’aggiunta o la modifica di annotazioni.');
    if (token !== this.token || revision !== this.revision || !this.pages[pageIndex])
      throw new Error('Il documento è cambiato. Riaprire l’editor del testo.');
    const before = this.snapshot(), target = this.snapshot(), page = target.pages[pageIndex];
    const buffer = this.bytes.slice(0);
    const { baseline, value } = await this.worker.request('text-change', { buffer, pageIndex, pageId: page.id, pageOverride: page.override, input, remove }, [buffer]);
    page.textChanges = (page.textChanges ?? []).filter(change => change.id !== input.id);
    if (JSON.stringify(baseline) !== JSON.stringify(value)) page.textChanges.push({ id: input.id, value });
    page.textChanges.sort((a, b) => a.id.localeCompare(b.id));
    if (!page.textChanges.length) delete page.textChanges;
    if (key(before.pages) === key(target.pages)) return;
    target.focus = page.id;
    await this.apply(target);
    this.past.push(before);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    await this.releaseUnusedSources();
  }
  async highlightList(pageIndex) {
    if (!this.canText) throw new Error('Annotazioni non consentite.');
    const buffer = this.bytes.slice(0);
    return this.worker.request('highlight-list', { buffer, pageIndex }, [buffer]);
  }
  async changeHighlights({ token, revision, selections, color }) {
    if (!this.canText || token !== this.token || revision !== this.revision)
      throw new Error('Documento cambiato o annotazioni non consentite.');
    if (!Array.isArray(selections) || !selections.length || selections.length > this.pages.length)
      throw new Error('Selezione del testo non valida.');
    const before = this.snapshot(), target = this.snapshot(), seen = new Set();
    for (const { pageIndex, rects } of selections) {
      const page = target.pages[pageIndex];
      if (!Number.isInteger(pageIndex) || !page || seen.has(pageIndex)) throw new Error('Pagina selezionata non valida.');
      seen.add(pageIndex);
      const input = { id: 'pdfmb-h-' + crypto.randomUUID(), rects, color };
      const buffer = this.bytes.slice(0);
      const { value } = await this.worker.request('highlight-change', { buffer, pageIndex, pageId: page.id, pageOverride: page.override, input }, [buffer]);
      page.highlightChanges = [...(page.highlightChanges ?? []), { id: input.id, value }];
      page.highlightChanges.sort((a, b) => a.id.localeCompare(b.id));
    }
    target.focus = target.pages[selections[0].pageIndex].id;
    await this.apply(target);
    this.past.push(before);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    await this.releaseUnusedSources();
  }
  async changeHighlight({ pageIndex, token, revision, input, remove = false }) {
    if (!this.canText || token !== this.token || revision !== this.revision || !this.pages[pageIndex])
      throw new Error('Documento cambiato o annotazioni non consentite.');
    const before = this.snapshot(), target = this.snapshot(), page = target.pages[pageIndex];
    const buffer = this.bytes.slice(0);
    const { value, exists } = await this.worker.request('highlight-change', { buffer, pageIndex, pageId: page.id, pageOverride: page.override, input, remove }, [buffer]);
    page.highlightChanges = (page.highlightChanges ?? []).filter(change => change.id !== input.id);
    if (value || exists) page.highlightChanges.push({ id: input.id, value });
    page.highlightChanges.sort((a, b) => a.id.localeCompare(b.id));
    if (!page.highlightChanges.length) delete page.highlightChanges;
    if (key(before.pages) === key(target.pages)) return;
    target.focus = page.id;
    await this.apply(target);
    this.past.push(before);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    await this.releaseUnusedSources();
  }
  async workbenchContext(pageIndex) {
    if (!this.pages[pageIndex]) throw new Error('Pagina non disponibile.');
    const buffer = this.bytes.slice(0);
    return this.worker.request('workbench-context', { buffer, pageIndex, pageId: this.pages[pageIndex].id }, [buffer]);
  }
  async previewWorkbench({ pageIndex, token, revision, input, scale = 2 }) {
    if (token !== this.token || revision !== this.revision || !this.pages[pageIndex] || !this.canEdit || !this.policy.canContent)
      throw new Error('Anteprima non disponibile per questo documento.');
    const buffer = this.bytes.slice(0);
    return this.worker.request('workbench-preview', { buffer, pageIndex, pageId: this.pages[pageIndex].id, input, scale }, [buffer]);
  }
  async outputPage(pageIndex, kind) {
    if (!this.pages[pageIndex] || (kind !== 'print' || !this.policy.canPrint))
      throw new Error('Esportazione non consentita.');
    const buffer = this.bytes.slice(0);
    return this.worker.request('output-page', { buffer, pageIndex, pageId: this.pages[pageIndex].id, kind }, [buffer]);
  }
  async changeWorkbench({ pageIndex, token, revision, input }) {
    if (token !== this.token || revision !== this.revision || !this.pages[pageIndex]) throw new Error('Il documento è cambiato. Riaprire gli strumenti.');
    const content = input.operation.startsWith('object-') || ['redact', 'image'].includes(input.operation);
    if (content ? !this.canEdit || !this.policy.canContent : !this.canText) throw new Error('Operazione non consentita.');
    const before = this.snapshot(), target = this.snapshot(), page = target.pages[pageIndex];
    const buffer = this.bytes.slice(0);
    this.hasWorkSources = true;
    try {
      const { override } = await this.worker.request('workbench-change', { buffer, pageIndex, pageId: page.id, pageOverride: page.override, input }, [buffer]);
      page.override = override; page.rotation = 0;
      if (input.operation === 'redact') page.formFields = [];
      delete page.textChanges; delete page.highlightChanges;
      target.focus = page.id;
      await this.apply(target);
      this.past.push(before);
      if (this.past.length > 100) this.past.shift();
      this.future = [];
    } finally { await this.releaseUnusedSources(); }
  }
  async formContext(pageIndex) {
    if (!this.pages[pageIndex]) throw new Error('Pagina non disponibile.');
    const buffer = this.bytes.slice(0);
    return this.worker.request('form-context', { buffer, pageIndex }, [buffer]);
  }
  async formLayout(pageIndex) {
    if (!this.pages[pageIndex]) throw new Error('Pagina non disponibile.');
    const buffer = this.bytes.slice(0);
    return this.worker.request('form-layout', { buffer, pageIndex }, [buffer]);
  }
  async changeForm({ token, revision, pageIndex, input, remove = false, fillOnly = false }) {
    if (!this.canFormDesign || token !== this.token || revision !== this.revision || !this.pages[pageIndex])
      throw new Error('Documento cambiato o moduli non consentiti.');
    const before = this.snapshot(), target = this.snapshot(), page = target.pages[pageIndex];
    const previous = (page.formFields ?? []).find(f => f.id === input.id);
    if ((remove || fillOnly) && !previous) throw new Error('Campo non disponibile.');
    if (fillOnly && (previous.readOnly || previous.kind === 'button')) throw new Error('Campo in sola lettura.');
    let value;
    if (!remove) {
      if (fillOnly) value = { ...previous, value: input.value };
      else {
        const buffer = this.bytes.slice(0);
        value = await this.worker.request('form-prepare', { buffer, pageIndex, pageId: page.id, input }, [buffer]);
      }
    }
    page.formFields = remove ? (page.formFields ?? []).filter(f => f.id !== input.id) :
      previous ? page.formFields.map(f => f.id === input.id ? value : f) : [...(page.formFields ?? []), value];
    if (key(before.pages) === key(target.pages)) return;
    target.focus = page.id;
    await this.apply(target);
    this.past.push(before); if (this.past.length > 100) this.past.shift(); this.future = [];
    await this.releaseUnusedSources();
  }
  async export() {
    // Repair legacy appearances, mail destinations and validation scripts even
    // when the user simply reopens and saves an otherwise unchanged form.
    // Repair even when the user simply reopens and saves, preserving source
    // bytes and undo history. Only a successful disk write clears the flag.
    if (this.textRepairPending || this.formRepairPending) {
      const bytes = await this.worker.request('rebuild', this.pages);
      if (bytes.byteLength > MAX_BYTES) throw new Error('Il risultato supera il limite di 64 MB.');
      await this.replaceView(bytes, this.name, Math.max(1, this.currentPage()));
      this.bytes = bytes;
    }
    let bytes = this.bytes;
    if (this.password) {
      const buffer = bytes.slice(0);
      bytes = (await this.worker.request('security', { buffer, password: this.password, encrypt: true }, [buffer])).buffer;
    }
    return { token: this.token, revision: this.revision, base64: encodePdf(bytes) };
  }
  markSaved({ token, revision, name }) {
    if (token !== this.token || revision !== this.revision) throw new Error('Il documento è cambiato durante il salvataggio.');
    this.savedKey = key(this.pages);
    this.savedPassword = this.password;
    this.unsavedDocument = false;
    this.textRepairPending = false;
    this.formRepairPending = false;
    this.name = name;
  }
  dispose() { this.worker?.dispose(); }
}

