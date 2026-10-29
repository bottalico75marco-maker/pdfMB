import { textLayout } from './text-layout.mjs';

const families = { Helvetica: 4, Times: 8, Courier: 0 };
const fontCss = { Helvetica: 'Arial, sans-serif', Times: '"Times New Roman", serif', Courier: '"Courier New", monospace' };
const clone = value => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const inputTarget = target => target instanceof HTMLElement &&
  (target.matches('input,textarea,select') || target.isContentEditable);
// A block the user never sized wraps only at the page edge, which the worker
// resolves. Its own glyph width is not a wrap the user ever asked for.
const UNBOUNDED = 1e6;

export class TextSurface {
  constructor({ editor, plugin, session, read, apply, run, notify, unavailable, onPage, onView }) {
    Object.assign(this, { editor, plugin, session, read, apply, run, notify, unavailable, onPage, onView });
    this.toolbar = document.querySelector('#text-toolbar');
    this.surface = document.querySelector('#text-surface');
    this.message = document.querySelector('#text-status');
    this.list = document.querySelector('#text-existing');
    this.family = document.querySelector('#text-font');
    this.size = document.querySelector('#text-size');
    this.color = document.querySelector('#text-color');
    this.bold = document.querySelector('#text-bold');
    this.italic = document.querySelector('#text-italic');
    this.zoom = document.querySelector('#text-zoom');
    this.menu = document.querySelector('#text-context-menu');
    this.menuCopy = document.querySelector('#text-context-copy');
    this.menuPaste = document.querySelector('#text-context-paste');
    this.menuRequest = 0;
    this.records = new Map(); this.queue = []; this.generation = 0; this.currentPage = 0;
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) this.wantPage(Number(entry.target.dataset.index));
    }, { root: this.surface, rootMargin: '300px' });
    document.querySelector('#text-new').onclick = async () => {
      if (!this.active) this.toggle(true);
      if (!await this.commit(false)) return;
      this.creating = true; this.updateControls();
      this.status('Trascina sulla pagina per disegnare la nuova casella.');
    };
    document.querySelector('#text-cancel').onclick = () => this.cancel();
    this.menuCopy.onclick = () => {
      if (!this.menuContext || this.menuContext.generation !== this.generation || this.unavailable()) return;
      if (!this.copyBox()) return;
      // Keep focus on the menu command while emitting copy, so the complete
      // box is copied even if its text field was previously being edited.
      if (!document.execCommand('copy')) this.status('Casella copiata. Tasto destro sulla pagina → Incolla.');
      this.hideMenu(true);
    };
    this.menuPaste.onclick = () => {
      const context = this.menuContext;
      this.hideMenu();
      if (!context || context.generation !== this.generation || this.unavailable()) return;
      // Menu pointer movements must not change the insertion point captured
      // by the original right-click on the page.
      this.pointer = clone(context.point);
      this.pasteBox();
    };
    this.menu.onkeydown = event => {
      const buttons = [...this.menu.querySelectorAll('button:not(:disabled):not([hidden])')];
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement);
      let next;
      if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
      if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next !== undefined) { event.preventDefault(); buttons[next].focus(); }
    };
    document.querySelector('#text-delete').onclick = () => this.commit(true);
    document.querySelector('#text-smaller').onclick = () => this.resizeFont(-1);
    document.querySelector('#text-larger').onclick = () => this.resizeFont(1);
    this.bold.onclick = () => this.toggleStyle(this.bold);
    this.italic.onclick = () => this.toggleStyle(this.italic);
    for (const field of [this.family, this.size, this.color]) field.oninput = () => this.styleChanged();
    this.list.onchange = async () => {
      const index = this.currentPage, id = this.list.value;
      await this.leaveAndSelect(index, id);
    };
    this.zoom.onchange = () => { this.cancelDrag(); this.layout(); };
    this.surface.addEventListener('scroll', () => {
      this.hideMenu();
      this.pointer = null;
      if (this.scrollFrame) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = null; this.trackPage();
      });
    }, { passive: true });
    this.surface.addEventListener('pointerleave', () => { if (!this.drag) this.pointer = null; });
    this.surface.addEventListener('pointercancel', () => this.cancelDrag());
    window.addEventListener('blur', () => { this.hideMenu(); this.cancelDrag(); });
    window.addEventListener('resize', () => this.hideMenu());
    document.addEventListener('pointerdown', event => {
      if (!this.menu.contains(event.target)) this.hideMenu();
    }, true);
    // Toolbar and context-menu focus belong to the same editing interaction.
    // Delay focus checks until pointerdown has established any active drag.
    const leaveField = () => setTimeout(() => this.commitOnLeave(), 0);
    this.surface.addEventListener('focusout', leaveField);
    this.toolbar.addEventListener('focusout', leaveField);
    window.addEventListener('blur', leaveField);
    document.addEventListener('copy', event => this.copyEvent(event));
    document.addEventListener('paste', event => this.pasteEvent(event));
    document.addEventListener('keydown', event => this.keydown(event), true);
    new ResizeObserver(() => this.layout()).observe(this.surface);
  }
  get textEditing() { return this.active; }
  get pending() { return !!this.drag || this.changed(); }
  get busy() { return !!this.drag || !!this.committing; }
  changed() { return !!this.selected && JSON.stringify(this.selected.input) !== this.selected.initial; }
  status(message) { this.message.textContent = message; }
  sync() {
    const editor = this.editor();
    const token = editor?.token, revision = editor?.revision;
    if (token !== this.token || revision !== this.revision) {
      const changedDocument = token !== this.token;
      this.token = token; this.revision = revision;
      if (changedDocument) { this.active = false; this.pointer = null; this.selected = null; this.pasting = null; this.reselect = null; this.owedCommit = false; }
      this.invalidate();
    }
    if (!editor?.canTextEdit && this.active && !this.selected) this.active = false;
    if (!this.active || this.unavailable()) this.hideMenu();
    const visibilityChanged = this.toolbar.hidden === !!(editor && this.active);
    this.toolbar.hidden = !editor || !this.active;
    this.surface.hidden = !this.active;
    document.querySelector('#viewer').style.visibility = this.active ? 'hidden' : '';
    if (visibilityChanged) this.layout();
    this.updateControls();
    if (this.owedCommit) this.commitOnLeave();
    if (this.reselect && this.active && !this.selected && !this.drag && !this.committing && !this.unavailable()) this.restoreSelection();
    this.pump();
  }
  toggle(force, fromHost = false) {
    const active = force ?? !this.active;
    if ((active && !this.editor()?.canTextEdit) || (!fromHost && this.unavailable())) return;
    if (!active && !this.deselect()) return;
    this.active = active; this.creating = false;
    if (active) {
      this.currentPage = Math.max(0, this.plugin('scroll').forDocument(this.session.currentId).getCurrentPage() - 1);
      this.build();
      requestAnimationFrame(() => this.records.get(this.currentPage)?.element.scrollIntoView({ block: 'start' }));
      this.status('Clicca sul testo esistente per modificarlo. Clicca o trascina in uno spazio vuoto per inserire testo. I frammenti vicini e compatibili formano un solo blocco; Salva aggiorna il PDF.');
    }
    this.sync(); this.notify();
  }
  invalidate() {
    this.hideMenu();
    const scrollTop = this.surface.scrollTop, scrollLeft = this.surface.scrollLeft;
    this.cancelDrag(false); this.selected = null; this.pointer = null;
    this.generation++; this.queue = []; this.observer.disconnect();
    for (const record of this.records.values()) for (const resolve of record.waiters ?? []) resolve(null);
    this.records.clear(); this.surface.replaceChildren();
    if (this.active && this.editor()) {
      this.currentPage = clamp(this.plugin('scroll').forDocument(this.session.currentId).getCurrentPage() - 1, 0, this.editor().pages.length - 1);
      this.build(); this.surface.scrollTop = scrollTop; this.surface.scrollLeft = scrollLeft;
    }
  }
  build() {
    if (this.records.size || !this.editor()) return;
    const pdf = this.plugin('document-manager').getDocument(this.session.currentId);
    this.editor().pages.forEach((_, index) => {
      const element = document.createElement('section');
      element.className = 'text-document-page'; element.dataset.index = String(index);
      element.setAttribute('aria-label', `Pagina ${index + 1}`);
      const plane = document.createElement('div'); plane.className = 'text-page-plane';
      const label = document.createElement('span'); label.className = 'text-page-loading'; label.textContent = `Pagina ${index + 1} · caricamento…`;
      plane.append(label); element.append(plane); this.surface.append(element);
      const record = { element, plane, width: pdf.pages[index].size.width, height: pdf.pages[index].size.height };
      this.records.set(index, record);
      plane.onpointerdown = event => this.pointerDown(index, event);
      plane.onpointermove = event => this.pointerMove(index, event);
      plane.onpointerup = event => this.pointerUp(index, event);
      plane.onlostpointercapture = () => { if (this.drag?.index === index) this.cancelDrag(); };
      plane.oncontextmenu = event => { this.showContextMenu(index, event); };
      this.observer.observe(element);
    });
    this.layout(); this.wantPage(this.currentPage, true);
  }
  wantPage(index, priority = false) {
    const record = this.records.get(index);
    if (!record || record.context || record.loading || this.queue.includes(index)) return;
    if (priority) this.queue.unshift(index); else this.queue.push(index);
    this.pump();
  }
  async pump() {
    if (this.loading || !this.active || this.unavailable() || !this.queue.length) return;
    this.loading = true;
    const index = this.queue.shift(), record = this.records.get(index), generation = this.generation;
    if (!record) { this.loading = false; return this.pump(); }
    record.loading = true;
    try {
      const context = await this.read(index);
      if (generation !== this.generation || !this.active) return;
      record.context = context; record.width = context.width; record.height = context.height;
      record.plane.replaceChildren();
      record.canvas = document.createElement('canvas'); record.canvas.className = 'text-page-canvas';
      record.layer = document.createElement('div'); record.layer.className = 'text-boxes-layer';
      record.plane.append(record.canvas, record.layer); this.draw(record, context.image);
      this.drawBoxes(index); this.layout(); this.updateList(); this.trim();
    } catch (error) { if (generation === this.generation) this.status(error.message); }
    finally {
      for (const resolve of record.waiters ?? []) resolve(generation === this.generation ? record.context : null);
      record.waiters = []; record.loading = false; this.loading = false; if (this.queue.length) this.pump();
    }
  }
  async leaveAndSelect(index, id, point = null) {
    if (!await this.commit(false)) return;
    this.reselect = null;
    if ((!id && !point) || !this.active) return;
    const record = await this.pageContext(index);
    if (!record) return;
    // Content blocks are addressed by object index, which applying an edit
    // renumbers, so fall back to the block the pointer actually hit: without
    // it the click was swallowed and the user had to click a second time.
    const note = record.context.notes.find(note => note.id === id) ?? (point && this.noteAt(record, point));
    if (note) await this.select(index, note, true);
  }
  async pageContext(index) {
    const record = this.records.get(index);
    if (!record) return null;
    if (!record.context) {
      const ready = new Promise(resolve => (record.waiters ??= []).push(resolve));
      this.wantPage(index, true);
      if (!await ready) return null;
    }
    return this.records.get(index)?.context ? this.records.get(index) : null;
  }
  noteAt(record, point) {
    const hit = record.context.notes.filter(note => point.x >= note.position.x && point.y >= note.position.y &&
      point.x <= note.position.x + note.position.width && point.y <= note.position.y + note.position.height);
    // Prefer the tightest block wherever padded boxes still touch.
    return hit.sort((a, b) => a.position.width * a.position.height - b.position.width * b.position.height)[0] ?? null;
  }
  // The applied block is found again by its text and the place it was applied.
  async restoreSelection() {
    const hint = this.reselect;
    if (this.restoring || !hint) return;
    this.restoring = true;
    try {
      const record = await this.pageContext(hint.index);
      if (this.reselect !== hint) return;
      this.reselect = null;
      if (!record || this.selected || this.drag || !this.active || this.unavailable()) return;
      const flat = value => value.replace(/\s+/g, ' ').trim();
      const centre = p => [p.x + p.width / 2, p.y + p.height / 2];
      const [x, y] = centre(hint.position);
      const distance = note => Math.hypot(centre(note.position)[0] - x, centre(note.position)[1] - y);
      const note = record.context.notes.filter(note => flat(note.contents) === flat(hint.contents) &&
        Math.min(note.position.x + note.position.width, hint.position.x + hint.position.width) > Math.max(note.position.x, hint.position.x) &&
        Math.min(note.position.y + note.position.height, hint.position.y + hint.position.height) > Math.max(note.position.y, hint.position.y))
        .sort((a, b) => distance(a) - distance(b))[0];
      if (note) await this.select(hint.index, note);
    } finally { this.restoring = false; }
  }
  trim() {
    if ([...this.records.values()].filter(record => record.context).length <= 8) return;
    const viewport = this.surface.getBoundingClientRect();
    const candidates = [...this.records].filter(([index, record]) => {
      const rect = record.element.getBoundingClientRect();
      return record.context && index !== this.currentPage && index !== this.selected?.index &&
        (rect.bottom < viewport.top - 300 || rect.top > viewport.bottom + 300);
    });
    candidates.sort(([a], [b]) => Math.abs(b - this.currentPage) - Math.abs(a - this.currentPage));
    const [index, record] = candidates[0] ?? [];
    if (!record) return;
    record.context = null; record.canvas = record.layer = null; record.plane.replaceChildren();
    const label = document.createElement('span'); label.className = 'text-page-loading'; label.textContent = `Pagina ${index + 1}`; record.plane.append(label);
    this.observer.unobserve(record.element); this.observer.observe(record.element);
  }
  rotation() { return this.session.currentId ? this.plugin('rotate').forDocument(this.session.currentId).getRotation() & 3 : 0; }
  layout() {
    if (!this.active || !this.records.size) return;
    const rotation = this.rotation();
    let maximum = 1;
    for (const record of this.records.values()) maximum = Math.max(maximum, rotation % 2 ? record.height : record.width);
    this.scale = this.zoom.value === 'fit' ? Math.max(.1, Math.min(2, (this.surface.clientWidth - 64) / maximum)) : Number(this.zoom.value);
    for (const record of this.records.values()) {
      const { width: w, height: h } = record, s = this.scale;
      record.element.style.width = `${(rotation % 2 ? h : w) * s}px`;
      record.element.style.height = `${(rotation % 2 ? w : h) * s}px`;
      record.plane.style.width = `${w}px`; record.plane.style.height = `${h}px`;
      const matrices = [[s, 0, 0, s, 0, 0], [0, s, -s, 0, h * s, 0], [-s, 0, 0, -s, w * s, h * s], [0, -s, s, 0, 0, w * s]];
      record.plane.style.transform = `matrix(${matrices[rotation].join(',')})`;
      record.plane.style.setProperty('--handle-size', `${9 / s}px`);
    }
    this.onView();
  }
  viewState() {
    const record = this.records.get(this.currentPage);
    if (!this.active || !record) return null;
    return { page: this.currentPage + 1, pageCount: this.editor().pages.length, zoom: this.scale ?? 1,
      widthMm: Math.round(record.width * 25.4 / 72), heightMm: Math.round(record.height * 25.4 / 72) };
  }
  point(index, event) {
    const record = this.records.get(index), rect = record.element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / this.scale, y = (event.clientY - rect.top) / this.scale;
    const points = [[x, y], [y, record.height - x], [record.width - x, record.height - y], [record.width - y, x]];
    const [px, py] = points[this.rotation()];
    return { x: clamp(px, 0, record.width), y: clamp(py, 0, record.height) };
  }
  trackPage() {
    const top = this.surface.getBoundingClientRect().top + 80;
    let best = this.currentPage, distance = Infinity;
    for (const [index, record] of this.records) {
      const rect = record.element.getBoundingClientRect();
      const d = top < rect.top ? rect.top - top : top > rect.bottom ? top - rect.bottom : 0;
      if (d < distance) { best = index; distance = d; }
    }
    if (best !== this.currentPage) { this.currentPage = best; this.onPage(best); this.updateList(); }
  }
  draw(record, image) {
    record.canvas.width = image.width; record.canvas.height = image.height;
    record.canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
  }
  drawBoxes(index) {
    const record = this.records.get(index);
    if (!record?.layer) return;
    record.layer.replaceChildren();
    for (const note of record.context.notes) {
      if (this.selected?.index === index && this.selected.input.id === note.id) continue;
      const box = document.createElement('div'); box.className = 'text-box-hit'; box.dataset.note = note.id;
      box.tabIndex = 0; box.setAttribute('role', 'button'); box.setAttribute('aria-label', `Casella: ${note.contents.slice(0, 60)}`);
      this.place(box, note.position); record.layer.append(box);
      box.ondblclick = () => { if (this.selected?.input.id === note.id) this.editText(); else this.select(index, note, true); };
    }
    if (this.selected?.index === index) this.drawSelected();
  }
  place(element, p) { Object.assign(element.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${p.height}px` }); }
  async select(index, note, editing = false) {
    if (this.unavailable() || this.pending || !this.deselect()) { this.status('Attendi l’applicazione della modifica corrente o correggi la casella.'); return; }
    const input = { id: note.id, contents: note.contents, font: note.font, size: note.size, color: note.color, position: clone(note.position), source: note.source };
    this.selected = { index, input, initial: JSON.stringify(input), existing: true, editing: false, ready: false,
      // Only a block the source already wrapped carries a width to preserve.
      wrapWidth: note.contents.includes('\n') ? (this.records.get(index)?.context?.rotation % 2 ? note.position.height : note.position.width) : undefined };
    this.reselect = null;
    this.currentPage = index; this.onPage(index); this.setStyles(input); this.drawBoxes(index); this.updateControls(); this.notify();
    const selection = this.selected, generation = this.generation;
    try {
      const context = await this.read(index, note.id);
      if (this.selected !== selection || generation !== this.generation) return;
      this.draw(this.records.get(index), context.image); selection.ready = true; this.drawBoxes(index);
      if (selection.wantsCommit) this.commit(false);
      else if (editing || selection.wantsEdit) this.editText(); else this.selected.element?.focus({ preventScroll: true });
    } catch (error) { if (this.selected === selection) { this.deselect(true); this.status(error.message); } }
  }
  drawSelected() {
    const selection = this.selected, record = this.records.get(selection.index);
    const box = document.createElement('div'); box.className = 'text-box-selected'; box.tabIndex = 0;
    box.setAttribute('aria-label', 'Casella selezionata. Clicca sul testo per modificarlo.');
    this.place(box, selection.input.position); record.layer.append(box); selection.element = box;
    box.ondblclick = () => this.editText();
    const textarea = document.createElement('textarea'); textarea.className = 'text-inline-input'; textarea.spellcheck = false;
    textarea.value = selection.input.contents; textarea.maxLength = 10000;
    textarea.readOnly = !selection.editing; textarea.tabIndex = selection.editing ? 0 : -1;
    textarea.setAttribute('aria-label', 'Testo della casella');
    textarea.hidden = !selection.ready;
    textarea.oninput = () => { selection.input.contents = textarea.value; this.fitSelection(); this.updateControls(); this.notify(); };
    box.append(textarea); selection.textarea = textarea;
    for (const corner of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const handle = document.createElement('span'); handle.className = `text-resize-handle handle-${corner}`;
      handle.dataset.handle = corner; box.append(handle);
    }
    this.applyInlineStyle();
  }
  applyInlineStyle() {
    const selection = this.selected;
    if (!selection?.textarea) return;
    const { input, textarea } = selection, variant = input.font % 4;
    const family = input.font >= 8 ? 'Times' : input.font >= 4 ? 'Helvetica' : 'Courier';
    const r = this.records.get(selection.index).context.rotation;
    const { width: w, height: h } = input.position;
    Object.assign(textarea.style, { fontFamily: fontCss[family], fontSize: `${input.size}px`,
      fontWeight: [1, 2].includes(variant) ? 'bold' : 'normal', fontStyle: [2, 3].includes(variant) ? 'italic' : 'normal', color: input.color,
      width: `${r % 2 ? h : w}px`, height: `${r % 2 ? w : h}px`,
      lineHeight: '1.2', transform: ['none', `translateX(${w}px) rotate(90deg)`, `translate(${w}px, ${h}px) rotate(180deg)`, `translateY(${h}px) rotate(270deg)`][r] });
    selection.element.classList.toggle('editing', selection.editing);
  }
  fitSelection() {
    const selection = this.selected;
    if (!selection?.input.contents.trim() || !selection.textarea || !Number.isFinite(selection.input.size)) return;
    const record = this.records.get(selection.index), r = record.context.rotation, p = selection.input.position;
    const canvas = this.measureCanvas ??= document.createElement('canvas'), context = canvas.getContext('2d');
    const style = getComputedStyle(selection.textarea);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    // Wrap at the drawn or resized width, and at the page edge otherwise: the
    // glyph width of a single line is not a margin the user chose, and reusing
    // it broke a longer word onto a second line as soon as it was typed. The
    // room left is measured toward the edge the text runs into, so a permanent
    // page rotation does not change where the block is allowed to grow.
    const room = [record.width - p.x, record.height - p.y, p.x + p.width, p.y + p.height][r];
    const wrapWidth = selection.wrapWidth ?? Math.max(12, room);
    selection.input.layoutWidth = selection.wrapWidth ?? UNBOUNDED;
    const measured = textLayout(selection.input.contents, wrapWidth, selection.input.size, text => context.measureText(text).width);
    const width = r % 2 ? measured.height : measured.width, height = r % 2 ? measured.width : measured.height;
    // Preserve the text's starting corner through permanent page rotations.
    if (r === 1 || r === 2) p.x += p.width - width;
    if (r === 2 || r === 3) p.y += p.height - height;
    p.width = width; p.height = height;
    this.place(selection.element, p); this.applyInlineStyle();
  }
  editText() {
    if (!this.selected || this.unavailable()) return;
    if (!this.selected.ready) { this.selected.wantsEdit = true; return; }
    this.selected.editing = true; this.selected.textarea.readOnly = false; this.selected.textarea.tabIndex = 0;
    this.applyInlineStyle(); this.selected.textarea.focus({ preventScroll: true });
  }
  deselect(force = false) {
    if (this.drag) return false;
    if (this.changed() && !force) { this.status('Esci dalla casella per applicarla, oppure annulla la modifica.'); return false; }
    if (this.selected) {
      const index = this.selected.index, record = this.records.get(index);
      this.selected = null;
      if (record?.context) { this.draw(record, record.context.image); this.drawBoxes(index); }
    }
    this.updateControls(); this.notify(); return true;
  }
  cancel() {
    if (this.unavailable() || this.committing) return;
    this.cancelDrag();
    if (this.changed() && !confirm('Scartare le modifiche non applicate alla casella?')) { this.editText(); return; }
    this.creating = false; this.pasting = null; this.deselect(true); this.status('Modifica annullata.');
  }
  pointerDown(index, event) {
    if (event.button !== 0) return;
    const record = this.records.get(index);
    if (!record?.context) return;
    // A click while this surface is applying its own edit still chooses what to
    // edit next, once that edit lands. Dropping it made the click look ignored.
    if (this.committing) {
      const id = this.creating ? null : event.target.closest('[data-note]')?.dataset.note;
      const point = this.point(index, event);
      event.preventDefault(); this.pointer = { index, ...point };
      this.leaveAndSelect(index, id, id ? point : null);
      return;
    }
    if (this.unavailable()) return;
    const p = this.point(index, event); this.pointer = { index, ...p };
    if (this.pasting) { const box = this.pasting; this.pasting = null; event.preventDefault(); this.pasteBox(box); return; }
    if (event.target.closest('textarea') && this.selected?.editing) return;
    const handle = event.target.closest('[data-handle]')?.dataset.handle;
    let selectedBox = event.target.closest('.text-box-selected');
    const id = this.creating ? null : event.target.closest('[data-note]')?.dataset.note;
    if (this.changed() && !selectedBox) {
      event.preventDefault();
      this.leaveAndSelect(index, id, id ? p : null);
      return;
    }
    if (id && !selectedBox) {
      const note = record.context.notes.find(note => note.id === id);
      event.preventDefault(); this.select(index, note);
      if (this.selected?.input.id !== id || this.selected.index !== index) return;
      selectedBox = this.selected.element;
    }
    if (selectedBox && !this.selected?.ready && !id) return;
    if (!selectedBox && !this.editor()?.canText) { this.deselect(); this.status('Il PDF consente la modifica del testo esistente, ma non nuove caselle.'); return; }
    if (!selectedBox && !this.deselect()) return;
    event.preventDefault();
    this.selected?.element?.focus({ preventScroll: true });
    this.drag = { index, start: p, kind: selectedBox ? (handle ?? 'move') : 'new',
      before: this.selected ? clone(this.selected.input.position) : null, pointerId: event.pointerId, target: record.plane };
    record.plane.setPointerCapture(event.pointerId); this.notify();
  }
  pointerMove(index, event) {
    const p = this.point(index, event); this.pointer = { index, ...p };
    if (!this.drag || this.drag.index !== index) return;
    const d = this.drag, record = this.records.get(index), dx = p.x - d.start.x, dy = p.y - d.start.y;
    let position;
    if (d.kind === 'new') {
      position = { x: Math.min(p.x, d.start.x), y: Math.min(p.y, d.start.y), width: Math.abs(dx), height: Math.abs(dy) };
      if (!d.outline) { d.outline = document.createElement('div'); d.outline.className = 'text-new-outline'; record.layer.append(d.outline); }
      this.place(d.outline, position); d.position = position;
    } else {
      const b = d.before;
      if (d.kind === 'move') position = { ...b, x: clamp(b.x + dx, 0, record.width - b.width), y: clamp(b.y + dy, 0, record.height - b.height) };
      else {
        let left = b.x, top = b.y, right = b.x + b.width, bottom = b.y + b.height;
        if (d.kind.includes('w')) left = clamp(b.x + dx, 0, right - 12);
        if (d.kind.includes('e')) right = clamp(right + dx, left + 12, record.width);
        if (d.kind.includes('n')) top = clamp(b.y + dy, 0, bottom - 12);
        if (d.kind.includes('s')) bottom = clamp(bottom + dy, top + 12, record.height);
        position = { x: left, y: top, width: right - left, height: bottom - top };
      }
      this.selected.input.position = position; this.place(this.selected.element, position); this.applyInlineStyle();
      if (d.kind !== 'move') this.selected.wrapWidth = record.context.rotation % 2 ? position.height : position.width;
    }
  }
  pointerUp(index, event) {
    const drag = this.drag;
    if (!drag || drag.index !== index) return;
    this.pointerMove(index, event); this.drag = null;
    drag.outline?.remove();
    if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
    if (drag.kind === 'new') {
      const p = drag.position;
      if (p && p.width >= 12 && p.height >= 12) this.newBox(index, p);
      else {
        const record = this.records.get(index), width = Math.max(12, Math.min(200, record.width - drag.start.x)), height = Math.max(12, Math.min(40, record.height - drag.start.y));
        this.newBox(index, { x: clamp(drag.start.x, 0, record.width - width), y: clamp(drag.start.y, 0, record.height - height), width, height });
      }
    } else {
      this.updateControls(); this.notify();
      if (this.changed()) {
        if (this.selected?.ready) this.commit(false);
        else if (this.selected) this.selected.wantsCommit = true;
      }
      else if (drag.kind === 'move') this.editText();
    }
    this.notify();
  }
  cancelDrag(notify = true) {
    const drag = this.drag; this.drag = null;
    if (!drag) return;
    drag.outline?.remove();
    if (drag.before && this.selected) { this.selected.input.position = drag.before; this.place(this.selected.element, drag.before); this.applyInlineStyle(); }
    if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
    if (notify) this.notify();
  }
  style() {
    const bold = this.bold.getAttribute('aria-pressed') === 'true', italic = this.italic.getAttribute('aria-pressed') === 'true';
    return { font: families[this.family.value] + (bold ? (italic ? 2 : 1) : (italic ? 3 : 0)), size: Number(this.size.value), color: this.color.value };
  }
  setStyles(input) {
    this.family.value = input.font >= 8 ? 'Times' : input.font >= 4 ? 'Helvetica' : 'Courier'; this.size.value = input.size; this.color.value = input.color;
    this.bold.setAttribute('aria-pressed', String([1, 2].includes(input.font % 4)));
    this.italic.setAttribute('aria-pressed', String([2, 3].includes(input.font % 4)));
  }
  styleChanged() {
    if (this.selected) { Object.assign(this.selected.input, this.style()); this.applyInlineStyle(); this.fitSelection(); }
    this.updateControls(); this.notify();
  }
  toggleStyle(button) { button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true')); this.styleChanged(); }
  resizeFont(delta) { this.size.value = clamp((Number(this.size.value) || 12) + delta, 6, 144); this.styleChanged(); }
  newBox(index, position, template, commit = false) {
    if (this.unavailable() || !this.deselect()) return;
    // A pasted box always receives a fresh stable identifier.
    const input = { contents: '', ...this.style(), ...template, id: `pdfmb-${crypto.randomUUID()}`, position: clone(position) };
    this.selected = { index, input, initial: '', existing: false, editing: !commit, ready: true,
      wrapWidth: this.records.get(index)?.context?.rotation % 2 ? position.height : position.width };
    this.reselect = null;
    this.creating = false; this.currentPage = index; this.onPage(index); this.setStyles(input); this.drawBoxes(index);
    this.updateControls(); this.notify();
    if (commit) this.commit(false); else this.editText();
  }
  copyBox() {
    if (!this.selected) return null;
    const input = this.selected.input;
    if (!input.contents.trim()) { this.status('Scrivi prima il testo della casella.'); return null; }
    this.clipboard = { contents: input.contents, font: input.font, size: input.size, color: input.color,
      width: input.position.width, height: input.position.height };
    this.status('Casella copiata. Tasto destro sulla pagina → Incolla, oppure porta il mouse nel nuovo punto e premi Ctrl+V.');
    this.updateControls(); return this.clipboard;
  }
  copyEvent(event) {
    if (!this.active || inputTarget(event.composedPath()[0]) || this.unavailable()) return;
    const box = this.copyBox();
    if (!box) return;
    event.preventDefault(); event.clipboardData.setData('text/plain', box.contents);
    event.clipboardData.setData('application/x-pdfmb-text', JSON.stringify(box));
  }
  pasteEvent(event) {
    if (!this.active || inputTarget(event.composedPath()[0]) || this.unavailable()) return;
    const custom = event.clipboardData.getData('application/x-pdfmb-text');
    const text = event.clipboardData.getData('text/plain');
    let box;
    try { if (custom) box = JSON.parse(custom); } catch { /* plain text fallback */ }
    if (!box && this.clipboard?.contents === text) box = this.clipboard;
    if (!box && text) box = { contents: text, ...this.style(), width: 200, height: 70 };
    if (!box) return;
    event.preventDefault(); this.pasteBox(box);
  }
  async pasteBox(box = this.clipboard) {
    if (!box || this.unavailable()) return;
    if (!this.pointer || !this.records.get(this.pointer.index)?.context) { this.pasting = box; this.status('Clicca sulla pagina nel punto in cui incollare la casella.'); return; }
    if (typeof box.contents !== 'string' || box.contents.length > 10000 || !Number.isInteger(box.font) || box.font < 0 || box.font > 11 ||
        !Number.isFinite(box.size) || box.size < 6 || box.size > 144 || !/^#[0-9a-f]{6}$/i.test(box.color) ||
        !Number.isFinite(box.width) || !Number.isFinite(box.height)) { this.status('Casella negli appunti non valida.'); return; }
    const { index, x, y } = this.pointer;
    if (this.changed() && !await this.commit(false)) return;
    this.reselect = null;
    const record = await this.pageContext(index);
    if (!record) return;
    const width = clamp(box.width, 12, record.width), height = clamp(box.height, 12, record.height);
    this.newBox(index, { x: clamp(x, 0, record.width - width), y: clamp(y, 0, record.height - height), width, height },
      { contents: box.contents, font: box.font, size: box.size, color: box.color }, true);
  }
  commit(remove = false) {
    const intent = !!remove;
    // Only an identical request may ride on the commit already in flight.
    // Handing that promise to a different intent, such as Delete pressed while
    // a text edit is still being applied, dropped the intent without a trace.
    if (this.committing && this.committingIntent === intent) return this.committing;
    // The surface is unavailable for the duration of its own commit, so only a
    // first request is turned away by it; a follow-up queues behind.
    if (!this.committing && (this.unavailable() || this.drag)) return Promise.resolve(false);
    const previous = this.committing;
    this.committingIntent = intent;
    // Queue the entire flush, rather than queueing apply from inside a flush:
    // editor.lock uses flush directly on this same queue before native saving.
    const current = this.committing = (previous ? previous.catch(() => false) : Promise.resolve())
      // Delete targets the block the user had selected, so pick it up again
      // first when the edit that was being applied has just replaced it.
      // Restoring outside run() keeps the page read off this same queue.
      .then(() => intent && this.reselect ? this.restoreSelection() : null)
      .then(() => this.drag ? false : this.run(() => this.flush(intent)))
      .finally(() => { if (this.committing === current) { this.committing = null; this.notify(); } });
    this.notify();
    return current;
  }
  // A draft that cannot be applied yet is owed, not discarded: dropping it here
  // is what made an edit need a second attempt.
  commitOnLeave() {
    const focus = document.activeElement;
    if (!this.active || !this.changed() || this.drag || this.menu.matches(':popover-open') ||
        this.toolbar.contains(focus) || this.selected?.element?.contains(focus)) { this.owedCommit = false; return; }
    if (this.unavailable()) { this.owedCommit = true; return; }
    this.owedCommit = false; this.commit(false);
  }
  async flush(remove = false) {
    if (this.drag) return false;
    if (!this.selected) {
      if (remove) this.status('Nessuna casella selezionata: selezionala di nuovo per eliminarla.');
      return !remove;
    }
    if (!remove && !this.changed()) { this.deselect(true); return true; }
    if (!this.selected.ready) return false;
    // Empty new outlines are placeholders, never blank PDF annotations.
    if (!remove && !this.selected.existing && !this.selected.input.contents.trim()) { this.deselect(true); return true; }
    if (!remove && !this.size.reportValidity()) return false;
    if (remove && !this.selected.existing) { this.deselect(true); return true; }
    if (remove && !confirm('Eliminare la casella selezionata? L’operazione può essere annullata.')) return false;
    const selection = this.selected, generation = this.generation;
    const payload = { pageIndex: selection.index, token: this.token, revision: this.revision, input: clone(selection.input), remove };
    // Keep a failed draft recoverable. The host is locked by withWorking while
    // the new PDF is loaded; successful model changes invalidate old canvases.
    this.status(remove ? 'Eliminazione casella…' : 'Applicazione testo…');
    try {
      await this.apply(payload);
      if (this.generation === generation) this.deselect(true); // no-op edit
      // Applying rebuilds the page and renumbers content blocks, so remember
      // what was written and where, and pick the block up again below.
      this.reselect = remove ? null : { index: payload.pageIndex, contents: payload.input.contents, position: payload.input.position };
      this.creating = false; this.notify(); this.pump();
      this.status(remove ? 'Casella eliminata.' : 'Testo applicato. Clicca sulla casella per modificarlo ancora; Salva aggiorna il PDF.');
      return true;
    } catch (error) {
      if (this.generation === generation) this.selected = selection;
      this.updateControls(); this.notify(); this.status(error.message);
      this.editText();
      return false;
    }
  }
  async showContextMenu(index, event, keyboard = false) {
    event.preventDefault(); event.stopPropagation();
    this.hideMenu();
    let record = this.records.get(index);
    if (!this.active || this.unavailable() || !record?.context || this.drag) return;
    const selectedBox = event.target.closest?.('.text-box-selected');
    const id = selectedBox && this.selected?.index === index ? this.selected.input.id : event.target.closest?.('[data-note]')?.dataset.note;
    const boxRect = (selectedBox ?? event.target.closest?.('[data-note]') ?? record.element).getBoundingClientRect();
    const clientX = keyboard ? boxRect.left + Math.min(20, boxRect.width / 2) : event.clientX;
    const clientY = keyboard ? boxRect.top + Math.min(20, boxRect.height / 2) : event.clientY;
    const point = { index, ...this.point(index, { clientX, clientY }) };
    if (this.changed() && id !== this.selected?.input.id) {
      if (!await this.commit(false)) return;
      this.reselect = null;
      record = await this.pageContext(index);
      if (!record) return;
    }
    const request = ++this.menuRequest, generation = this.generation;
    if (id && (this.selected?.input.id !== id || this.selected.index !== index)) {
      const note = record.context.notes.find(note => note.id === id);
      if (!note || this.pending) { this.status('Correggi o annulla la modifica corrente prima di selezionare un’altra casella.'); return; }
      await this.select(index, note);
    }
    if (request !== this.menuRequest || generation !== this.generation || !this.active || this.unavailable()) return;
    this.menuContext = { point, generation };
    this.menuCopy.hidden = !id;
    this.menuCopy.disabled = !id || !this.selected?.input.contents.trim();
    this.menuPaste.disabled = !this.clipboard || this.pending || !this.editor()?.canText;
    document.querySelector('#text-context-title').textContent = id ? 'Casella di testo' : `Pagina ${index + 1}`;
    this.menu.showPopover();
    const rect = this.menu.getBoundingClientRect();
    this.menu.style.left = `${clamp(clientX + 4, 8, Math.max(8, innerWidth - rect.width - 8))}px`;
    this.menu.style.top = `${clamp(clientY + 4, 8, Math.max(8, innerHeight - rect.height - 8))}px`;
    (this.menu.querySelector('button:not(:disabled):not([hidden])') ?? this.menu).focus({ preventScroll: true });
  }
  hideMenu(restoreFocus = false) {
    this.menuRequest++;
    this.menuContext = null;
    if (!this.menu.matches(':popover-open')) return;
    this.menu.hidePopover();
    if (restoreFocus) (this.selected?.element ?? this.surface).focus({ preventScroll: true });
  }
  keydown(event) {
    if (!this.active) return;
    if (this.menu.matches(':popover-open')) {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); }
        this.hideMenu(true);
      }
      return;
    }
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      const index = this.selected?.index ?? this.pointer?.index ?? this.currentPage;
      this.showContextMenu(index, event, true); return;
    }
    const target = event.composedPath()[0], typing = inputTarget(target);
    if (event.key === 'Escape') { event.preventDefault(); this.cancel(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && this.selected) { event.preventDefault(); this.commit(false); return; }
    if (!typing && (event.key === 'Delete' || event.key === 'Backspace') && this.selected) { event.preventDefault(); this.commit(true); return; }
    if (!typing && event.key === 'Enter' && this.selected) { event.preventDefault(); this.editText(); }
  }
  updateList() {
    const selected = this.selected?.input.id ?? '';
    this.list.replaceChildren(new Option(`Caselle · pagina ${this.currentPage + 1}`, ''));
    for (const note of this.records.get(this.currentPage)?.context?.notes ?? [])
      this.list.add(new Option(note.contents.replace(/\s+/g, ' ').slice(0, 65), note.id));
    this.list.value = selected;
  }
  updateControls() {
    const enabled = !!this.editor()?.canTextEdit && !this.unavailable();
    for (const control of this.toolbar.querySelectorAll('button,input,select')) control.disabled = !enabled;
    document.querySelector('#text-new').disabled = !enabled || !this.editor()?.canText;
    document.querySelector('#text-new').setAttribute('aria-pressed', String(!!this.creating));
    for (const id of ['text-cancel', 'text-delete']) document.querySelector(`#${id}`).disabled = !enabled || !this.selected;
    // A failed Worker must still let the user copy or discard a recoverable draft.
    document.querySelector('#text-cancel').disabled = this.unavailable() || !this.selected;
    // A keystroke typed into a draft that is already being written would be
    // lost together with the selection it belongs to.
    if (this.selected?.textarea) this.selected.textarea.readOnly = !this.selected.editing || !!this.committing;
    this.list.disabled = !enabled || !this.active;
    this.zoom.disabled = !enabled || !this.active;
    this.surface.classList.toggle('drawing-text', !!this.creating);
    this.updateList();
  }
}
