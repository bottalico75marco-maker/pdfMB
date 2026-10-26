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
  constructor({ editor, run, notify, emit, unavailable }) {
    Object.assign(this, { editor, run, notify, emit, unavailable });
    this.dialog = document.querySelector('#tools-dialog');
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
    this.dialog.querySelector('[data-tools-close]').onclick = () => this.close();
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.field('apply').onclick = () => this.apply();
    this.field('delete').onclick = () => this.apply(true);
    this.field('previous').onclick = () => this.navigate(-1);
    this.field('next').onclick = () => this.navigate(1);
    this.canvas.onpointerdown = event => {
      if (this.busy || this.unavailable() || event.button !== 0) return;
      const point = this.point(event); if (!point) return;
      if (this.mode.value === 'objects') {
        const found = [...this.data.objects].reverse().find(item => this.contains(item.position, point));
        this.items.value = found ? String(found.index) : ''; this.selectItem(); return;
      }
      this.items.value = ''; this.region = null; this.points = [point];
      this.drag = event.pointerId; this.canvas.setPointerCapture(event.pointerId);
    };
    this.canvas.onpointermove = event => {
      if (this.drag !== event.pointerId) return;
      const point = this.point(event); if (!point) return;
      if (this.mode.value === 'ink' && this.points.length < 10000) this.points.push(point);
      else this.points[1] = point;
      this.setRegion(); this.paint();
    };
    this.canvas.onpointerup = event => {
      if (this.drag !== event.pointerId) return;
      this.drag = null;
      if (this.mode.value === 'note' && this.points.length === 1) {
        const [x, y] = this.points[0]; this.region = { x: Math.min(x, this.data.width - 24), y: Math.min(y, this.data.height - 24), width: 24, height: 24 };
      } else this.setRegion();
      this.paint();
    };
    this.canvas.onpointercancel = () => { this.drag = null; this.region = null; this.points = []; this.paint(); };
  }
  contains(p, [x, y]) { return p && x >= p.x && y >= p.y && x <= p.x + p.width && y <= p.y + p.height; }
  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(this.data.width, (event.clientX - rect.left) * this.data.width / rect.width)),
      Math.max(0, Math.min(this.data.height, (event.clientY - rect.top) * this.data.height / rect.height))];
  }
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
    if (!force && this.dialog.open && this.changed() && !confirm('Scartare la selezione o il testo non ancora applicati?')) return false;
    this.dialog.close(); this.region = null; this.drag = null; return true;
  }
  async open(pageIndex, mode = 'note') {
    this.pageIndex = pageIndex; this.mode.value = mode;
    await this.load(); this.dialog.showModal(); this.canvas.focus();
  }
  async load() {
    const editor = this.editor();
    this.token = editor.token; this.revision = editor.revision;
    this.data = await editor.workbenchContext(this.pageIndex);
    this.region = null; this.points = []; this.drag = null;
    this.field('dx').value = this.field('dy').value = this.field('angle').value = '0'; this.field('scale').value = '1';
    for (const option of this.mode.options) option.disabled = option.value === 'capture' ? !this.data.canCapture :
      ['objects', 'redact'].includes(option.value) ? !this.data.canContent : !this.data.canAnnotate;
    if (this.mode.selectedOptions[0]?.disabled) this.mode.value = [...this.mode.options].find(option => !option.disabled)?.value ?? '';
    this.canvas.width = this.data.image.width; this.canvas.height = this.data.image.height;
    this.field('title').textContent = `Strumenti · pagina ${this.pageIndex + 1} / ${editor.pages.length}`;
    this.reloadItems();
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
    ctx.putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
    const object = this.mode.value === 'objects' ? this.data.objects.find(o => String(o.index) === this.items.value) : this.data.annotations.find(a => a.id === this.items.value);
    const p = this.region ?? object?.position;
    if (p) {
      ctx.strokeStyle = '#1266cc'; ctx.lineWidth = 2;
      ctx.strokeRect(p.x * image.width / this.data.width, p.y * image.height / this.data.height, p.width * image.width / this.data.width, p.height * image.height / this.data.height);
    }
  }
  async navigate(delta) {
    const next = this.pageIndex + delta;
    if (this.busy || next < 0 || next >= this.editor().pages.length || !this.close()) return;
    try { await this.run(async () => { this.pageIndex = next; await this.load(); this.dialog.showModal(); }); }
    catch (error) { this.status.textContent = error.message; }
  }
  async apply(remove = false) {
    if (this.busy || this.drag != null || this.unavailable()) return;
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
    this.busy = true; this.dialog.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
    try {
      await this.run(async () => { await editor.changeWorkbench({ pageIndex: this.pageIndex, token: this.token, revision: this.revision, input }); await this.load(); });
      this.status.textContent = 'Modifica applicata. Salva il PDF per conservarla.';
    } catch (error) { this.status.textContent = error.message; }
    finally {
      this.busy = false; this.dialog.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; });
      this.items.disabled = ['capture', 'redact'].includes(this.mode.value); this.notify();
    }
  }
}
