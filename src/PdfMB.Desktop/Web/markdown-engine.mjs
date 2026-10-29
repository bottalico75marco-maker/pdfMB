// Extraction stays in the PDF worker; no document data is sent over the network here.
export function markdownImages(api, page) {
  const images = []; let objects = 0;
  function visit(parent, depth = 0) {
    if (depth > 16) throw new Error('Struttura grafica troppo complessa.');
    const n = parent === page ? api.FPDFPage_CountObjects(parent) : api.FPDFFormObj_CountObjects(parent);
    for (let i = 0; i < n; i++) {
      if (++objects > 100000) throw new Error('Troppi oggetti nella pagina.');
      const object = parent === page ? api.FPDFPage_GetObject(parent, i) : api.FPDFFormObj_GetObject(parent, i);
      const type = api.FPDFPageObj_GetType(object);
      if (type === 3) images.push(object);
      if (type === 5) visit(object, depth + 1);
    }
  }
  visit(page); return images;
}

export function extractMarkdownImage(api, document, page, index) {
  const object = markdownImages(api, page)[index];
  if (!object) throw new Error('Immagine PDF non disponibile.');
  const bitmap = api.FPDFImageObj_GetRenderedBitmap(document, page, object);
  if (!bitmap) throw new Error('Impossibile estrarre questa immagine dal PDF.');
  try {
    const width = api.FPDFBitmap_GetWidth(bitmap), height = api.FPDFBitmap_GetHeight(bitmap);
    const stride = api.FPDFBitmap_GetStride(bitmap), format = api.FPDFBitmap_GetFormat(bitmap);
    const pointer = api.FPDFBitmap_GetBuffer(bitmap);
    if (!pointer || width < 1 || height < 1 || width * height > 32000000 || ![1, 2, 3, 4].includes(format))
      throw new Error('Formato o dimensioni immagine non supportati (massimo 32 milioni di pixel).');
    const scale = Math.min(1, 2200 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const pixels = new Uint8Array(w * h * 4), bytes = format === 1 ? 1 : format === 2 ? 3 : 4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const source = pointer + Math.min(height - 1, Math.floor(y / scale)) * stride + Math.min(width - 1, Math.floor(x / scale)) * bytes;
      const target = (y * w + x) * 4, data = api.pdfium.HEAPU8;
      const alpha = format === 4 ? data[source + 3] / 255 : 1;
      for (let channel = 0; channel < 3; channel++) pixels[target + channel] = Math.round((format === 1 ? data[source] : data[source + 2 - channel]) * alpha + 255 * (1 - alpha));
      pixels[target + 3] = 255;
    }
    return { width: w, height: h, pixels: pixels.buffer };
  } finally { api.FPDFBitmap_Destroy(bitmap); }
}

export function extractMarkdownPage(api, page) {
  const textPage = api.FPDFText_LoadPage(page);
  if (!textPage) throw new Error('Impossibile leggere il testo della pagina.');
  let pointer = 0;
  try {
    const count = api.FPDFText_CountChars(textPage);
    if (count < 0 || count > 1000000) throw new Error('Pagina troppo lunga per la conversione Markdown.');
    pointer = api.pdfium.wasmExports.malloc((count + 1) * 2);
    if (!pointer) throw new Error('Memoria insufficiente.');
    const length = api.FPDFText_GetText(textPage, 0, count, pointer);
    const text = new TextDecoder('utf-16le').decode(api.pdfium.HEAPU8.slice(pointer, pointer + Math.max(0, length - 1) * 2));
    const sizes = [];
    for (let i = 0; i < count; i++) {
      const size = api.FPDFText_GetFontSize(textPage, i);
      if (size > 0 && Number.isFinite(size)) sizes.push(size);
    }
    sizes.sort((a, b) => a - b);
    const bodySize = sizes[Math.floor(sizes.length / 2)] || 12;
    let offset = 0;
    const lines = text.replace(/\r\n?/g, '\n').split('\n').map(line => {
      // PDFium character indices include CR/LF. Locate each line in the original text.
      const start = text.indexOf(line, offset); offset = Math.max(offset, start + line.length);
      const size = start >= 0 && line.trim() ? api.FPDFText_GetFontSize(textPage, start) : bodySize;
      const clean = line.trim().replace(/^[•●▪]\s*/, '- ');
      return size >= bodySize * 1.3 && clean.length < 160 ? `${size >= bodySize * 1.7 ? '##' : '###'} ${clean}` : clean;
    });
    const imageCount = markdownImages(api, page).length;
    let markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!markdown) markdown = '> Nessun testo selezionabile: usare OCR e descrivi foto per leggere questa pagina.';
    return { markdown, imageCount, hasText: !!text.trim() };
  } finally {
    if (pointer) api.pdfium.wasmExports.free(pointer);
    api.FPDFText_ClosePage(textPage);
  }
}

