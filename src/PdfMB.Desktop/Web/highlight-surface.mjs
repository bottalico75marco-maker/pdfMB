import { pagePoint } from './viewer-page.mjs';
// Uses the viewer's text selection and page pointer handlers.
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
    this.menuRequest = 0;
    this.hosts = new WeakSet();
    this.deleteMenu = document.querySelector('#highlight-delete-menu');
    this.deleteMenu.querySelector('[data-highlight-dismiss]').onclick = () => this.deleteMenu.hidePopover();
    this.deleteMenu.querySelector('[data-highlight-remove]').onclick = () => this.removeSelected();
    document.addEventListener('pointerdown', event => {
      if (!this.deleteMenu.contains(event.target)) this.hideMenu();
    }, true);
    window.addEventListener('blur', () => this.suspend());
    window.addEventListener('resize', () => this.hideMenu());
    document.addEventListener('scroll', () => this.hideMenu(), true);
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
  hideMenu() { this.menuRequest++; this.deleteTarget = null; this.deleteMenu.hidePopover(); }
  suspend() { this.gesture = null; this.hideMenu(); this.selection?.clear(); }
  async showContext(pageIndex, event) {
    if (event.button !== 2 || this.pending || this.unavailable() || !this.editor()?.canText) return;
    event.preventDefault(); event.stopPropagation();
    const request = ++this.menuRequest;
    const editor = this.editor();
    const target = { token: editor.token, revision: editor.revision, pageIndex, documentId: this.documentId };
    const host = event.currentTarget, click = { clientX: event.clientX, clientY: event.clientY };
    const rotation = this.plugin('rotate').forDocument(this.documentId).getRotation();
    try {
      const items = await editor.highlightList(pageIndex);
      if (request !== this.menuRequest || this.unavailable() || target.documentId !== this.documentId ||
          target.token !== this.editor()?.token || target.revision !== this.editor()?.revision || !host.isConnected) return;
      const hit = [...items].reverse().find(item => {
        const [x, y] = pagePoint(click, host, item, rotation);
        return (item.rects.length ? item.rects : [item.position]).some(p => x >= p.x && y >= p.y && x <= p.x + p.width && y <= p.y + p.height);
      });
      if (!hit) return;
      this.deleteTarget = { ...target, id: hit.id };
      this.selection?.clear();
      this.deleteMenu.style.left = `${Math.max(8, Math.min(click.clientX, window.innerWidth - 220))}px`;
      this.deleteMenu.style.top = `${Math.max(8, Math.min(click.clientY, window.innerHeight - 110))}px`;
      this.deleteMenu.showPopover();
      this.deleteMenu.querySelector('[data-highlight-remove]').focus();
    } catch (error) { if (request === this.menuRequest) this.showError(error); }
  }
  removeSelected() {
    const id = this.deleteTarget?.id;
    if (!id || this.pending || this.unavailable()) return;
    const target = { ...this.deleteTarget };
    this.pending = true;
    this.deleteMenu.hidePopover();
    this.run(() => this.editor().changeHighlight({ ...target, input: { id }, remove: true }))
      .catch(this.showError).finally(() => { this.pending = false; this.notify(); });
  }
  unbind() {
    this.disposers.forEach(dispose => dispose()); this.disposers = [];
    this.hosts = new WeakSet();
    try { this.interaction?.removeCursor('pdfmb-highlight'); } catch { /* Document already closed. */ }
    this.selection = this.interaction = null;
  }
  sync() {
    const editor = this.editor();
    if (this.token !== editor?.token) { this.active = false; this.gesture = null; this.token = editor?.token; }
    if (!editor?.canText) this.active = false;
    const id = this.session.currentId;
    if (id !== this.documentId) {
      this.unbind(); this.suspend(); this.gesture = null; this.documentId = id;
      if (id && editor) {
        this.selection = this.plugin('selection').forDocument(id);
        this.interaction = this.plugin('interaction-manager').forDocument(id);
        this.disposers.push(this.selection.onBeginSelection(() => {
          if (!this.active || this.pending || this.unavailable()) return;
          this.gesture = { token: editor.token, revision: editor.revision, documentId: id, color: this.color };
        }));
        this.disposers.push(this.selection.onEndSelection(() => this.finish()));
        const manager = this.plugin('interaction-manager');
        editor.pages.forEach((_, pageIndex) => this.disposers.push(manager.registerAlways({
          scope: { type: 'page', documentId: id, pageIndex },
          handlers: {
            onPointerEnter: (_, event) => this.bindHost(pageIndex, event.currentTarget),
            onPointerDown: (_, event) => this.bindHost(pageIndex, event.currentTarget)
          }
        })));
      }
    }
    this.updateCursor();
  }
  bindHost(pageIndex, host) {
    if (this.hosts.has(host)) return;
    this.hosts.add(host);
    const handler = event => this.showContext(pageIndex, event);
    host.addEventListener('contextmenu', handler);
    this.disposers.push(() => host.removeEventListener('contextmenu', handler));
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
