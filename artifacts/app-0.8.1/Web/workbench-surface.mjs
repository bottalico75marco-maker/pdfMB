import { pagePoint, ViewerPagePreview } from './viewer-page.mjs';
import { validateRegion } from './workbench-engine.mjs';
export function pngFromImage(image, region, geometry) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
  if (!region) return canvas.toDataURL('image/png').split(',')[1];
  validateRegion(region, geometry.width, geometry.height);
  const x = Math.floor(region.x * image.width / geometry.width), y = Math.floor(region.y * image.height / geometry.height);
  const w = Math.min(image.width - x, Math.ceil(region.width * image.width / geometry.width));
  const h = Math.min(image.height - y, Math.ceil(region.height * image.height / geometry.height));
  const crop = document.createElement('canvas'); crop.width = Math.max(1, w); crop.height = Math.max(1, h);
  crop.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return crop.toDataURL('image/png').split(',')[1];
}

export class WorkbenchSurface {
  constructor({ editor, plugin, session, read, run, notify, emit, unavailable }) {
    Object.assign(this, { editor, plugin, session, read, run, notify, emit, unavailable });
    this.disposers = [];
    this.hosts = new WeakSet();
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
      if (this.changed() && !confirm('Scartare le modifiche non ancora applicate?')) return;
      this.mode.value = next; this.region = null; this.points = []; this.reloadItems();
    };
    this.items.onchange = () => this.selectItem();
    this.toolbar.querySelector('[data-tools-close]').onclick = () => this.close();
    this.field('apply').onclick = () => this.apply();
    this.field('delete').onclick = () => this.apply(true);
    this.field('previous').onclick = () => this.navigate(-1);
    this.field('next').onclick = () => this.navigate(1);
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
  }
  bindHost(pageIndex, host) {
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
    this.preview.clear();
    try { this.plugin('interaction-manager').forDocument(this.documentId).activateDefaultMode(); } catch { /* Replaced document. */ }
    this.documentId = null;
  }
  contains(p, [x, y]) { return p && x >= p.x && y >= p.y && x <= p.x + p.width && y <= p.y + p.height; }
  point(event, host = this.preview.host) { return pagePoint(event, host, this.data, this.rotation()); }
  async pointerDown(pageIndex, event) {
    if (this.busy || this.drag != null || this.unavailable() || event.button !== 0) return;
    if (pageIndex !== this.pageIndex && this.changed() && !confirm('Scartare le modifiche non ancora applicate?')) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    const gesture = { pageIndex, host: event.currentTarget, pointerId: event.pointerId,
      start: { clientX: event.clientX, clientY: event.clientY } };
    this.gesture = gesture; this.drag = event.pointerId;
    try {
      await this.pageLoad;
      if (pageIndex !== this.pageIndex) await this.read(async () => { this.pageIndex = pageIndex; await this.load(); });
      if (this.gesture !== gesture || !this.active) return;
      this.drag = gesture.pointerId;
      this.preview.attach(gesture.host, this.data);
      const point = this.point(gesture.start);
      if (this.mode.value === 'objects') {
        const found = [...this.data.objects].reverse().find(item => this.contains(item.position, point));
        this.items.value = found ? String(found.index) : ''; this.selectItem(); this.drag = null; this.gesture = null; return;
      }
      if (!['capture', 'redact'].includes(this.mode.value) && this.contents.value === this.originalContents) {
        gesture.hit = [...this.data.annotations].reverse().find(item => this.contains(item.position, point));
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
    if (this.mode.value === 'note' && this.points.length === 1) {
      const [x, y] = this.points[0];
      this.region = { x: Math.max(0, Math.min(x, this.data.width - 24)), y: Math.max(0, Math.min(y, this.data.height - 24)), width: Math.min(24, this.data.width), height: Math.min(24, this.data.height) };
    } else this.setRegion();
    this.paint();
  }
  cancelGesture() { this.drag = null; this.gesture = null; this.region = null; this.points = []; this.paint(); }
  setRegion() {
    if (this.points.length < 2) return;
    const xs = this.points.map(p => p[0]), ys = this.points.map(p => p[1]);
    this.region = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    // Horizontal/vertical ink still needs a non-empty annotation rectangle.
    if (['ink', 'line'].includes(this.mode.value)) {
      this.region.width = Math.max(1, this.region.width); this.region.height = Math.max(1, this.region.height);
      this.region.x = Math.min(this.region.x, this.data.width - this.region.width);
      this.region.y = Math.min(this.region.y, this.data.height - this.region.height);
    }
  }
  changed() { return this.mode.value !== 'capture' && (!!this.region || this.contents.value !== (this.originalContents ?? '') ||
    (this.mode.value === 'objects' && ['dx', 'dy', 'angle'].some(name => Number(this.field(name).value) !== 0)) ||
    (this.mode.value === 'objects' && Number(this.field('scale').value) !== 1)); }
  close(force = false) {
    if (this.busy) return false;
    if (!force && this.active && this.changed() && !confirm('Scartare la selezione o il testo non ancora applicati?')) return false;
    this.active = false; this.toolbar.hidden = true; this.preview.layer.hidden = true;
    this.unbind(); this.region = null; this.drag = null; this.gesture = null; return true;
  }
  async open(pageIndex, mode = 'note') {
    this.pageIndex = pageIndex; this.mode.value = mode;
    await this.load(); this.active = true; this.toolbar.hidden = false; this.preview.layer.hidden = false; this.sync();
  }
  async load() {
    const editor = this.editor();
    this.token = editor.token; this.revision = editor.revision;
    this.data = await editor.workbenchContext(this.pageIndex);
    this.region = null; this.points = [];
    this.field('dx').value = this.field('dy').value = this.field('angle').value = '0'; this.field('scale').value = '1';
    for (const option of this.mode.options) option.disabled = option.value === 'capture' ? !this.data.canCapture :
      ['objects', 'redact'].includes(option.value) ? !this.data.canContent : !this.data.canAnnotate;
    if (this.mode.selectedOptions[0]?.disabled) this.mode.value = [...this.mode.options].find(option => !option.disabled)?.value ?? '';
    this.canvas.width = this.data.image.width; this.canvas.height = this.data.image.height;
    this.field('title').textContent = `Strumenti · pagina ${this.pageIndex + 1} / ${editor.pages.length}`;
    this.reloadItems();
    this.field('previous').disabled = this.pageIndex === 0;
    this.field('next').disabled = this.pageIndex === editor.pages.length - 1;
  }
  reloadItems() {
    this.lastMode = this.mode.value;
    const objects = this.mode.value === 'objects', capture = this.mode.value === 'capture', redact = this.mode.value === 'redact';
    this.items.replaceChildren(new Option('Nuova selezione', ''));
    if (objects) this.data.objects.forEach(item => this.items.add(new Option(`${item.index + 1} · ${['', 'Testo', 'Tracciato', 'Immagine', 'Ombreggiatura', 'Gruppo'][item.type] ?? 'Oggetto'} ${item.text.slice(0, 45)}`, String(item.index))));
    else this.data.annotations.forEach((item, i) => this.items.add(new Option(`${i + 1} · ${item.type === 1 ? 'Nota: ' + item.contents.slice(0, 45) : 'Forma / disegno'}`, item.id)));
    this.field('object-controls').hidden = !objects;
    this.field('annotation-controls').hidden = objects || capture || redact;
    this.items.disabled = capture || redact;
    this.contents.value = ''; this.originalContents = '';
    this.field('apply').textContent = capture ? 'Salva cattura PNG' : redact ? 'Applica oscuramento' : 'Applica';
    this.field('delete').hidden = capture || redact;
    this.field('warning').hidden = !redact;
    this.status.textContent = objects ? 'Seleziona un oggetto sulla pagina o dall’elenco. I gruppi si modificano come oggetto unico.' :
      capture ? 'Trascina un’area o salva l’intera pagina. Il PDF resta invariato.' :
      redact ? 'Trascina l’area da eliminare, quindi applica. Prima di condividere salva il PDF risultante.' :
      'Nota: clicca sul punto desiderato. Forme e penna: trascina sulla pagina. Premi Applica per confermare.';
    this.paint();
  }
  selectItem() {
    this.region = null; this.points = [];
    const objects = this.mode.value === 'objects';
    const item = objects ? this.data.objects.find(o => String(o.index) === this.items.value) : this.data.annotations.find(a => a.id === this.items.value);
    this.contents.value = item?.contents ?? item?.text ?? ''; this.originalContents = this.contents.value;
    this.field('size').value = Math.min(144, Math.max(6, item?.size ?? 12));
    this.paint();
  }
  paint() {
    if (!this.data) return;
    const { image } = this.data, ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const object = this.mode.value === 'objects' ? this.data.objects.find(o => String(o.index) === this.items.value) : this.data.annotations.find(a => a.id === this.items.value);
    const p = this.region ?? object?.position;
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
    if (this.mode.value === 'capture') {
      try { this.emit('host.capture', { token: this.token, revision: this.revision,
        base64: pngFromImage(this.data.image, this.region, this.data), page: this.pageIndex + 1 }); }
      catch (error) { this.status.textContent = error.message; }
      return;
    }
    let input;
    if (this.mode.value === 'objects') {
      if (!this.items.value) { this.status.textContent = 'Seleziona un oggetto.'; return; }
      const operation = remove ? 'object-delete' : this.field('action').value;
      input = { operation, index: Number(this.items.value), contents: this.contents.value,
        font: this.field('font').value, size: Number(this.field('size').value),
        dx: Number(this.field('dx').value), dy: Number(this.field('dy').value), scale: Number(this.field('scale').value), angle: Number(this.field('angle').value) };
    } else if (this.items.value) {
      input = { operation: remove ? 'annotation-delete' : 'annotation-update', id: this.items.value, contents: this.contents.value };
    } else {
      if (remove) return;
      input = { operation: this.mode.value, region: this.region, points: this.points,
        contents: this.contents.value, color: this.field('color').value, stroke: Number(this.field('stroke').value) };
    }
    if (remove && !confirm('Eliminare l’elemento selezionato? Puoi annullare dalla cronologia.')) return;
    if (input.operation === 'redact' && !confirm('La pagina sarà ricostruita come immagine con l’area eliminata. Perderà testo selezionabile, moduli e annotazioni modificabili. Il PDF bonificato non conserverà allegati, metadati e segnalibri. Annulla resta disponibile nella sessione. Continuare?')) return;
    this.busy = true; this.toolbar.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
    try {
      await this.run(async () => { await editor.changeWorkbench({ pageIndex: this.pageIndex, token: this.token, revision: this.revision, input }); await this.load(); });
      this.status.textContent = 'Modifica applicata. Salva il PDF per conservarla.';
    } catch (error) { this.status.textContent = error.message; }
    finally {
      this.busy = false; this.toolbar.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; });
      this.items.disabled = ['capture', 'redact'].includes(this.mode.value);
      this.field('previous').disabled = this.pageIndex === 0;
      this.field('next').disabled = this.pageIndex === editor.pages.length - 1;
      for (const option of this.mode.options) option.disabled = option.value === 'capture' ? !this.data.canCapture :
        ['objects', 'redact'].includes(option.value) ? !this.data.canContent : !this.data.canAnnotate;
      this.notify();
    }
  }
}