export const pageMarker = number => `<!-- pdfmb-page:${number} -->`;
export function markdownPageAt(text, offset) {
  const before = text.slice(0, offset);
  return Number([...before.matchAll(/^<!-- pdfmb-page:(\d+) -->\s*$/gm)].at(-1)?.[1] || 1);
}
export function markdownPageOffset(text, number) {
  const match = new RegExp(`^<!-- pdfmb-page:${number} -->\\s*$`, 'm').exec(text);
  return match?.index ?? -1;
}

// Render a deliberately inert Markdown subset: HTML and URLs never become active content.
export function renderMarkdown(container, text) {
  const doc = container.ownerDocument, fragment = doc.createDocumentFragment();
  let code = null, list = null, paragraph = null, table = null;
  function inline(node, value) {
    for (const part of value.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)) {
      const tag = part.startsWith('`') && part.endsWith('`') ? 'code' : part.startsWith('**') && part.endsWith('**') ? 'strong' : part.startsWith('*') && part.endsWith('*') ? 'em' : null;
      if (!tag) node.append(doc.createTextNode(part));
      else { const child = doc.createElement(tag); child.textContent = part.slice(tag === 'strong' ? 2 : 1, tag === 'strong' ? -2 : -1); node.append(child); }
    }
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      if (code) code = null;
      else { const pre = doc.createElement('pre'); code = doc.createElement('code'); pre.append(code); fragment.append(pre); }
      paragraph = list = table = null; continue;
    }
    if (code) { code.append(doc.createTextNode(line + '\n')); continue; }
    const marker = /^<!-- pdfmb-page:(\d+) -->\s*$/.exec(line);
    if (marker) { const anchor = doc.createElement('div'); anchor.dataset.page = marker[1]; fragment.append(anchor); paragraph = list = table = null; continue; }
    if (!line.trim()) { paragraph = list = table = null; continue; }
    if (line.includes('|') && (table || /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || ''))) {
      const header = !table;
      if (!table) { table = doc.createElement('table'); fragment.append(table); }
      const row = doc.createElement('tr');
      for (const value of line.replace(/^\s*\||\|\s*$/g, '').split('|')) { const cell = doc.createElement(header ? 'th' : 'td'); inline(cell, value.trim()); row.append(cell); }
      table.append(row); if (header) i++; paragraph = list = null; continue;
    }
    table = null;
    const heading = /^(#{1,6})\s+(.*)/.exec(line), item = /^\s*(?:([-+*])|\d+[.)])\s+(.*)/.exec(line);
    if (heading) { const node = doc.createElement(`h${heading[1].length}`); inline(node, heading[2]); fragment.append(node); paragraph = list = null; }
    else if (item) { const tag = item[1] ? 'ul' : 'ol'; if (!list || list.localName !== tag) { list = doc.createElement(tag); fragment.append(list); } const node = doc.createElement('li'); inline(node, item[2]); list.append(node); paragraph = null; }
    else if (/^>\s?/.test(line)) { const node = doc.createElement('blockquote'); inline(node, line.replace(/^>\s?/, '')); fragment.append(node); paragraph = list = null; }
    else if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { fragment.append(doc.createElement('hr')); paragraph = list = null; }
    else { list = null; if (!paragraph) { paragraph = doc.createElement('p'); fragment.append(paragraph); } else paragraph.append(doc.createElement('br')); inline(paragraph, line); }
  }
  container.replaceChildren(fragment);
}
