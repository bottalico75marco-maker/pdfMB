import { renderedPageHosts } from './viewer-page.mjs';
import { appendFormControl } from './form-controls.mjs';
import { fieldValueError } from './form-validation.mjs';

const styles = `
  :host { position:absolute; inset:0; z-index:12; pointer-events:none; overflow:hidden; }
  .plane { position:absolute; left:0; top:0; transform-origin:0 0; pointer-events:none; }
  .form-widget { position:absolute; box-sizing:border-box; pointer-events:auto; }
  input,textarea,select,button { box-sizing:border-box; font:inherit; }
  input:not([type=checkbox]),textarea,select,button[data-field] { display:block; width:100%; height:100%; margin:0; padding:2px 4px; border:1px solid #91b6e5; background:white; border-radius:0; resize:none; }
  input[type=checkbox] { width:100%; height:100%; margin:0; accent-color:#1d5eaa; cursor:pointer; }
  button[data-field] { background:#f5f8ff; cursor:pointer; overflow:hidden; }
  .form-image-upload img { width:100%; height:100%; display:block; object-fit:contain; }
  .form-image-remove { position:absolute; right:2px; top:2px; z-index:2; width:24px; height:24px; padding:0; color:#33465f; background:white; border:1px solid #91b6e5; border-radius:50%; cursor:pointer; }
  [aria-invalid=true] { outline:2px solid #bd2525; outline-offset:-2px; }
  input[hidden] { display:none; }
  input.form-date-picker { position:absolute; right:1px; top:1px; width:28px; height:calc(100% - 2px); padding:0; border:0; background:#eef4ff; color:transparent; z-index:1; font-size:14px; cursor:pointer; }
  .form-date-picker::-webkit-datetime-edit { display:none; }
  .form-date-picker::-webkit-calendar-picker-indicator { margin:0; padding:5px; cursor:pointer; }
  :disabled { cursor:default; }
`;

