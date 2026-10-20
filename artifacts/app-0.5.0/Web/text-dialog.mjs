const mm = pt => pt * 25.4 / 72;
const pt = mm => mm * 72 / 25.4;
const families = { Helvetica: 4, Times: 8, Courier: 0 };

export class TextDialog {
  constructor({ editor, apply, preview, notify }) {
    Object.assign(this, { editor, apply, preview, notify });
    this.dialog = document.querySelector('#text-dialog');
    this.form = document.querySelector('#text-form');
    this.content = document.querySelector('#text-content');
    this.list = document.querySelector('#text-existing');
    this.canvas = document.querySelector('#text-page-preview');
    this.outline = document.querySelector('#text-outline');
    this.message = document.querySelector('#text-message');
    this.family = document.querySelector('#text-font');
    this.size = document.querySelector('#text-size');
    this.color = document.querySelector('#text-color');
    this.bold = document.querySelector('#text-bold');
    this.italic = document.querySelector('#text-italic');
    this.fields = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, document.querySelector(`#text-${key}`)]));
    this.form.onsubmit = event => { event.preventDefault(); this.commit(false); };
    this.form.oninput = () => { this.styleContent(); this.positionOutline(); this.message.textContent = 'Premi Aggiorna anteprima per vedere il risultato sulla pagina.'; };
    this.bold.onclick = () => this.toggle(this.bold);
    this.italic.onclick = () => this.toggle(this.italic);
    document.querySelector('#text-smaller').onclick = () => this.resize(-1);
    document.querySelector('#text-larger').onclick = () => this.resize(1);
    document.querySelector('#text-preview-update').onclick = () => this.updatePreview();
    document.querySelector('#text-delete').onclick = () => this.commit(true);
    document.querySelector('#text-cancel').onclick = () => this.cancel();
    this.dialog.oncancel = event => { event.preventDefault(); this.cancel(); };
    this.dialog.onclose = () => { this.context = null; this.notify(); };
    this.list.onchange = () => {
      if (this.changed() && !confirm('Scartare le modifiche non applicate a questa casella?')) { this.list.value = this.activeId; return; }
      this.load(this.list.value);
    };
    this.canvas.onclick = event => {
      if (this.busy) return;
      const rect = this.canvas.getBoundingClientRect(), position = this.input().position;
      this.fields.x.value = mm(Math.max(0, Math.min(this.context.width - position.width,
        (event.clientX - rect.left) * this.context.width / rect.width))).toFixed(3);
      this.fields.y.value = mm(Math.max(0, Math.min(this.context.height - position.height,
        (event.clientY - rect.top) * this.context.height / rect.height))).toFixed(3);
      this.positionOutline();
      this.message.textContent = 'Posizione aggiornata. Premi Aggiorna anteprima per vedere il testo.';
    };
  }
  get isOpen() { return this.dialog.open; }
  async open(pageIndex) {
    const editor = this.editor();
    const context = await editor.textContext(pageIndex);
    this.pageIndex = pageIndex;
    this.token = editor.token; this.revision = editor.revision;
    this.context = context;
    this.list.replaceChildren(new Option('Nuovo testo', ''));
    for (const note of context.notes) this.list.add(new Option(note.contents.replace(/\s+/g, ' ').slice(0, 65), note.id));
    document.querySelector('#text-page-label').textContent = `Testo · pagina ${pageIndex + 1}`;
    this.draw(context.image);
    this.load('');
    this.dialog.showModal();
    this.notify();
    this.content.focus();
  }
  load(id) {
    this.activeId = id;
    const note = this.context.notes.find(note => note.id === id);
    this.noteId = note?.id ?? `pdfmb-${crypto.randomUUID()}`;
    const font = note?.font ?? 4, variant = font % 4;
    this.family.value = font >= 8 ? 'Times' : font >= 4 ? 'Helvetica' : 'Courier';
    this.size.value = String(note?.size ?? 12);
    this.color.value = note?.color ?? '#202020';
    this.bold.setAttribute('aria-pressed', String(variant === 1 || variant === 2));
    this.italic.setAttribute('aria-pressed', String(variant === 2 || variant === 3));
    this.content.value = note?.contents ?? '';
    const x = Math.min(36, this.context.width / 10), y = Math.min(36, this.context.height / 10);
    const position = note?.position ?? { x, y, width: Math.min(240, this.context.width - x), height: Math.min(90, this.context.height - y) };
    for (const key of Object.keys(this.fields)) this.fields[key].value = mm(position[key]).toFixed(3);
    document.querySelector('#text-delete').disabled = !note;
    this.message.textContent = note ? 'Puoi selezionare e copiare il testo nel campo, oppure modificarlo.' : 'Scrivi o incolla il testo. Clicca sull’anteprima per posizionare la casella.';
    this.styleContent(); this.positionOutline(); this.draw(this.context.image);
    this.initial = JSON.stringify(this.input());
  }
  input() {
    const bold = this.bold.getAttribute('aria-pressed') === 'true';
    const italic = this.italic.getAttribute('aria-pressed') === 'true';
    return { id: this.noteId, contents: this.content.value,
      font: families[this.family.value] + (bold ? (italic ? 2 : 1) : (italic ? 3 : 0)),
      size: Number(this.size.value), color: this.color.value,
      position: Object.fromEntries(Object.entries(this.fields).map(([key, field]) => [key, pt(Number(field.value))])) };
  }
  changed() { return JSON.stringify(this.input()) !== this.initial; }
  styleContent() {
    this.content.style.fontFamily = { Helvetica: 'Arial, sans-serif', Times: '"Times New Roman", serif', Courier: '"Courier New", monospace' }[this.family.value];
    this.content.style.fontSize = `${Math.max(6, Math.min(144, Number(this.size.value) || 12))}pt`;
    this.content.style.fontWeight = this.bold.getAttribute('aria-pressed') === 'true' ? 'bold' : 'normal';
    this.content.style.fontStyle = this.italic.getAttribute('aria-pressed') === 'true' ? 'italic' : 'normal';
    this.content.style.color = this.color.value;
  }
  toggle(button) {
    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    this.styleContent();
    this.message.textContent = 'Formattazione della casella aggiornata. Premi Aggiorna anteprima.';
  }
  resize(delta) {
    this.size.value = String(Math.max(6, Math.min(144, (Number(this.size.value) || 12) + delta)));
    this.styleContent(); this.message.textContent = 'Dimensione aggiornata. Premi Aggiorna anteprima.';
  }
  positionOutline() {
    if (!this.context) return;
    const p = this.input().position;
    Object.assign(this.outline.style, { left: `${100 * p.x / this.context.width}%`, top: `${100 * p.y / this.context.height}%`,
      width: `${100 * p.width / this.context.width}%`, height: `${100 * p.height / this.context.height}%` });
  }
  draw(image) {
    this.canvas.width = image.width; this.canvas.height = image.height;
    this.canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
  }
  async run(action) {
    if (this.busy) return;
    this.busy = true;
    const controls = [...this.form.querySelectorAll('button,input,select,textarea')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    try { await action(); }
    catch (error) { this.message.textContent = error?.message ?? String(error); }
    finally { controls.forEach((control, index) => { control.disabled = disabled[index]; }); this.busy = false; }
  }
  async updatePreview() {
    if (!this.form.reportValidity()) return;
    const input = this.input();
    await this.run(async () => {
      this.message.textContent = 'Aggiornamento anteprima…';
      this.draw(await this.preview(this.pageIndex, input));
      this.message.textContent = 'Anteprima PDF aggiornata. Controlla che il testo sia interamente visibile nella casella.';
    });
  }
  async commit(remove) {
    if (remove ? !confirm('Eliminare questa casella di testo? L’operazione può essere annullata.') : !this.form.reportValidity()) return;
    const payload = { pageIndex: this.pageIndex, token: this.token, revision: this.revision, input: this.input(), remove };
    await this.run(async () => {
      this.message.textContent = remove ? 'Eliminazione testo…' : 'Applicazione testo…';
      await this.apply(payload);
      this.dialog.close();
    });
  }
  cancel() {
    if (this.busy) return;
    if (this.changed() && !confirm('Scartare le modifiche non applicate alla casella di testo?')) return;
    this.dialog.close();
  }
}
