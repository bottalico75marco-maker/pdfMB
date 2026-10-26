// Uses the viewer's text selection: no overlay, canvas or duplicate document.
export function captureSelection(selection) {
  return selection.map(({ pageIndex, segmentRects }) => ({ pageIndex,
    rects: segmentRects.map(segment => ({ origin: { ...segment.origin }, size: { ...segment.size } }))
  })).filter(page => page.rects.length);
}

export function markerCursor(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M5 22 19 8l7 7-14 14H5z" fill="${color}" stroke="#222" stroke-width="2"/><path d="m19 8 4-4 7 7-4 4M5 24l-3 6 7-2" fill="#333" stroke="#222"/><path d="m10 19 7 7" stroke="#fff" stroke-width="2"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 30, crosshair`;
}

export class HighlightSurface {
  constructor({ editor, plugin, session, run, notify, unavailable, showError }) {
    Object.assign(this, { editor, plugin, session, run, notify, unavailable, showError });
    this.active = false;
    this.color = '#ffff00';
    this.disposers = [];
    this.deleteMenu = document.querySelector('#highlight-delete-menu');
    this.deleteList = document.querySelector('#highlight-delete-list');
    this.deleteMenu.querySelector('[data-highlight-dismiss]').onclick = () => this.deleteMenu.hidePopover();
    this.deleteMenu.querySelector('[data-highlight-remove]').onclick = () => this.removeSelected();
  }
  setColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Colore evidenziatore non valido.');
    this.color = color.toLowerCase();
    this.updateCursor();
  }
  toggle(force) {
    if (!this.editor()?.canText) return;
    this.active = force ?? !this.active;
    this.gesture = null;
    this.sync();
    if (this.active) this.selection?.clear();
  }
  suspend() { this.gesture = null; this.selection?.clear(); this.deleteMenu.hidePopover(); }
  async showDelete(pageIndex) {
    const editor = this.editor();
    const items = await editor.highlightList(pageIndex);
    this.deleteTarget = { token: editor.token, revision: editor.revision, pageIndex };
    this.deleteList.replaceChildren(new Option(items.length ? 'Seleziona un’evidenziazione' : 'Nessuna evidenziazione PDF MB nella pagina', ''));
    items.forEach((item, index) => this.deleteList.add(new Option('Evidenziazione ' + (index + 1), item.id)));
    this.deleteMenu.showPopover();
  }
  removeSelected() {
    const id = this.deleteList.value;
    if (!id || this.pending || this.unavailable()) return;
    const target = { ...this.deleteTarget };
    this.pending = true;
    this.deleteMenu.hidePopover();
    this.run(() => this.editor().changeHighlight({ ...target, input: { id }, remove: true }))
      .catch(this.showError).finally(() => { this.pending = false; this.notify(); });
  }
  unbind() {
    this.disposers.forEach(dispose => dispose()); this.disposers = [];
    try { this.interaction?.removeCursor('pdfmb-highlight'); } catch { /* Document already closed. */ }
    this.selection = this.interaction = null;
  }
  sync() {
    const editor = this.editor();
    if (this.token !== editor?.token) { this.active = false; this.gesture = null; this.token = editor?.token; }
    if (!editor?.canText) this.active = false;
    const id = this.session.currentId;
    if (id !== this.documentId) {
      this.deleteMenu.hidePopover();
      this.unbind(); this.gesture = null; this.documentId = id;
      if (id && editor) {
        this.selection = this.plugin('selection').forDocument(id);
        this.interaction = this.plugin('interaction-manager').forDocument(id);
        this.disposers.push(this.selection.onBeginSelection(() => {
          if (!this.active || this.pending || this.unavailable()) return;
          this.gesture = { token: editor.token, revision: editor.revision, documentId: id, color: this.color };
        }));
        this.disposers.push(this.selection.onEndSelection(() => this.finish()));
      }
    }
    this.updateCursor();
  }
  updateCursor() {
    if (!this.interaction) return;
    if (this.active) {
      this.interaction.activate('pointerMode');
      this.selection.setMarqueeEnabled(false);
      this.interaction.setCursor('pdfmb-highlight', markerCursor(this.color), 100);
    } else {
      this.selection.setMarqueeEnabled(true);
      this.interaction.removeCursor('pdfmb-highlight');
    }
  }
  finish() {
    const gesture = this.gesture; this.gesture = null;
    if (!gesture || !this.active || this.pending || this.unavailable() || gesture.documentId !== this.session.currentId) return;
    const selections = captureSelection(this.selection.getFormattedSelection());
    if (!selections.length) return;
    // Snapshot rectangles and color now, before a queued host command or new view can change them.
    this.pending = true;
    this.selection.clear();
    this.run(async () => {
      if (!this.active || gesture.documentId !== this.session.currentId) return;
      await this.editor().changeHighlights({ ...gesture, selections });
    }).catch(this.showError).finally(() => { this.pending = false; this.notify(); });
  }
}
