import { installFormIcons } from './form-icons.mjs';
const $ = id => document.querySelector('#form-' + id);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const clone = v => structuredClone(v);

export class FormSurface {
  constructor(options) {
    Object.assign(this, options);
    this.root = $('workspace'); this.toolbar = $('toolbar'); this.sheet = $('sheet'); this.layer = $('fields'); this.canvas = $('canvas');
    this.pageIndex = 0; this.tool = 'select'; this.zoom = 1; this.active = false;
    installFormIcons(this.toolbar); installFormIcons($('properties'));
    for (const button of this.toolbar.querySelectorAll('[data-tool]')) button.onclick = () => this.action(async () => { await this.flush(); this.tool = button.dataset.tool; this.controls(); });
    $('preview').onclick = () => this.action(async () => { await this.flush(); this.preview = !this.preview; this.tool = 'select'; this.draft = null; this.controls(); this.renderFields(); });
    $('exit').onclick = () => this.action(async () => { await this.flush(); this.close(); });
    $('apply').onclick = () => this.action(() => this.flush());
    $('cancel').onclick = () => { this.draft = null; this.pending = false; this.controls(); this.renderFields(); this.notify(); };
    $('delete').onclick = () => this.action(async () => {
      if (!this.draft) return;
      if (!this.isNew) await this.commit({ ...this.payload(this.draft), remove: true });
      this.draft = null; this.pending = false; await this.refresh();
    });
    for (const [id, command] of [['save', 'host.save'], ['saveAs', 'host.saveAs']]) $(id).onclick = () => this.emit(command);
    for (const [id, change] of [['undo', 'undo'], ['redo', 'redo']]) $(id).onclick = () => this.action(async () => { await this.flush(); await this.editor()[change](); this.draft = null; await this.refresh(); });
    for (const [id, delta] of [['previous', -1], ['next', 1]]) $(id).onclick = () => this.action(async () => { await this.flush(); this.pageIndex += delta; this.draft = null; await this.refresh(); });
    for (const [id, delta] of [['zoomIn', .25], ['zoomOut', -.25]]) $(id).onclick = () => { this.zoom = clamp(this.zoom + delta, .5, 3); this.layout(); };
    $('fit').onclick = () => { this.zoom = 1; this.layout(); };
    for (const input of $('properties').querySelectorAll('input,select,textarea')) input.addEventListener('input', () => {
      if (!this.draft || this.preview || this.unavailable()) return;
      this.readProperties(input.id); this.pending = true; this.renderFields(); this.notify();
    });
    this.sheet.addEventListener('pointerdown', event => this.pointerDown(event));
    this.sheet.addEventListener('pointermove', event => this.pointerMove(event));
    this.sheet.addEventListener('pointerup', event => this.pointerUp(event));
    this.sheet.addEventListener('pointercancel', () => { this.drag = null; this.renderFields(); this.notify(); });
    document.addEventListener('keydown', event => {
      if (!this.active || this.unavailable()) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (this.drag) { this.drag = null; this.renderFields(); this.notify(); }
        else if (this.pendingValue) { this.pendingValue = false; this.valueDraft = null; this.renderFields(); this.notify(); }
        else if (this.pending) { this.draft = null; this.pending = false; this.controls(); this.renderFields(); this.notify(); }
        else this.action(async () => { await this.flush(); this.close(); });
      }
      if (event.key === 'Delete' && !event.target.matches('input,textarea,select')) { event.preventDefault(); $('delete').click(); }
      if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); $('apply').click(); }
    }, true);
    new ResizeObserver(() => this.layout()).observe($('pages'));
    for (const type of ['focusin', 'focusout']) this.root.addEventListener(type, () => queueMicrotask(() => this.notify()));
  }
  get textEditing() { return this.active && this.root.contains(document.activeElement) && document.activeElement.matches('input,textarea,select'); }
  captureFocus() {
    const element = document.activeElement;
    if (!this.active || !(this.root.contains(element) || this.toolbar.contains(element))) return null;
    return { token: this.token, field: element.dataset.field, id: element.id, start: element.selectionStart, end: element.selectionEnd };
  }
  restoreFocus(focus) {
    if (!focus || !this.active || focus.token !== this.token || this.unavailable()) return;
    const element = focus.field ? [...this.layer.querySelectorAll('[data-field]')].find(input => input.dataset.field === focus.field) : document.getElementById(focus.id);
    if (!element || element.disabled || element.closest('[hidden]')) return;
    element.focus({ preventScroll: true });
    if (typeof focus.start === 'number' && element.type !== 'checkbox') element.setSelectionRange?.(focus.start, focus.end);
  }
  status(message) { $('status').textContent = message; }
  action(fn, focus = null) {
    if (this.unavailable() || this.drag || this.busy) return;
    return this.run(async () => { try { await fn(); } finally { this.notify(); } }, focus).catch(error => { this.status(error.message); this.showError(error); });
  }
  async open() {
    const startingPage = this.currentPage();
    this.active = true; this.token = this.editor().token; this.preview = false; this.pending = false;
    this.pageIndex = Math.max(0, startingPage - 1); this.draft = null; this.tool = 'select';
    document.body.classList.add('form-mode'); this.root.hidden = this.toolbar.hidden = false;
    await this.refresh(); $('select').focus();
  }
  close() {
    this.active = false; this.draft = null; this.pending = false; this.pendingValue = false; this.valueDraft = null; this.drag = null;
    this.root.hidden = this.toolbar.hidden = true; document.body.classList.remove('form-mode'); this.notify();
  }
  sync() {
    if (this.active && this.token !== this.editor()?.token) this.close();
    if (!this.active) return;
    this.toolbar.inert = this.root.inert = this.unavailable() || !!this.busy;
    const e = this.editor(); $('undo').disabled = !e?.past.length; $('redo').disabled = !e?.future.length;
    $('save').disabled = !e?.dirty && !this.pending && !this.pendingValue;
  }
  async refresh() {
    if (!this.active) return;
    this.pageIndex = clamp(this.pageIndex, 0, this.editor().pages.length - 1);
    this.data = await this.editor().formContext(this.pageIndex);
    const image = this.data.image;
    this.canvas.width = image.width; this.canvas.height = image.height;
    this.canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
    if (this.draft && !this.pending) this.draft = clone(this.data.fields.find(f => f.id === this.draft.id) ?? null);
    this.controls(); this.renderFields(); this.layout();
    this.onPage(this.pageIndex);
  }
  controls() {
    $('mode').textContent = this.preview ? 'Compila modulo' : 'Progetta modulo';
    $('preview').setAttribute('aria-pressed', String(!!this.preview));
    for (const button of this.toolbar.querySelectorAll('[data-tool]')) { button.hidden = !!this.preview; button.setAttribute('aria-pressed', String(button.dataset.tool === this.tool)); }
    $('page').textContent = `${this.pageIndex + 1} / ${this.editor().pages.length}`;
    $('previous').disabled = this.pageIndex === 0; $('next').disabled = this.pageIndex === this.editor().pages.length - 1;
    $('properties').hidden = !!this.preview; $('delete').hidden = !!this.preview; $('delete').disabled = !this.draft;
    $('empty').hidden = !!this.draft; $('property-fields').hidden = !this.draft;
    $('apply').disabled = !this.draft; $('cancel').disabled = !this.draft;
    if (this.draft) {
      const f = this.draft;
      for (const key of ['name', 'label', 'font', 'size', 'color', 'maxLength']) $(key).value = f[key];
      $('defaultValue').value = f.kind === 'text' ? f.defaultValue : '';
      for (const key of ['multiline', 'readOnly', 'required']) $(key).checked = !!f[key];
      $('defaultChecked').checked = f.kind === 'checkbox' && f.defaultValue;
      $('text-properties').hidden = f.kind !== 'text'; $('check-properties').hidden = f.kind !== 'checkbox';
      for (const key of ['x', 'y', 'width', 'height']) $(key).value = Math.round(f.position[key] * 10) / 10;
    }
    this.status(this.preview ? 'Compila i campi. I valori vengono conservati con Salva.' : this.tool === 'select' ? 'Seleziona un campo per modificarlo. Trascina il bordo per spostarlo.' : 'Trascina sulla pagina per inserire il campo.');
  }
  readProperties(changed) {
    const f = this.draft;
    for (const key of ['name', 'label', 'font', 'color']) f[key] = $(key).value;
    for (const key of ['size', 'maxLength']) f[key] = Number($(key).value);
    for (const key of ['multiline', 'readOnly', 'required']) f[key] = $(key).checked;
    f.defaultValue = f.kind === 'checkbox' ? $('defaultChecked').checked : $('defaultValue').value.replace(/\r\n?/g, '\n');
    if (['form-defaultValue', 'form-defaultChecked'].includes(changed)) f.value = f.defaultValue;
    f.position = Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, Number($(k).value)]));
  }
  payload(input) { return { token: this.token, revision: this.editor().revision, pageIndex: this.pageIndex, input }; }
  async flush() {
    if (!this.active) return;
    if (this.drag) throw new Error('Terminare il trascinamento del campo.');
    this.busy = true; this.notify();
    try {
      await this.flushValue();
      if (this.pending && this.draft) {
        await this.commit(this.payload(clone(this.draft)));
        this.pending = false; this.isNew = false; await this.refresh();
      }
    } finally { this.busy = false; this.notify(); }
  }
  layout() {
    if (!this.active || !this.data) return;
    const container = $('pages');
    this.scale = Math.min((container.clientWidth - 56) / this.data.width, 1.6) * this.zoom;
    this.scale = Math.max(.2, this.scale);
    this.sheet.style.width = `${this.data.width * this.scale}px`; this.sheet.style.height = `${this.data.height * this.scale}px`;
    this.renderFields();
  }
  renderFields() {
    if (!this.data) return;
    const focus = this.layer.contains(document.activeElement) ? document.activeElement.dataset.field : null;
    this.layer.replaceChildren();
    const fields = [...this.data.fields.filter(f => f.id !== this.draft?.id), ...(this.draft ? [this.draft] : [])];
    for (const f of fields) {
      const p = this.drag?.id === f.id ? this.drag.position : f.position;
      const box = document.createElement('div'); box.className = 'form-widget' + (f.id === this.draft?.id && !this.preview ? ' selected' : '');
      box.dataset.id = f.id; Object.assign(box.style, { left: `${p.x / this.data.width * 100}%`, top: `${p.y / this.data.height * 100}%`, width: `${p.width / this.data.width * 100}%`, height: `${p.height / this.data.height * 100}%` });
      if (this.preview) {
        const input = document.createElement(f.kind === 'text' && f.multiline ? 'textarea' : 'input');
        input.dataset.field = f.id; input.setAttribute('aria-label', f.label || f.name); input.title = f.label || f.name;
        const value = this.pendingValue && this.valueDraft?.id === f.id ? this.valueDraft.value : f.value;
        if (f.kind === 'checkbox') { input.type = 'checkbox'; input.checked = value; } else { input.value = value; input.maxLength = f.maxLength; }
        input.disabled = !!f.readOnly;
        input.setAttribute('aria-required', String(!!f.required));
        Object.assign(input.style, { fontFamily: { Helvetica: 'Arial', Times: 'Times New Roman', Courier: 'Courier New' }[f.font], fontSize: `${f.size * (this.scale || 1)}px`, color: f.color });
        const angle = ((this.data.rotation * 90 - (f.rotation ?? 0)) % 360 + 360) % 360;
        if (angle && f.kind === 'text') Object.assign(input.style, { position: 'absolute', left: '50%', top: '50%',
          width: `${(angle % 180 ? p.height : p.width) * this.scale}px`, height: `${(angle % 180 ? p.width : p.height) * this.scale}px`, transform: `translate(-50%, -50%) rotate(${angle}deg)` });
        input.addEventListener('input', () => { this.valueDraft = { id: f.id, value: f.kind === 'checkbox' ? input.checked : input.value }; this.pendingValue = true; this.notify(); });
        input.addEventListener('change', () => this.action(() => this.flushValue()));
        input.addEventListener('keydown', event => {
          if (event.key !== 'Tab' || event.ctrlKey || event.altKey || this.unavailable()) return;
          event.preventDefault();
          const inputs = [...this.layer.querySelectorAll('input,textarea')].filter(node => !node.disabled);
          const next = inputs[inputs.indexOf(input) + (event.shiftKey ? -1 : 1)];
          const focus = next ? { token: this.token, field: next.dataset.field } : { token: this.token, id: event.shiftKey ? 'form-exit' : 'form-preview' };
          this.action(() => this.flushValue(), focus);
        });
        box.append(input);
      } else {
        box.tabIndex = 0; box.setAttribute('role', 'button'); box.setAttribute('aria-label', `${f.kind === 'text' ? 'Campo testo' : 'Casella di spunta'}: ${f.name}`);
        const label = document.createElement('span'); label.textContent = `${f.kind === 'checkbox' ? '☑' : 'T'} ${f.name}`; box.append(label);
        box.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.action(async () => { await this.flush(); this.draft = clone(f); this.isNew = false; this.controls(); this.renderFields(); }); } };
        if (f.id === this.draft?.id) { const handle = document.createElement('i'); handle.className = 'form-resize'; box.append(handle); }
      }
      this.layer.append(box);
    }
    if (this.drag?.creating) {
      const r = this.drag.position, box = document.createElement('div'); box.className = 'form-widget selected form-drawing';
      Object.assign(box.style, { left: `${r.x / this.data.width * 100}%`, top: `${r.y / this.data.height * 100}%`, width: `${r.width / this.data.width * 100}%`, height: `${r.height / this.data.height * 100}%` }); this.layer.append(box);
    }
    if (focus) this.layer.querySelector(`[data-field="${focus}"]`)?.focus();
  }
  async flushValue() {
    if (!this.pendingValue) return;
    const value = clone(this.valueDraft);
    await this.commit({ ...this.payload(value), fillOnly: true });
    this.pendingValue = false; this.valueDraft = null; await this.refresh();
  }
  point(event) { const r = this.sheet.getBoundingClientRect(); return { x: clamp((event.clientX - r.left) / r.width * this.data.width, 0, this.data.width), y: clamp((event.clientY - r.top) / r.height * this.data.height, 0, this.data.height) }; }
  pointerDown(event) {
    if (event.button !== 0 || this.preview || this.unavailable() || this.drag || this.pending) return;
    const target = event.target.closest('[data-id]'), f = this.data.fields.find(f => f.id === target?.dataset.id);
    if (f) { this.draft = clone(f); this.isNew = false; this.controls(); }
    else if (this.tool === 'select') { this.draft = null; this.controls(); this.renderFields(); return; }
    const start = this.point(event), original = f?.position;
    this.drag = { id: f?.id, start, original, position: original ? clone(original) : { ...start, width: 0, height: 0 }, creating: !f, resize: event.target.classList.contains('form-resize') };
    this.sheet.setPointerCapture(event.pointerId); event.preventDefault(); this.renderFields(); this.notify();
  }
  pointerMove(event) {
    const d = this.drag; if (!d) return; const p = this.point(event), dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.creating) d.position = { x: Math.min(p.x, d.start.x), y: Math.min(p.y, d.start.y), width: Math.abs(dx), height: Math.abs(dy) };
    else if (d.resize) d.position = { ...d.original, width: clamp(d.original.width + dx, 12, this.data.width - d.original.x), height: clamp(d.original.height + dy, 12, this.data.height - d.original.y) };
    else d.position = { ...d.original, x: clamp(d.original.x + dx, 0, this.data.width - d.original.width), y: clamp(d.original.y + dy, 0, this.data.height - d.original.height) };
    this.renderFields();
  }
  pointerUp(event) {
    const d = this.drag; if (!d) return; this.pointerMove(event); this.drag = null; this.sheet.releasePointerCapture(event.pointerId);
    if (d.creating) {
      if (d.position.width < 12 || d.position.height < 12) { this.renderFields(); this.notify(); return; }
    const names = new Set([...(this.editor().policy.externalFormNames ?? []), ...this.editor().pages.flatMap(p => p.formFields ?? []).map(f => f.name)]);
      const prefix = this.tool === 'checkbox' ? 'spunta' : 'testo'; let n = 1; while (names.has(`${prefix}_${n}`)) n++;
      this.draft = { id: 'pdfmb-f-' + crypto.randomUUID(), kind: this.tool, name: `${prefix}_${n}`, label: '', value: this.tool === 'checkbox' ? false : '', defaultValue: this.tool === 'checkbox' ? false : '',
        font: 'Helvetica', size: 12, color: '#202020', maxLength: 1000, multiline: false, readOnly: false, required: false, position: d.position };
      this.isNew = true;
    } else {
      this.draft.position = d.position;
      if (JSON.stringify(d.position) === JSON.stringify(d.original)) { this.controls(); this.renderFields(); this.notify(); return; }
    }
    this.pending = true; this.tool = 'select'; this.controls(); this.renderFields(); this.notify();
  }
}
