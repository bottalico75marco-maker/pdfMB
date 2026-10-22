export class PagesPanel {
  constructor({ plugin, session, editor, unavailable, select, change, insert, insertBlank, extract, toggle }) {
    Object.assign(this, { plugin, session, editor, unavailable, select, change, insert, insertBlank, extract, toggle });
    this.element = document.querySelector('#pages-panel');
    this.list = document.querySelector('#page-list');
    this.menu = document.querySelector('#page-menu');
    this.generation = 0;
    this.urls = new Set();
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        this.observer.unobserve(entry.target);
        this.renderQueue.push({ element: entry.target, generation: this.generation, documentId: this.session.currentId });
      }
      this.pump();
    }, { root: this.list, rootMargin: '250px' });
    this.renderQueue = [];
    this.rendering = 0;
    document.querySelector('#panel-close').onclick = toggle;
    for (const button of document.querySelectorAll('[data-operation]')) button.onclick = () => {
      if (unavailable() || !editor()?.canEdit) return;
      const operation = button.dataset.operation;
      this.hideMenu(true);
      if (operation === 'move') this.showMove();
      else if (operation === 'delete') this.showDelete();
      else if (operation === 'insert') insert();
      else if (operation === 'insert-blank') insertBlank();
      else if (operation === 'extract') extract();
      else change({ operation });
    };
    this.menu.onkeydown = event => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault();
        this.hideMenu(true);
        return;
      }
      const items = [...this.menu.querySelectorAll('button:not(:disabled)')];
      if (!items.length) return;
      const current = items.indexOf(document.activeElement);
      let next;
      if (event.key === 'ArrowDown') next = (current + 1) % items.length;
      if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = items.length - 1;
      if (next !== undefined) { event.preventDefault(); items[next].focus(); }
    };
    this.list.addEventListener('scroll', () => this.hideMenu(), { passive: true });
    window.addEventListener('resize', () => this.hideMenu());
    window.addEventListener('blur', () => this.hideMenu());
    for (const button of document.querySelectorAll('[data-cancel-dialog]'))
      button.onclick = () => button.closest('dialog').close();
    document.querySelector('#move-confirm').onclick = () => {
      const input = document.querySelector('#move-position');
      if (!input.reportValidity()) return;
      document.querySelector('#move-dialog').close();
      change({ operation: 'move', position: Number(input.value) });
    };
    document.querySelector('#delete-confirm').onclick = () => {
      document.querySelector('#delete-dialog').close();
      change({ operation: 'delete' });
    };
    this.list.onkeydown = event => {
      if (unavailable() || !editor()) return;
      const buttons = [...this.list.querySelectorAll('.page-tile')];
      const current = buttons.indexOf(event.target.closest('.page-tile'));
      if (current < 0) return;
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        this.select(current, {}, editor().selection.has(editor().pages[current].id));
        this.showMenu(buttons[current], event, true);
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        editor().selection = new Set(editor().pages.map(page => page.id));
        this.updateSelection();
        return;
      }
      let index;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') index = Math.min(buttons.length - 1, current + 1);
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') index = Math.max(0, current - 1);
      if (event.key === 'Home') index = 0;
      if (event.key === 'End') index = buttons.length - 1;
      if (index !== undefined) {
        event.preventDefault();
        select(index, event);
        buttons[index].focus();
      }
    };
  }
  cancelDialogs() {
    this.hideMenu();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  }
  showMenu(button, event, keyboard = false) {
    this.hideMenu();
    this.menuAnchor = button;
    const count = this.editor().selection.size;
    document.querySelector('#page-menu-title').textContent = count === 1 ?
      `Pagina ${Number(button.dataset.index) + 1}` : `${count} pagine selezionate`;
    this.menu.showPopover();
    const rect = button.getBoundingClientRect();
    const x = keyboard ? rect.left + 12 : event.clientX + 4;
    const y = keyboard ? rect.bottom : event.clientY + 4;
    const menuRect = this.menu.getBoundingClientRect();
    this.menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menuRect.width - 8))}px`;
    this.menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menuRect.height - 8))}px`;
    (this.menu.querySelector('button:not(:disabled)') ?? this.menu).focus({ preventScroll: true });
  }
  hideMenu(restoreFocus = false) {
    if (!this.menu.matches(':popover-open')) return;
    this.menu.hidePopover();
    if (restoreFocus && this.menuAnchor?.isConnected) this.menuAnchor.focus({ preventScroll: true });
  }
  showMove() {
    const editor = this.editor();
    const count = editor.selection.size;
    if (!count) return;
    const maximum = editor.pages.length - count + 1;
    const input = document.querySelector('#move-position');
    input.max = String(maximum);
    input.value = String(Math.min(maximum, editor.pages.findIndex(page => editor.selection.has(page.id)) + 1));
    document.querySelector('#move-description').textContent = count === 1 ?
      `Indicare la posizione finale della pagina, da 1 a ${maximum}.` :
      `Le ${count} pagine selezionate saranno unite in un blocco, mantenendo il loro ordine. Indicare la posizione finale della prima pagina, da 1 a ${maximum}.`;
    document.querySelector('#move-dialog').showModal();
    input.focus(); input.select();
  }
  showDelete() {
    const editor = this.editor();
    if (!editor.selection.size || editor.selection.size === editor.pages.length) return;
    document.querySelector('#delete-description').textContent =
      `Eliminare ${editor.selection.size === 1 ? 'la pagina selezionata' : `le ${editor.selection.size} pagine selezionate`}? L’operazione può essere annullata.`;
    document.querySelector('#delete-dialog').showModal();
    document.querySelector('#delete-cancel').focus();
  }
  clear() {
    this.hideMenu();
    this.generation++;
    this.observer.disconnect();
    this.renderQueue = [];
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.list.replaceChildren();
  }
  refresh(open) {
    if (this.unavailable()) this.hideMenu();
    this.element.hidden = !open;
    if (!open || !this.editor()) { this.clear(); this.documentId = null; return; }
    if (this.documentId !== this.session.currentId) {
      this.clear();
      this.documentId = this.session.currentId;
      const editor = this.editor();
      const document = this.plugin('document-manager').getDocument(this.documentId);
      editor.pages.forEach((page, index) => {
        const button = documentOwner.createElement('button');
        button.type = 'button';
        button.className = 'page-tile';
        button.dataset.index = String(index);
        button.setAttribute('role', 'option');
        button.setAttribute('aria-label', `Pagina ${index + 1}`);
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-controls', 'page-menu');
        const preview = documentOwner.createElement('div');
        preview.className = 'page-preview';
        const size = document.pages[index].size;
        preview.style.aspectRatio = `${size.width} / ${size.height}`;
        const image = documentOwner.createElement('img');
        image.alt = '';
        image.draggable = false;
        preview.append(image);
        const label = documentOwner.createElement('span');
        label.textContent = String(index + 1);
        button.append(preview, label);
        button.onclick = event => {
          if (this.unavailable()) return;
          this.hideMenu();
          this.select(index, event);
        };
        button.oncontextmenu = event => {
          event.preventDefault();
          event.stopPropagation();
          if (this.unavailable()) return;
          // Right-click preserves an existing group, or selects the clicked page.
          this.select(index, {}, this.editor().selection.has(page.id));
          this.showMenu(button, event, event.clientX === 0 && event.clientY === 0);
        };
        this.list.append(button);
        this.observer.observe(button);
      });
    }
    this.updateSelection();
  }
  updateSelection() {
    const editor = this.editor();
    if (!editor) return;
    const count = editor.selection.size;
    document.querySelector('#selection-count').textContent = `${count} ${count === 1 ? 'pagina selezionata' : 'pagine selezionate'}`;
    document.querySelector('#edit-reason').textContent = editor.blockedReason;
    document.querySelector('#edit-reason').hidden = !editor.blockedReason;
    for (const button of document.querySelectorAll('[data-operation]'))
      button.disabled = this.unavailable() || !editor.canEdit || !count ||
        (button.dataset.operation === 'delete' && count === editor.pages.length);
    for (const button of this.list.querySelectorAll('.page-tile')) {
      const page = editor.pages[Number(button.dataset.index)];
      const selected = editor.selection.has(page.id);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = page.id === editor.anchor ? 0 : -1;
    }
  }
  async pump() {
    while (this.rendering < 2 && this.renderQueue.length) {
      const item = this.renderQueue.shift();
      if (item.generation !== this.generation) continue;
      this.rendering++;
      (async () => {
        try {
          const blob = await this.plugin('thumbnail').forDocument(item.documentId)
            .renderThumb(Number(item.element.dataset.index), 1).toPromise();
          if (item.generation !== this.generation) return;
          const url = URL.createObjectURL(blob);
          this.urls.add(url);
          item.element.querySelector('img').src = url;
        } catch {
          if (item.generation === this.generation) item.element.title = 'Anteprima non disponibile; cliccare per visualizzare la pagina.';
        } finally { this.rendering--; this.pump(); }
      })();
    }
  }
}

// Keep the DOM document distinct from PDF document objects returned by plugins.
const documentOwner = document;
