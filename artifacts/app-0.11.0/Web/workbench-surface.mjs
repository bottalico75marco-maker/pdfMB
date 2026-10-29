import { pagePoint, ViewerPagePreview, renderedPageHosts } from './viewer-page.mjs';
import { stampPresets, stampDimensions, presetImage, personalImage, readStampPng } from './stamps.mjs';
import { uploadedFormImage } from './form-validation.mjs';
import { containImage } from './static-image-engine.mjs';

export class WorkbenchSurface {
  constructor({ editor, plugin, session, read, run, commit, notify, emit, unavailable }) {
    Object.assign(this, { editor, plugin, session, read, run, commit, notify, emit, unavailable });
    this.previewGeneration = 0;
    this.disposers = [];
    this.hosts = new WeakSet();
    this.pageHosts = new Map();
    this.active = false;
    // Retain the native event during dispatch: the viewer's normalized down
    // callback omits button and pointerId, and a newly mounted host may not
    // receive pointerenter before the first click.
    document.addEventListener('pointerdown', event => { this.nativeDown = event; }, true);
    this.preview = new ViewerPagePreview(document.querySelector('#tools-canvas'), () => this.rotation());
    plugin('interaction-manager').registerMode({ id: 'pdfmb-tools', scope: 'page', exclusive: true, cursor: 'crosshair' });
    this.toolbar = document.querySelector('#tools-toolbar');
    this.canvas = document.querySelector('#tools-canvas');
    this.mode = document.querySelector('#tools-mode');
    this.items = document.querySelector('#tools-items');
    this.contents = document.querySelector('#tools-contents');
    this.status = document.querySelector('#tools-status');
    this.field = name => document.querySelector('#tools-' + name);
    this.mode.onchange = () => {
      const next = this.mode.value; this.mode.value = this.lastMode;
      if (this.busy || this.unavailable()) return;
      if (this.changed() && !confirm('Scartare le modifiche non ancora applicate?')) return;
      this.mode.value = next; this.region = null; this.points = []; this.reloadItems();
      if (next === 'stamp') this.selectStamp();
    };
    this.items.onchange = () => this.chooseItem(this.items.value);
    this.toolbar.querySelector('[data-tools-close]').onclick = () => this.close();
    this.field('apply').onclick = () => this.apply();
    this.field('delete').onclick = () => this.apply(true);
    this.field('previous').onclick = () => this.navigate(-1);
    this.field('next').onclick = () => this.navigate(1);
    for (const name of ['font', 'size', 'action', 'dx', 'dy', 'scale', 'angle', 'contents']) this.field(name).addEventListener('input', () => this.schedulePreview());
    for (const name of ['color', 'stroke']) this.field(name).addEventListener('input', () => { this.paint(); this.notify(); });
    this.field('reset-preview').onclick = () => this.selectItem();
    this.initializeStamps();
    this.field('image-upload').onchange = event => {
      const file = event.target.files[0];
      if (!file || this.unavailable() || this.busy) return;
      this.busy = true; this.notify();
      this.imageLoading = this.run(async () => {
        const source = new Image(); source.src = await uploadedFormImage(file); await source.decode();
        const canvas = document.createElement('canvas'); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
        const context = canvas.getContext('2d'); context.drawImage(source, 0, 0);
        this.toolImage = { canvas, image: { width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data.buffer } };
        this.field('image-name').textContent = file.name;
        this.status.textContent = 'Immagine caricata. Clicca il riquadro per sostituirla. Applica o Salva la incorpora come immagine statica.';
        this.paint();
      }).catch(error => { this.status.textContent = error.message; }).finally(() => {
        this.busy = false; event.target.value = ''; this.notify(); this.imageLoading = null;
      });
    };
    plugin('scroll').onPageChange(event => this.followPage(event));
  }
  followPage({ documentId, pageNumber }) {
    if (!this.active || documentId !== this.documentId || this.busy || this.drag != null || this.changed()) return;
    const pageIndex = pageNumber - 1;
    if (pageIndex === this.pageIndex) return;
    this.pageLoad = this.read(async () => {
      if (!this.active || documentId !== this.documentId || this.busy || this.drag != null || this.changed() ||
          this.plugin('scroll').forDocument(documentId).getCurrentPage() !== pageNumber) return;
      this.preview.clear(); this.pageIndex = pageIndex; await this.load();
    }).catch(error => { this.status.textContent = error.message; });
  }
  rotation() { return this.plugin('rotate').forDocument(this.session.currentId).getRotation() & 3; }
  sync() {
    if (!this.active) return;
    if (this.editor()?.token !== this.token) { this.close(true); return; }
    const id = this.session.currentId;
    if (!id || id === this.documentId) return;
    this.unbind(); this.documentId = id;
    const manager = this.plugin('interaction-manager');
    this.editor().pages.forEach((_, pageIndex) => this.disposers.push(manager.registerHandlers({
      documentId: id, pageIndex, modeId: 'pdfmb-tools', handlers: {
        onPointerEnter: (_, event) => this.bindHost(pageIndex, event.currentTarget),
        onPointerDown: (_, event) => {
          const host = event.currentTarget, bound = this.hosts.has(host);
          this.bindHost(pageIndex, host);
          if (!bound && this.nativeDown?.currentTarget === host) this.pointerDown(pageIndex, this.nativeDown);
        }
      }
    })));
    manager.forDocument(id).activate('pdfmb-tools');
    this.discoverHosts(id);
  }
  discoverHosts(id = this.documentId, attempts = 3) {
    requestAnimationFrame(() => {
      if (!this.active || id !== this.documentId) return;
      const indexes = this.plugin('scroll').forDocument(id).getMetrics().renderedPageIndexes;
      const hosts = renderedPageHosts(document.querySelector('#viewer'));
      if (hosts.length === indexes.length) hosts.forEach((host, index) => this.bindHost(indexes[index], host));
      if (!this.pageHosts.get(this.pageIndex)?.isConnected && attempts > 0) this.discoverHosts(id, attempts - 1);
    });
  }
  bindHost(pageIndex, host) {
    this.pageHosts.set(pageIndex, host);
    if (pageIndex === this.pageIndex) this.preview.attach(host, this.data);
    if (this.hosts.has(host)) return;
    this.hosts.add(host);
    // The viewer normalizes pointer callbacks without button/pointer IDs. Use
    // native events on its page host for capture and multi-pointer gestures.
    const handlers = {
      pointerdown: event => this.pointerDown(pageIndex, event),
      pointermove: event => this.pointerMove(pageIndex, event),
      pointerup: event => this.pointerUp(pageIndex, event),
      pointercancel: () => this.cancelGesture(),
      lostpointercapture: () => { if (this.drag != null) this.cancelGesture(); }
    };
    for (const [type, handler] of Object.entries(handlers)) host.addEventListener(type, handler);
    this.disposers.push(() => {
      for (const [type, handler] of Object.entries(handlers)) host.removeEventListener(type, handler);
    });
  }
  unbind() {
    this.disposers.forEach(dispose => dispose()); this.disposers = [];
    this.hosts = new WeakSet();
    this.pageHosts.clear();
    this.preview.clear();
    try { this.plugin('interaction-manager').forDocument(this.documentId).activateDefaultMode(); } catch { /* Replaced document. */ }
    this.documentId = null;
  }
  contains(p, [x, y]) { return p && x >= p.x && y >= p.y && x <= p.x + p.width && y <= p.y + p.height; }
  annotationType() { return { note: 1, square: 5, circle: 6, line: 4, ink: 15, stamp: 13 }[this.mode.value]; }
  get shapeMode() { return ['square', 'circle', 'line', 'ink'].includes(this.mode.value); }
  get shapeStyleChanged() {
    return this.shapeMode && !!this.items.value && (this.field('color').value !== this.originalColor || this.field('stroke').value !== this.originalStroke);
  }
  get pendingShape() { return this.active && (this.shapeMode && (!!this.region || this.shapeStyleChanged) || this.mode.value === 'image' && !!this.region); }
  imageInput() {
    if (!this.region || !this.toolImage) throw new Error('Clicca il riquadro e carica un’immagine prima di salvare.');
    return { operation: 'image', region: this.region, image: this.toolImage.image };
  }
  shapeInput() {
    return { operation: this.items.value ? 'annotation-update' : this.mode.value,
      ...(this.items.value ? { id: this.items.value } : { region: this.region, points: this.points }),
      color: this.field('color').value, stroke: Number(this.field('stroke').value) };
  }
  async flushShapes() {
    if (!this.pendingShape) return true;
    if (this.busy || this.drag != null) return false;
    this.busy = true;
    try {
      await this.commit({ pageIndex: this.pageIndex, token: this.token, revision: this.revision, input: this.mode.value === 'image' ? this.imageInput() : this.shapeInput() });
      await this.load(); return true;
    } catch (error) { this.status.textContent = error.message; return false; }
    finally { this.busy = false; this.notify(); }
  }
  point(event, host = this.preview.host) { return pagePoint(event, host, this.data, this.rotation()); }
  async pointerDown(pageIndex, event) {
    if (this.busy || this.drag != null || this.unavailable() || event.button !== 0) return;
    if (this.mode.value === 'image' && this.region && pageIndex === this.pageIndex && this.contains(this.region, this.point(event, event.currentTarget))) {
      event.preventDefault(); event.stopPropagation(); this.field('image-upload').click(); return;
    }
    if (this.mode.value === 'stamp' && !this.field('stamp-width').checkValidity()) { this.field('stamp-width').reportValidity(); return; }
    if (pageIndex !== this.pageIndex && this.changed() && !confirm('Scartare le modifiche non ancora applicate?')) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    const gesture = { pageIndex, host: event.currentTarget, pointerId: event.pointerId,
      start: { clientX: event.clientX, clientY: event.clientY } };
    this.gesture = gesture; this.drag = event.pointerId;
    this.notify();
    try {
      await this.pageLoad;
      if (pageIndex !== this.pageIndex) await this.read(async () => { this.pageIndex = pageIndex; await this.load(); });
      if (this.gesture !== gesture || !this.active) return;
      this.drag = gesture.pointerId;
      this.preview.attach(gesture.host, this.data);
      const point = this.point(gesture.start);
      if (this.mode.value === 'objects') {
        const found = [...this.data.objects].reverse().find(item => this.contains(item.position, point));
        this.drag = null; this.gesture = null; this.chooseItem(found ? String(found.index) : ''); this.notify(); return;
      }
      if (this.mode.value !== 'redact' && this.contents.value === this.originalContents) {
        gesture.hit = [...this.data.annotations].reverse().find(item => item.type === this.annotationType() && this.contains(item.position, point));
      }
      this.items.value = ''; this.region = null; this.points = [point]; gesture.ready = true;
      if (gesture.latest) this.moveGesture(gesture.latest);
      if (gesture.ended) this.finishGesture();
      this.paint();
    } catch (error) { this.cancelGesture(); this.status.textContent = error.message; }
  }
  moveGesture(event) {
    const point = this.point(event);
    if (this.mode.value === 'ink' && this.points.length < 10000) this.points.push(point);
    else this.points[1] = point;
    this.setRegion(); this.paint();
  }
  pointerMove(pageIndex, event) {
    const gesture = this.gesture;
    if (!gesture && this.active && this.mode.value === 'stamp' && this.stamp && !this.items.value && !this.region && pageIndex === this.pageIndex && !this.unavailable()) {
      if (!this.field('stamp-width').checkValidity()) return;
      this.hoverStamp = this.placedStamp(this.point(event, event.currentTarget)); this.paint(); return;
    }
    if (!gesture || gesture.pageIndex !== pageIndex || gesture.pointerId !== event.pointerId) return;
    if (gesture.ready) this.moveGesture(event);
    else gesture.latest = { clientX: event.clientX, clientY: event.clientY };
  }
  pointerUp(pageIndex, event) {
    const gesture = this.gesture;
    if (!gesture || gesture.pageIndex !== pageIndex || gesture.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    gesture.ended = true;
    if (gesture.ready) {
      if (this.points.length > 1 || event.clientX !== gesture.start.clientX || event.clientY !== gesture.start.clientY) this.moveGesture(event);
      this.finishGesture();
    } else if (event.clientX !== gesture.start.clientX || event.clientY !== gesture.start.clientY) gesture.latest = { clientX: event.clientX, clientY: event.clientY };
  }
  finishGesture() {
    const hit = this.gesture?.hit;
    this.drag = null; this.gesture = null;
    if (hit && this.points.length === 1) { this.items.value = hit.id; this.selectItem(); return; }
    if (this.mode.value === 'image' && this.points.length === 1) {
      const width = Math.min(160, this.data.width), height = Math.min(100, this.data.height), [x, y] = this.points[0];
      this.region = { x: Math.max(0, Math.min(x, this.data.width - width)), y: Math.max(0, Math.min(y, this.data.height - height)), width, height };
      this.field('image-upload').click();
    } else if (this.mode.value === 'stamp' && this.points.length === 1) {
      this.region = this.placedStamp(this.points[0]);
    } else if (this.mode.value === 'note' && this.points.length === 1) {
      const [x, y] = this.points[0];
      this.region = { x: Math.max(0, Math.min(x, this.data.width - 24)), y: Math.max(0, Math.min(y, this.data.height - 24)), width: Math.min(24, this.data.width), height: Math.min(24, this.data.height) };
    } else this.setRegion();
    this.paint();
    this.notify();
  }
  cancelGesture() { this.drag = null; this.gesture = null; this.region = null; this.points = []; this.paint(); this.notify(); }
  setRegion() {
    if (this.points.length < 2) return;
    const xs = this.points.map(p => p[0]), ys = this.points.map(p => p[1]);
    this.region = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    if (this.mode.value === 'stamp' && this.stamp) {
      this.region.x = Math.min(this.region.x, this.data.width - 1); this.region.y = Math.min(this.region.y, this.data.height - 1);
      const ratio = this.stamp.image.width / this.stamp.image.height;
      const size = stampDimensions(this.stamp.image.width, this.stamp.image.height,
        { width: this.data.width - this.region.x, height: this.data.height - this.region.y }, Math.max(1, this.region.width, this.region.height * ratio));
      Object.assign(this.region, size); this.field('stamp-width').value = (size.width * 25.4 / 72).toFixed(1);
      this.field('stamp-dimensions').textContent = `${(size.width * 25.4 / 72).toFixed(1)} × ${(size.height * 25.4 / 72).toFixed(1)} mm · proporzioni bloccate`;
    }
    // Horizontal/vertical ink still needs a non-empty annotation rectangle.
    if (['ink', 'line'].includes(this.mode.value)) {
      this.region.width = Math.max(1, this.region.width); this.region.height = Math.max(1, this.region.height);
      this.region.x = Math.min(this.region.x, this.data.width - this.region.width);
      this.region.y = Math.min(this.region.y, this.data.height - this.region.height);
    }
  }
  changed() { return (!!this.region || this.shapeStyleChanged || (['note', 'objects'].includes(this.mode.value) && this.contents.value !== (this.originalContents ?? '')) ||
    (this.mode.value === 'objects' && !!this.items.value && (this.field('font').value !== this.originalFont || this.field('size').value !== this.originalSize)) ||
    (this.mode.value === 'objects' && ['dx', 'dy', 'angle'].some(name => Number(this.field(name).value) !== 0)) ||
    (this.mode.value === 'objects' && Number(this.field('scale').value) !== 1)); }
  close(force = false) {
    if (this.busy) return false;
    if (!force && this.active && this.changed() && !confirm('Scartare la selezione o il testo non ancora applicati?')) return false;
    this.invalidatePreview();
    document.querySelector('#stamp-palette').hidePopover();
    this.active = false; this.toolbar.hidden = true; this.preview.layer.hidden = true;
    this.unbind(); this.region = null; this.drag = null; this.gesture = null; return true;
  }
  async open(pageIndex, mode = 'note') {
    this.toolImage = null; this.field('image-name').textContent = 'Nessuna immagine caricata';
    this.pageIndex = pageIndex; this.mode.value = mode;
    await this.load(); this.active = true; this.toolbar.hidden = false; this.preview.layer.hidden = false; this.sync();
    if (mode === 'stamp') await this.selectStamp();
  }
  async load() {
    const editor = this.editor();
    this.token = editor.token; this.revision = editor.revision;
    this.data = await editor.workbenchContext(this.pageIndex);
    this.region = null; this.points = [];
    this.field('dx').value = this.field('dy').value = this.field('angle').value = '0'; this.field('scale').value = '1';
    for (const option of this.mode.options) option.disabled = ['objects', 'redact', 'image'].includes(option.value) ? !this.data.canContent : !this.data.canAnnotate;
    if (this.mode.selectedOptions[0]?.disabled) this.mode.value = [...this.mode.options].find(option => !option.disabled)?.value ?? '';
    this.canvas.width = this.data.image.width; this.canvas.height = this.data.image.height;
    this.field('title').textContent = `Strumenti · pagina ${this.pageIndex + 1} / ${editor.pages.length}`;
    this.reloadItems();
    this.field('previous').disabled = this.pageIndex === 0;
    this.field('next').disabled = this.pageIndex === editor.pages.length - 1;
  }
  reloadItems() {
    this.invalidatePreview();
    this.lastMode = this.mode.value;
    const objects = this.mode.value === 'objects', redact = this.mode.value === 'redact';
    this.items.replaceChildren(new Option('Nuova selezione', ''));
    this.selectedValue = '';
    if (objects) this.data.objects.forEach(item => this.items.add(new Option(`${item.index + 1} · ${['', 'Testo', 'Tracciato', 'Immagine', 'Ombreggiatura', 'Gruppo'][item.type] ?? 'Oggetto'} ${item.text.slice(0, 45)}`, String(item.index))));
    else this.data.annotations.filter(item => item.type === this.annotationType()).forEach((item, i) => this.items.add(new Option(`${i + 1} · ${item.type === 1 ? 'Nota: ' + item.contents.slice(0, 45) : item.type === 13 ? 'Timbro: ' + item.contents.slice(0, 45) : 'Forma / disegno'}`, item.id)));
    this.field('object-controls').hidden = !objects;
    this.field('annotation-controls').hidden = objects || redact || ['stamp', 'image'].includes(this.mode.value);
    this.field('stamp-controls').hidden = this.mode.value !== 'stamp';
    this.field('image-controls').hidden = this.mode.value !== 'image';
    this.contents.closest('label').hidden = !['note', 'objects'].includes(this.mode.value);
    this.field('content-label').textContent = objects ? 'Nuovo testo dell’oggetto' : 'Contenuto nota';
    this.items.disabled = redact || this.mode.value === 'image';
    this.contents.value = ''; this.originalContents = '';
    this.field('apply').setAttribute('aria-label', redact ? 'Applica oscuramento' : 'Applica');
    this.field('apply').title = redact ? 'Applica oscuramento' : 'Applica';
    this.field('apply').disabled = false;
    this.field('delete').hidden = redact || this.mode.value === 'image';
    this.field('warning').hidden = !redact;
    this.status.textContent = objects ? 'Seleziona un oggetto sulla pagina o dall’elenco. I gruppi si modificano come oggetto unico.' :
      redact ? 'Trascina l’area da eliminare, quindi applica. Prima di condividere salva il PDF risultante.' :
      this.mode.value === 'stamp' ? 'Scegli un timbro: clicca per inserirlo oppure trascina per dimensionarlo. Applica lo aggiunge al PDF.' :
      this.mode.value === 'image' ? 'Clicca per creare il riquadro e caricare un’immagine, oppure trascina per dimensionarlo. Salva incorpora l’immagine statica.' :
      'Nota: clicca sul punto desiderato. Forme e penna: trascina sulla pagina. Premi Applica per confermare.';
    this.hoverStamp = null; this.resizeStamp(); this.paint();
  }
  chooseItem(value) {
    this.items.value = this.selectedValue ?? '';
    if (value === this.items.value && this.changed()) return;
    if (value !== this.items.value && this.changed() && !confirm('Scartare le modifiche non ancora applicate?')) return;
    this.items.value = value; this.selectItem();
  }
  selectItem() {
    this.invalidatePreview();
    this.selectedValue = this.items.value;
    this.field('dx').value = this.field('dy').value = this.field('angle').value = '0'; this.field('scale').value = '1';
    this.region = null; this.points = [];
    const objects = this.mode.value === 'objects';
    const item = objects ? this.data.objects.find(o => String(o.index) === this.items.value) : this.data.annotations.find(a => a.id === this.items.value);
    this.contents.value = item?.contents ?? item?.text ?? ''; this.originalContents = this.contents.value;
    this.field('size').value = Math.min(144, Math.max(6, item?.size ?? 12));
    this.field('font').value = item?.font ?? 'Helvetica';
    this.originalFont = this.field('font').value; this.originalSize = this.field('size').value;
    this.field('apply').disabled = this.mode.value === 'stamp' && !!this.items.value;
    if (this.shapeMode && item) { this.field('color').value = item.color; this.field('stroke').value = item.stroke; }
    this.originalColor = this.field('color').value; this.originalStroke = this.field('stroke').value;
    const host = this.pageHosts.get(this.pageIndex);
    if (host?.isConnected) this.preview.attach(host, this.data);
    else this.discoverHosts();
    if (objects) this.status.textContent = item ? `Selezionato: ${this.items.selectedOptions[0].textContent}` : 'Seleziona un oggetto dal menu Elementi oppure cliccalo sul PDF.';
    this.paint();
    this.notify();
  }
  invalidatePreview() {
    clearTimeout(this.previewTimer); this.previewGeneration++; this.livePreview = null;
    delete this.canvas.dataset.livePreview;
  }
  objectInput(remove = false) {
    return { operation: remove ? 'object-delete' : this.field('action').value, index: Number(this.items.value), contents: this.contents.value,
      font: this.field('font').value, size: Number(this.field('size').value), dx: Number(this.field('dx').value),
      dy: Number(this.field('dy').value), scale: Number(this.field('scale').value), angle: Number(this.field('angle').value) };
  }
  schedulePreview(delay = 150) {
    clearTimeout(this.previewTimer); const generation = ++this.previewGeneration;
    if (!this.active || this.mode.value !== 'objects' || !this.items.value) return;
    if (!this.changed()) { this.livePreview = null; delete this.canvas.dataset.livePreview; this.paint(); return; }
    this.canvas.dataset.livePreview = 'pending'; this.status.textContent = 'Aggiornamento anteprima…';
    this.previewTimer = setTimeout(async () => {
      if (this.previewBusy || this.unavailable() || generation !== this.previewGeneration) return;
      const target = { pageIndex: this.pageIndex, token: this.token, revision: this.revision, input: this.objectInput(),
        scale: this.plugin('zoom').forDocument(this.session.currentId).getState().currentZoomLevel };
      this.previewBusy = true;
      try {
        const result = await this.read(() => this.editor().previewWorkbench(target));
        if (generation !== this.previewGeneration || !this.active) return;
        this.livePreview = result; this.canvas.dataset.livePreview = 'true'; this.paint();
        this.status.textContent = 'Anteprima sulla pagina. Applica conferma la modifica; Annulla anteprima ripristina l’originale.';
      } catch (error) {
        if (generation === this.previewGeneration) { this.livePreview = null; delete this.canvas.dataset.livePreview; this.paint(); this.status.textContent = error.message; }
      } finally {
        this.previewBusy = false;
        if (this.active && generation !== this.previewGeneration) this.schedulePreview();
      }
    }, delay);
  }
  initializeStamps() {
    this.customStamps = [];
    const now = new Date();
    this.field('stamp-date').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.field('stamp').onchange = () => this.selectStamp();
    this.field('stamp-date').oninput = this.field('stamp-format').onchange = () => this.selectStamp(false);
    this.field('stamp-width').oninput = () => this.resizeStamp();
    this.field('stamp-upload').onchange = async event => {
      const file = event.target.files?.[0]; if (!file || this.unavailable()) return;
      event.target.disabled = true;
      try {
        const item = await readStampPng(file);
        this.status.textContent = 'Importazione del timbro personale…'; this.emit('host.stampImport', item);
      } catch (error) { this.stampError(error.message); }
      finally { event.target.value = ''; }
    };
    this.buildStampPalette(); this.selectStamp();
  }
  buildStampPalette(selectedId) {
    const picker = this.field('stamp'), value = selectedId ?? picker.value;
    picker.replaceChildren(...stampPresets.map(([id, label]) => new Option(label, id)),
      ...this.customStamps.map(item => new Option('Personale · ' + item.name, item.id)));
    if ([...picker.options].some(option => option.value === value)) picker.value = value;
    const build = (container, items) => {
      container.replaceChildren();
      for (const item of items) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.stampId = item.id;
        const img = document.createElement('img'); img.src = item.src; img.alt = item.label;
        const label = document.createElement('span'); label.textContent = item.label; button.append(img, label);
        button.onclick = () => { picker.value = item.id; this.selectStamp(); document.querySelector('#stamp-palette').hidePopover(); };
        container.append(button);
      }
    };
    build(document.querySelector('#stamp-presets'), stampPresets.map(([id, label]) => ({ id, label,
      src: presetImage(id, this.field('stamp-date').value, this.field('stamp-format').value).canvas.toDataURL('image/png') })));
    build(document.querySelector('#stamp-personal'), this.customStamps.map(item => ({ id: item.id, label: item.name, src: 'data:image/png;base64,' + item.base64 })));
  }
  async setCustomStamps({ items = [], selectedId }) {
    this.field('stamp-upload').disabled = false;
    this.customStamps = items; this.buildStampPalette(selectedId);
    if (selectedId) { await this.selectStamp(); this.status.textContent = 'Timbro personale disponibile. Clicca sulla pagina o trascina per posizionarlo.'; }
  }
  stampError(message) { this.field('stamp-upload').disabled = false; this.status.textContent = message; }
  async selectStamp(resetWidth = true) {
    const id = this.field('stamp').value, generation = this.stampGeneration = (this.stampGeneration ?? 0) + 1;
    try {
      const custom = this.customStamps.find(item => item.id === id);
      const stamp = custom ? await personalImage(custom) : presetImage(id, this.field('stamp-date').value, this.field('stamp-format').value);
      if (generation !== this.stampGeneration) return;
      this.stamp = stamp; this.field('stamp-date-controls').hidden = id !== 'date';
      if (id === 'date') {
        const thumbnail = document.querySelector('[data-stamp-id="date"] img');
        if (thumbnail) thumbnail.src = stamp.canvas.toDataURL('image/png');
      }
      if (this.mode.value === 'stamp') { this.items.value = ''; this.selectedValue = ''; }
      if (this.mode.value === 'stamp') this.field('apply').disabled = false;
      if (this.data && resetWidth) {
        const width = Math.min(180, this.data.width * .4, 100 * stamp.image.width / stamp.image.height);
        this.field('stamp-width').value = (width * 25.4 / 72).toFixed(1);
      }
      this.resizeStamp();
    } catch (error) { this.stampError(error.message); }
  }
  stampSize() {
    return stampDimensions(this.stamp.image.width, this.stamp.image.height, this.data, Number(this.field('stamp-width').value) * 72 / 25.4);
  }
  placedStamp([x, y]) {
    const size = this.stampSize();
    return { x: Math.max(0, Math.min(x, this.data.width - size.width)), y: Math.max(0, Math.min(y, this.data.height - size.height)), ...size };
  }
  resizeStamp() {
    if (!this.data || !this.stamp) return;
    try {
      const size = this.stampSize();
      this.field('stamp-dimensions').textContent = `${(size.width * 25.4 / 72).toFixed(1)} × ${(size.height * 25.4 / 72).toFixed(1)} mm · proporzioni bloccate`;
      if (this.mode.value === 'stamp' && this.region) this.region = this.placedStamp([this.region.x, this.region.y]);
      else if (this.mode.value === 'stamp' && this.hoverStamp) this.hoverStamp = this.placedStamp([this.hoverStamp.x, this.hoverStamp.y]);
      this.paint();
    } catch (error) { this.status.textContent = error.message; }
  }
  paint() {
    if (!this.data) return;
    const image = this.livePreview?.image ?? this.data.image;
    if (this.canvas.width !== image.width || this.canvas.height !== image.height) { this.canvas.width = image.width; this.canvas.height = image.height; }
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.livePreview) {
      const { image } = this.livePreview;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
    }
    const object = this.mode.value === 'objects' ? this.data.objects.find(o => String(o.index) === this.items.value) : this.data.annotations.find(a => a.id === this.items.value);
    const stampRegion = this.mode.value === 'stamp' && !this.items.value ? this.region ?? this.hoverStamp : null;
    if (stampRegion && this.stamp) ctx.drawImage(this.stamp.canvas, stampRegion.x * image.width / this.data.width, stampRegion.y * image.height / this.data.height,
      stampRegion.width * image.width / this.data.width, stampRegion.height * image.height / this.data.height);
    const p = this.region ?? this.livePreview?.position ?? object?.position ?? stampRegion;
    if (this.mode.value === 'image' && this.region) {
      const bounds = this.toolImage ? containImage(this.toolImage.image, this.region) : this.region;
      const sx = image.width / this.data.width, sy = image.height / this.data.height;
      if (this.toolImage) ctx.drawImage(this.toolImage.canvas, bounds.x * sx, bounds.y * sy, bounds.width * sx, bounds.height * sy);
      else {
        ctx.fillStyle = '#edf4ff'; ctx.fillRect(bounds.x * sx, bounds.y * sy, bounds.width * sx, bounds.height * sy);
        ctx.save(); ctx.beginPath(); ctx.rect(bounds.x * sx, bounds.y * sy, bounds.width * sx, bounds.height * sy); ctx.clip();
        ctx.fillStyle = '#174c8c'; ctx.font = `${Math.max(10, 10 * sx)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Clicca per caricare immagine…', (bounds.x + bounds.width / 2) * sx, (bounds.y + bounds.height / 2) * sy); ctx.restore();
      }
    }
    if (p) {
      ctx.save(); ctx.scale(image.width / this.data.width, image.height / this.data.height);
      ctx.strokeStyle = this.region ? this.field('color').value : '#1266cc';
      ctx.lineWidth = this.region ? Number(this.field('stroke').value) : 1;
      if (this.region && ['line', 'ink'].includes(this.mode.value) && this.points.length > 1) {
        ctx.beginPath(); this.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      } else if (this.region && this.mode.value === 'circle') {
        ctx.beginPath(); ctx.ellipse(p.x + p.width / 2, p.y + p.height / 2, p.width / 2, p.height / 2, 0, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.strokeStyle = '#1266cc'; ctx.strokeRect(p.x, p.y, p.width, p.height);
      }
      ctx.restore();
    }
  }
  async navigate(delta) {
    const next = this.pageIndex + delta;
    if (this.busy || next < 0 || next >= this.editor().pages.length || this.drag != null) return;
    if (this.changed() && !confirm('Scartare le modifiche non ancora applicate?')) return;
    try { await this.run(async () => { this.preview.clear(); this.pageIndex = next; await this.load();
      this.plugin('scroll').forDocument(this.session.currentId).scrollToPage({ pageNumber: next + 1, behavior: 'instant' }); }); }
    catch (error) { this.status.textContent = error.message; }
  }
  async apply(remove = false) {
    if (this.busy || this.drag != null || this.unavailable()) return;
    await this.pageLoad;
    if (!this.active || this.busy || this.unavailable()) return;
    const editor = this.editor();
    if (editor.token !== this.token || editor.revision !== this.revision) { this.status.textContent = 'Il documento è cambiato: chiudi e riapri gli strumenti.'; return; }
    let input;
    if (this.mode.value === 'objects') {
      if (!this.items.value) { this.status.textContent = 'Seleziona un oggetto.'; return; }
      input = this.objectInput(remove);
    } else if (this.mode.value === 'image') {
      try { input = this.imageInput(); } catch (error) { this.status.textContent = error.message; return; }
    } else if (this.shapeMode && !remove) {
      if (this.items.value && !this.shapeStyleChanged) { this.status.textContent = 'La forma è già applicata. Salva il PDF per conservarla nel file.'; return; }
      input = this.shapeInput();
    } else if (this.items.value) {
      input = { operation: remove ? 'annotation-delete' : 'annotation-update', id: this.items.value, contents: this.contents.value };
    } else {
      if (remove) return;
      if (this.mode.value === 'stamp') {
        if (!this.field('stamp-width').reportValidity()) return;
        if (!this.stamp || !this.region) { this.status.textContent = 'Posiziona il timbro sulla pagina.'; return; }
        input = { operation: 'stamp', region: this.region, image: this.stamp.image, label: this.stamp.label };
      } else
      input = { operation: this.mode.value, region: this.region, points: this.points,
        contents: this.contents.value, color: this.field('color').value, stroke: Number(this.field('stroke').value) };
    }
    if (remove && !confirm('Eliminare l’elemento selezionato? Puoi annullare dalla cronologia.')) return;
    if (input.operation === 'redact' && !confirm('La pagina sarà ricostruita come immagine con l’area eliminata. Perderà testo selezionabile, moduli e annotazioni modificabili. Il PDF bonificato non conserverà allegati, metadati e segnalibri. Annulla resta disponibile nella sessione. Continuare?')) return;
    this.invalidatePreview(); this.busy = true; this.toolbar.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
    try {
      await this.run(async () => { await editor.changeWorkbench({ pageIndex: this.pageIndex, token: this.token, revision: this.revision, input }); await this.load(); });
      this.status.textContent = 'Modifica applicata. Salva il PDF per conservarla.';
    } catch (error) { this.status.textContent = error.message; }
    finally {
      this.busy = false; this.toolbar.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; });
      this.items.disabled = ['redact', 'image'].includes(this.mode.value);
      this.field('previous').disabled = this.pageIndex === 0;
      this.field('next').disabled = this.pageIndex === editor.pages.length - 1;
      for (const option of this.mode.options) option.disabled = ['objects', 'redact', 'image'].includes(option.value) ? !this.data.canContent : !this.data.canAnnotate;
      this.notify();
    }
  }
}
