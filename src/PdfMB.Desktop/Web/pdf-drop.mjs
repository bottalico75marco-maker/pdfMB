export function installPdfDrop({ target, unavailable, open, showError }) {
  const isFile = event => [...(event.dataTransfer?.types ?? [])].includes('Files');
  const over = event => {
    if (!isFile(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    event.dataTransfer.dropEffect = unavailable() ? 'none' : 'copy';
  };
  const drop = event => {
    if (!isFile(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (unavailable()) return;
    const files = [...event.dataTransfer.files];
    if (files.length !== 1 || !/\.pdf$/i.test(files[0].name)) {
      showError(new Error('Trascina un solo file PDF.')); return;
    }
    try { open(files[0]); } catch (error) { showError(error); }
  };
  const options = { capture: true };
  target.addEventListener('dragover', over, options);
  target.addEventListener('drop', drop, options);
  return () => { target.removeEventListener('dragover', over, options); target.removeEventListener('drop', drop, options); };
}
