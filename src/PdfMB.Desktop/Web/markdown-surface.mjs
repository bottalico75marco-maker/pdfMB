import { pageMarker, markdownPageAt, markdownPageOffset, renderMarkdown } from './markdown-engine.mjs';

export class MarkdownSurface {
  constructor({ emit, notify, navigate, unavailable }) {
    Object.assign(this, { emit, notify, navigate, unavailable });
    this.root = document.querySelector('#markdown-panel');
    this.input = document.querySelector('#markdown-source');
    this.preview = document.querySelector('#markdown-preview');
    this.status = document.querySelector('#markdown-status');
    this.page = document.querySelector('#markdown-page');
    this.saved = ''; this.generating = false; this.revision = 0; this.pdfRevision = 0;
    this.input.addEventListener('input', () => {
      this.revision++; this.refresh(); clearTimeout(this.timer);
      this.timer = setTimeout(() => this.render(), 120);
      this.notify();
    });
    this.input.addEventListener('click', () => this.followCaret());
    this.input.addEventListener('keyup', () => this.followCaret());
    for (const event of ['focus', 'blur']) this.input.addEventListener(event, () => this.notify());
    this.page.addEventListener('change', () => { const n = Number(this.page.value); this.navigate(n); this.showPage(n); });
    document.querySelector('#markdown-generate').onclick = () => this.emit('host.markdownGenerate', { vision: false });
    document.querySelector('#markdown-ocr').onclick = () => this.emit('host.markdownGenerate', { vision: true });
    document.querySelector('#markdown-model').value = localStorage.getItem('pdfmb.ocrModel') || 'qwen3-vl:2b-instruct';
    const checkModel = () => {
      const model = document.querySelector('#markdown-model').value.trim();
      localStorage.setItem('pdfmb.ocrModel', model); this.available = false; this.refresh();
      document.querySelector('#markdown-availability').textContent = 'OCR disattivato: verifica del modello in corso…';
      this.emit('host.markdownCheck', { model });
    };
    document.querySelector('#markdown-model').onchange = checkModel;
    document.querySelector('#markdown-check').onclick = checkModel;
    this.checkModel = checkModel;
    document.querySelector('#markdown-cancel').onclick = () => this.emit('host.markdownCancel');
    document.querySelector('#markdown-save').onclick = () => this.emit('host.markdownSave');
    document.querySelector('#markdown-saveAs').onclick = () => this.emit('host.markdownSaveAs');
    document.querySelector('#markdown-close').onclick = () => { this.root.hidden = true; this.notify(); };
    document.querySelector('#markdown-show-preview').onchange = event => {
      this.preview.hidden = !event.target.checked; this.render();
    };
    this.preview.addEventListener('click', event => {
      const n = event.target.closest('[data-page]')?.dataset.page;
      if (n) this.navigate(Number(n));
    });
  }
  get active() { return !this.root.hidden; }
  get dirty() { return this.input.value !== this.saved; }
  get textEditing() { return this.active && this.root.contains(document.activeElement); }
  reset() {
    clearTimeout(this.timer); this.root.hidden = true; this.input.value = this.saved = '';
    this.generating = false; this.revision = 0; this.pdfRevision = 0; this.token = null; this.path = '';
    this.render();
  }
  open({ token, name, text = '', path = '', pageCount, pdfRevision = 0 }) {
    if (this.token !== token) {
      this.reset(); this.token = token; this.path = path; this.input.value = this.saved = text;
      this.pdfRevision = pdfRevision;
    }
    document.querySelector('#markdown-name').textContent = path || `${name}.md`;
    this.page.replaceChildren(...Array.from({ length: pageCount }, (_, i) => {
      const option = document.createElement('option'); option.value = String(i + 1); option.textContent = `Pagina ${i + 1}`; return option;
    }));
    this.root.hidden = false; this.status.textContent = text ? 'Markdown caricato. Modifica il testo e salva.' : 'Scegli la conversione e premi Converti PDF.';
    this.render(); this.refresh(); this.notify();
  }
  begin({ pdfRevision }) {
    this.generating = true; this.pdfRevision = pdfRevision; this.revision++;
    this.input.value = ''; this.status.textContent = 'Preparazione conversione…';
    this.render(); this.refresh(); this.notify();
  }
  append({ page, markdown, pageCount }) {
    this.setGeneratedText(this.input.value + `${this.input.value ? '\n\n' : ''}${pageMarker(page)}\n\n## Pagina ${page}\n\n${markdown.trim()}\n`);
    this.revision++; this.render(); this.refresh();
    this.status.textContent = `Convertita pagina ${page} di ${pageCount}.`; this.notify();
  }
  appendImage({ index, description }) {
    this.setGeneratedText(this.input.value + `\n\n### Immagine ${index + 1}\n\n${description.trim()}\n`);
    this.revision++; this.render(); this.refresh(); this.notify();
  }
  setGeneratedText(value) {
    if (new TextEncoder().encode(value).length > 8 * 1024 * 1024) throw new Error('Limite Markdown di 8 MB raggiunto. Salvare il risultato parziale.');
    this.input.value = value;
  }
  finish({ message }) { this.generating = false; this.status.textContent = message; this.refresh(); this.notify(); }
  availability({ available, message }) {
    this.available = available; document.querySelector('#markdown-availability').textContent = message; this.refresh();
  }
  export() { return { token: this.token, text: this.input.value, revision: this.revision, dirty: this.dirty }; }
  markSaved({ revision, path }) {
    if (revision !== this.revision) throw new Error('Il Markdown è cambiato durante il salvataggio.');
    this.saved = this.input.value; this.path = path;
    document.querySelector('#markdown-name').textContent = path;
    this.status.textContent = 'Markdown salvato.'; this.refresh(); this.notify();
  }
  render() { renderMarkdown(this.preview, this.input.value); }
  refresh() {
    this.input.readOnly = this.generating;
    document.querySelector('#markdown-generate').disabled = this.generating;
    document.querySelector('#markdown-ocr').disabled = this.generating || !this.available;
    document.querySelector('#markdown-model').disabled = this.generating;
    document.querySelector('#markdown-check').disabled = this.generating;
    document.querySelector('#markdown-cancel').hidden = !this.generating;
    document.querySelector('#markdown-save').disabled = this.generating || !this.dirty;
    document.querySelector('#markdown-saveAs').disabled = this.generating || !this.input.value;
    document.querySelector('#markdown-close').disabled = this.generating;
    document.querySelector('#markdown-modified').textContent = this.dirty ? 'Modifiche da salvare' : '';
  }
  followCaret() {
    if (!this.active || this.generating || this.unavailable()) return;
    const page = markdownPageAt(this.input.value, this.input.selectionStart);
    this.page.value = String(page); this.navigate(page);
  }
  showPage(page) {
    if (!this.active) return;
    this.page.value = String(page);
    const offset = markdownPageOffset(this.input.value, page);
    if (offset >= 0 && document.activeElement !== this.input) {
      this.input.setSelectionRange(offset, offset);
      const lines = this.input.value.slice(0, offset).split('\n').length - 1;
      this.input.scrollTop = lines * (parseFloat(getComputedStyle(this.input).lineHeight) || 20);
    }
    this.preview.querySelector(`[data-page="${Number(page)}"]`)?.scrollIntoView({ block: 'start' });
  }
  sync(editor) {
    if (!this.active || this.generating || !editor || this.token !== editor.token) return;
    if (editor.revision !== this.pdfRevision)
      this.status.textContent = 'Il PDF è stato modificato. Il Markdown conserva la versione precedente: puoi correggerlo o riconvertire.';
  }
}
