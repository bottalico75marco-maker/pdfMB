import { commandIcon } from './form-icons.mjs';

export function installCommandIcons() {
  const commands = {
    'new-document': 'new', open: 'open', 'panel-close': 'cancel', 'dismiss-error': 'cancel',
    'text-new': 'text', 'text-smaller': 'minus', 'text-larger': 'plus', 'text-bold': 'bold', 'text-italic': 'italic',
    'text-delete': 'delete', 'text-cancel': 'cancel', 'tools-previous': 'previous', 'tools-next': 'next',
    'tools-reset-preview': 'undo', 'tools-apply': 'apply', 'tools-delete': 'delete',
    'text-context-copy': 'copy', 'text-context-paste': 'paste', 'move-confirm': 'move', 'delete-confirm': 'delete'
  };
  for (const [id, kind] of Object.entries(commands)) {
    const button = document.getElementById(id);
    commandIcon(button, kind, button.getAttribute('aria-label') || button.textContent.trim(), button.getAttribute('role') === 'menuitem');
  }
  for (const button of document.querySelectorAll('[data-tools-close]')) commandIcon(button, 'exit', 'Chiudi strumenti');
  for (const button of document.querySelectorAll('[data-cancel-dialog]')) commandIcon(button, 'cancel', 'Annulla');
  for (const button of document.querySelectorAll('[popovertarget="stamp-palette"]')) commandIcon(button, 'palette', 'Tavolozza timbri');
  for (const button of document.querySelectorAll('[data-highlight-remove]')) commandIcon(button, 'delete', 'Elimina evidenziazione', true);
  for (const button of document.querySelectorAll('[data-highlight-dismiss]')) commandIcon(button, 'cancel', 'Chiudi menu');
  const pageCommands = { 'rotate-left': 'rotateLeft', 'rotate-right': 'rotateRight', delete: 'delete', move: 'move', 'insert-blank': 'new', insert: 'import', extract: 'extract' };
  for (const button of document.querySelectorAll('[data-operation]')) commandIcon(button, pageCommands[button.dataset.operation], button.textContent.trim(), true);
  const upload = document.querySelector('.stamp-upload');
  const input = upload.querySelector('input');
  commandIcon(upload, 'upload', 'Carica PNG personale');
  input.setAttribute('aria-label', 'Carica PNG personale'); upload.append(input);
}
