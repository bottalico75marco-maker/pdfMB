const paths = {
  ocr: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 8h10m-5 0v9m-3 0h6"/>',
  markdown: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M5 16V8l3 4 3-4v8m6-8v8m-3-3 3 3 3-3"/>',
  datetime: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-9 3v4l3 2"/>',
  button: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',
  protect: '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
  unprotect: '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M11 10V6a5 5 0 0 1 10 0M12 15v3"/>',
  select: '<path d="m5 3 14 9-7 1-3 7Z"/>',
  text: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 8h8m-4 0v8m-2 0h4"/>',
  checkbox: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>',
  dropdown: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 12h6m3-2 3 3 3-3M15 5v14"/>',
  preview: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M4 3h13l4 4v14H3V3Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
  saveAs: '<path d="M3 13V3h14l4 4v6M7 3v6h10V3M14 19h8m-4-4v8M3 17h7v5H3Z"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>',
  redo: '<path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14"/>',
  previous: '<path d="m15 5-7 7 7 7"/>', next: '<path d="m9 5 7 7-7 7"/>',
  zoomIn: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
  zoomOut: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7h10v10H7Z"/>',
  delete: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  apply: '<path d="m4 12 5 5L20 6"/>', cancel: '<path d="m6 6 12 12M6 18 18 6"/>',
  exit: '<path d="M10 4H4v16h6m4-14 6 6-6 6M8 12h12"/>',
  new: '<path d="M5 2h9l5 5v15H5Z"/><path d="M14 2v5h5M8 15h8m-4-4v8"/>',
  open: '<path d="M2 8V5h6l3 3h11l-3 12H2Z"/><path d="M2 8h8"/>',
  plus: '<path d="M4 12h16M12 4v16"/>', minus: '<path d="M4 12h16"/>',
  bold: '<path d="M6 3h6a4.5 4.5 0 0 1 0 9H6Zm0 9h8a4.5 4.5 0 0 1 0 9H6Z"/>',
  italic: '<path d="M11 3h9M4 21h9M15 3 8 21"/>',
  palette: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  upload: '<path d="M4 15v6h16v-6M12 16V3m-5 5 5-5 5 5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  paste: '<rect x="4" y="5" width="16" height="17" rx="2"/><rect x="8" y="2" width="8" height="5" rx="1"/>',
  move: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
  rotateLeft: '<path d="m7 3-4 5 6 2M3 8a9 9 0 1 1 0 8"/>',
  rotateRight: '<path d="m17 3 4 5-6 2m6-2a9 9 0 1 0 0 8"/>',
  import: '<path d="M5 2h9l5 5v15H5ZM14 2v5h5M12 10v9m-4-4 4 4 4-4"/>',
  extract: '<path d="M5 2h9l5 5v15H5ZM14 2v5h5M12 19v-9m-4 4 4-4 4 4"/>',
};
export function commandIcon(element, kind, label, menu = false) {
  element.dataset.icon = kind;
  element.setAttribute('aria-label', label);
  element.title = label;
  element.classList.add('icon-command');
  if (menu) element.classList.add('menu-command');
  renderIcon(element);
}
function renderIcon(element) {
  const path = paths[element.dataset.icon];
  if (!path) throw new Error(`Icona sconosciuta: ${element.dataset.icon}`);
  element.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  if (element.classList.contains('menu-command')) {
    const label = document.createElement('span'); label.textContent = element.getAttribute('aria-label'); element.append(label);
  }
}
export function installFormIcons(root) {
  for (const button of root.querySelectorAll('[data-icon]')) renderIcon(button);
}
