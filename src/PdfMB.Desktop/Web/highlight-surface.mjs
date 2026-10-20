export function nearestCharacter(chars, x, y) {
  let best = null, distance = Infinity;
  for (const char of chars) {
    const p = char.position;
    const d = Math.max(p.x - x, 0, x - p.x - p.width) ** 2 + Math.max(p.y - y, 0, y - p.y - p.height) ** 2;
    if (d < distance) { distance = d; best = char; }
  }
  return distance <= 400 ? best : null;
}

export class HighlightSurface {
  constructor({ editor, run, notify }) {
    Object.assign(this, { editor, run, notify });
    this.dialog = document.querySelector('#highlight-dialog');
    this.canvas = document.querySelector('#highlight-canvas');
    this.status = document.querySelector('#highlight-status');
    this.color = document.querySelector('#highlight-color');
    this.list = document.querySelector('#highlight-list');
    this.add = document.querySelector('#highlight-add');
    this.remove = document.querySelector('#highlight-remove');
    this.dialog.querySelector('[data-highlight-close]').onclick = () => this.close();
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); if (!this.busy) this.close(); });
    this.canvas.onpointerdown = event => {
      if (this.busy || event.button !== 0) return;
      const char = this.hit(event);
      if (!char) return;
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = event.pointerId; this.start = this.end = char.index; this.paint();
    };
    this.canvas.onpointermove = event => {
      if (this.drag !== event.pointerId) return;
      const char = this.hit(event);
      if (char) { this.end = char.index; this.paint(); }
    };
    this.canvas.onpointerup = event => { if (this.drag === event.pointerId) { this.drag = null; this.paint(); } };
    this.canvas.onpointercancel = () => { this.drag = null; this.start = this.end = null; this.paint(); };
    this.canvas.onkeydown = event => {
      if (!this.data?.chars.length || this.busy) return;
      const chars = this.data.chars;
      let index = chars.findIndex(c => c.index === this.end);
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        index = Math.max(0, Math.min(chars.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
        this.end = chars[index].index;
        if (!event.shiftKey || this.start === null) this.start = this.end;
        this.paint();
      }
    };
    this.list.onchange = () => { this.remove.disabled = !this.list.value; };
    this.add.onclick = () => {
      if (this.start === null || this.end === null || this.drag !== null) return;
      this.commit({ id: 'pdfmb-h-' + crypto.randomUUID(), start: Math.min(this.start, this.end),
        end: Math.max(this.start, this.end), color: this.color.value });
    };
    this.remove.onclick = () => { if (this.list.value) this.commit({ id: this.list.value }, true); };
  }
  close() { this.dialog.close(); this.data = null; this.drag = null; }
  hit(event) {
    const box = this.canvas.getBoundingClientRect();
    return nearestCharacter(this.data.chars, (event.clientX - box.left) * this.data.width / box.width,
      (event.clientY - box.top) * this.data.height / box.height);
  }
  async open(pageIndex) {
    const editor = this.editor();
    this.pageIndex = Math.max(0, Math.min(pageIndex, editor.pages.length - 1));
    this.token = editor.token; this.revision = editor.revision;
    this.data = await editor.highlightContext(this.pageIndex);
    this.refresh();
    this.dialog.showModal(); this.canvas.focus();
  }
  refresh() {
    this.start = this.end = this.drag = null;
    const { image } = this.data;
    this.canvas.width = image.width; this.canvas.height = image.height;
    this.list.replaceChildren(new Option('Seleziona un’evidenziazione', ''));
    this.data.highlights.forEach((h, i) => this.list.add(new Option('Evidenziazione ' + (i + 1), h.id)));
    this.remove.disabled = true;
    this.paint();
  }
  paint() {
    const { image, chars } = this.data;
    const ctx = this.canvas.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
    const selected = this.start === null ? [] : chars.filter(c => c.index >= Math.min(this.start, this.end) && c.index <= Math.max(this.start, this.end));
    ctx.fillStyle = '#3388ff55';
    for (const { position: p } of selected) ctx.fillRect(p.x * image.width / this.data.width, p.y * image.height / this.data.height,
      p.width * image.width / this.data.width, p.height * image.height / this.data.height);
    this.add.disabled = !selected.length || this.busy || this.drag !== null;
    this.status.textContent = selected.length ? selected.map(c => c.text).join('') :
      chars.length ? 'Trascina sul testo. Da tastiera: frecce e Maiusc+frecce.' : 'Nessun testo selezionabile: la pagina può richiedere OCR.';
  }
  async commit(input, remove = false) {
    if (this.busy) return;
    this.busy = true;
    this.dialog.querySelectorAll('button,input,select').forEach(el => { el.disabled = true; });
    try {
      await this.run(async () => {
        const editor = this.editor();
        await editor.changeHighlight({ pageIndex: this.pageIndex, token: this.token, revision: this.revision, input, remove });
        this.revision = editor.revision;
        this.data = await editor.highlightContext(this.pageIndex);
      });
      this.refresh();
    } catch (error) { this.status.textContent = error.message; }
    finally {
      this.busy = false;
      this.dialog.querySelectorAll('button,input,select').forEach(el => { el.disabled = false; });
      this.add.disabled = this.start === null; this.remove.disabled = !this.list.value;
      this.notify();
    }
  }
}
