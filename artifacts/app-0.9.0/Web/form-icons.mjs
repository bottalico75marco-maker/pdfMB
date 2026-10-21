const paths = {
  select: '<path d="m5 3 14 9-7 1-3 7Z"/>',
  text: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 8h8m-4 0v8m-2 0h4"/>',
  checkbox: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>',
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
};
export function installFormIcons(root) {
  for (const button of root.querySelectorAll('[data-icon]')) button.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[button.dataset.icon]}</svg>`;
}