function activeElement() {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

// Managed fields are interactive in the normal viewer through the same editor
// transactions as the designer. The embedded viewer never keeps a second set
// of unsaved form values or executes a PDF email action itself.
export class FormReader {
  constructor(options) {
    Object.assign(this, options);
    this.entries = new Map(); this.pending = new Map(); this.lastScan = 0;
    const frame = time => {
      try {
        if (time - this.lastScan > 100) { this.lastScan = time; this.sync(); }
        for (const entry of this.entries.values()) this.layout(entry);
        this.restoreFocus();
      } finally { this.frame = requestAnimationFrame(frame); }
    };
    this.frame = requestAnimationFrame(frame);
  }
  get changed() { return this.pending.size > 0; }
  get textEditing() { return !!this.captureFocus(); }
  captureFocus() {
    const element = activeElement();
    if (!element?.dataset.field || ![...this.entries.values()].some(entry => entry.root?.contains(element))) return null;
    return { token: this.token, field: element.dataset.field, start: element.selectionStart, end: element.selectionEnd };
  }
  restoreFocus() {
    const focus = this.focus;
    if (!focus || focus.token !== this.editor()?.token || this.unavailable() || this.suspended()) return;
    const input = this.inputs().find(input => input.dataset.field === focus.field);
    if (!input || input.disabled) return;
    this.focus = null; input.focus({ preventScroll: true });
    if (typeof focus.start === 'number' && ['text', 'textarea'].includes(input.type)) input.setSelectionRange(focus.start, focus.end);
  }
  inputs() { return [...this.entries.values()].flatMap(entry => [...(entry.root?.querySelectorAll('[data-field]') ?? [])]); }
  action(fn, focus = null) {
    if (this.unavailable() || this.suspended()) return;
    this.focus = focus ?? this.captureFocus();
    return this.run(fn).catch(error => this.showError(error));
  }
  sync() {
    const editor = this.editor(), documentId = this.session.currentId;
    const signature = `${documentId}:${editor?.token}:${editor?.revision}`;
    if (signature !== this.signature) {
      for (const entry of this.entries.values()) entry.layer?.remove();
      this.entries.clear(); this.signature = signature;
      if (this.token !== editor?.token) { this.pending.clear(); this.focus = null; }
      this.token = editor?.token;
    }
    const hidden = this.suspended() || !editor || !documentId;
    for (const entry of this.entries.values()) if (entry.layer) { entry.layer.hidden = hidden; entry.layer.inert = this.unavailable(); }
    if (hidden || this.unavailable()) return;
    const indexes = this.plugin('scroll').forDocument(documentId).getMetrics().renderedPageIndexes;
    const hosts = renderedPageHosts(document.querySelector('#viewer'), true);
    if (hosts.length !== indexes.length) return;
    hosts.forEach((host, i) => {
      const pageIndex = indexes[i];
      if (!editor.pages[pageIndex]?.formFields?.length) return;
      const previous = this.entries.get(pageIndex);
      if (previous?.host === host) return;
      previous?.layer?.remove();
      const entry = { host, pageIndex, signature }; this.entries.set(pageIndex, entry);
      this.read(() => editor.formLayout(pageIndex)).then(data => {
        if (signature !== this.signature || !host.isConnected || this.entries.get(pageIndex) !== entry) return;
        entry.data = data; this.render(entry);
      }).catch(error => { if (signature === this.signature) this.showError(error); });
    });
    for (const [pageIndex, entry] of this.entries) if (!entry.host.isConnected) { entry.layer?.remove(); this.entries.delete(pageIndex); }
  }
  render(entry) {
    const layer = document.createElement('div'); layer.className = 'pdfmb-form-reader';
    Object.assign(layer.style, { position: 'absolute', inset: '0', zIndex: '12', pointerEvents: 'none', overflow: 'hidden' });
    const root = layer.attachShadow({ mode: 'open' }), style = document.createElement('style'); style.textContent = styles; root.append(style);
    const plane = document.createElement('div'); plane.className = 'plane'; root.append(plane);
    for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'keydown']) layer.addEventListener(type, event => event.stopPropagation());
    for (const type of ['focusin', 'focusout']) layer.addEventListener(type, () => queueMicrotask(() => this.notify()));
    entry.layer?.remove(); Object.assign(entry, { layer, root, plane });
    const data = entry.data;
    for (const field of data.fields) {
      const box = document.createElement('div'); box.className = 'form-widget'; box.dataset.id = field.id;
      const p = field.position;
      Object.assign(box.style, { left: `${p.x / data.width * 100}%`, top: `${p.y / data.height * 100}%`, width: `${p.width / data.width * 100}%`, height: `${p.height / data.height * 100}%` });
      appendFormControl(box, field, {
        value: this.pending.get(field.id)?.value ?? field.value, rotation: data.rotation, editable: !!this.editor().canFormDesign,
        onValue: (value, input) => {
          this.pending.set(field.id, { pageIndex: entry.pageIndex, value });
          const error = fieldValueError(field, value); input.setCustomValidity?.(error); input.setAttribute('aria-invalid', String(!!error)); this.notify();
        },
        onCommit: () => this.action(() => this.flush(field.id, true)),
        onDate: value => this.action(async () => { this.pending.set(field.id, { pageIndex: entry.pageIndex, value }); await this.flush(field.id); }),
        onUpload: read => this.action(async () => { const value = await read(); await this.flush(); this.pending.set(field.id, { pageIndex: entry.pageIndex, value }); await this.flush(field.id); }),
        onEmail: async () => {
          let ready = false;
          await this.action(async () => {
            await this.flush();
            for (const f of this.editor().pages.flatMap(page => page.formFields ?? [])) {
              const error = fieldValueError(f, f.value, true); if (error) throw new Error(`${f.label || f.name}: ${error}`);
            }
            ready = true;
          });
          if (ready) this.emit('host.formEmail', { token: this.token, fieldId: field.id });
        },
        onKeyDown: (event, input) => {
          if (event.key === 'Escape' && this.pending.has(field.id)) {
            event.preventDefault(); this.pending.delete(field.id); input.value = field.value; input.setCustomValidity?.(''); input.setAttribute('aria-invalid', 'false'); this.notify();
          }
          if (event.key !== 'Tab' || event.ctrlKey || event.altKey || this.unavailable()) return;
          const inputs = this.inputs().filter(input => !input.disabled), next = inputs[inputs.indexOf(input) + (event.shiftKey ? -1 : 1)];
          if (!next) return;
          event.preventDefault(); this.action(() => this.flush(field.id, true), { token: this.token, field: next.dataset.field });
        }
      });
      plane.append(box);
    }
    layer.hidden = this.suspended(); layer.inert = this.unavailable(); entry.host.append(layer); this.layout(entry);
  }
  layout(entry) {
    if (!entry.plane || !entry.host.isConnected) return;
    const { width: w, height: h } = entry.data, r = this.plugin('rotate').forDocument(this.session.currentId).getRotation() & 3;
    const scale = entry.host.getBoundingClientRect().width / (r % 2 ? h : w);
    const matrices = [[scale, 0, 0, scale, 0, 0], [0, scale, -scale, 0, h * scale, 0], [-scale, 0, 0, -scale, w * scale, h * scale], [0, -scale, scale, 0, 0, w * scale]];
    Object.assign(entry.plane.style, { width: `${w}px`, height: `${h}px`, transform: `matrix(${matrices[r].join(',')})` });
  }
  async flush(id = null, showAlert = false) {
    const records = id ? [[id, this.pending.get(id)]] : [...this.pending];
    for (const [fieldId, record] of records) {
      if (!record) continue;
      const editor = this.editor(), field = editor?.pages[record.pageIndex]?.formFields?.find(f => f.id === fieldId);
      if (!field || editor.token !== this.token) throw new Error('Il documento è cambiato durante la compilazione.');
      const error = fieldValueError(field, record.value);
      if (error) { if (showAlert) alert(error); throw new Error(error); }
      await editor.changeForm({ token: editor.token, revision: editor.revision, pageIndex: record.pageIndex, input: { id: fieldId, value: record.value }, fillOnly: true });
      this.pending.delete(fieldId);
    }
  }
}
