// Native Highlight annotations. Geometry stays in PDF coordinates across rebuilds.
export function createHighlightTools(api, textTools) {
  const check = (ok, message = 'Impossibile elaborare l’evidenziazione.') => { if (!ok) throw new Error(message); };
  const alloc = size => { const p = api.pdfium.wasmExports.malloc(size); check(p); return p; };
  const free = p => api.pdfium.wasmExports.free(p);
  function string(annot, key, value) {
    if (value === undefined) {
      const n = api.FPDFAnnot_GetStringValue(annot, key, 0, 0);
      check(n >= 0 && n <= 2048);
      if (n < 2) return '';
      const p = alloc(n);
      try { check(api.FPDFAnnot_GetStringValue(annot, key, p, n)); return new TextDecoder('utf-16le').decode(api.pdfium.HEAPU8.slice(p, p + n - 2)); }
      finally { free(p); }
    }
    const p = alloc((value.length + 1) * 2);
    try {
      for (let i = 0; i <= value.length; i++) api.pdfium.HEAPU16[p / 2 + i] = i === value.length ? 0 : value.charCodeAt(i);
      check(api.FPDFAnnot_SetStringValue(annot, key, p));
    } finally { free(p); }
  }
  function list(page) {
    const result = [], count = api.FPDFPage_GetAnnotCount(page);
    check(count >= 0);
    for (let i = 0; i < count; i++) {
      const a = api.FPDFPage_GetAnnot(page, i); check(a);
      try {
        if (api.FPDFAnnot_GetSubtype(a) !== 9 || string(a, 'PDFMBHighlight') !== '1') continue;
        const id = string(a, 'NM');
        if (!/^pdfmb-h-[0-9a-f-]{36}$/.test(id)) continue;
        const p = alloc(16);
        try {
          check(api.FPDFAnnot_GetRect(a, p));
          result.push({ id, position: textTools.screenRect(page, Array.from(api.pdfium.HEAPF32.slice(p / 4, p / 4 + 4))) });
        } finally { free(p); }
      } finally { api.FPDFPage_CloseAnnot(a); }
    }
    return result;
  }
  function prepare(page, { id, rects, color }) {
    check(/^pdfmb-h-[0-9a-f-]{36}$/.test(id) && /^#[0-9a-f]{6}$/i.test(color), 'Evidenziazione non valida.');
    check(Array.isArray(rects) && rects.length > 0 && rects.length <= 1000, 'Selezionare il testo del PDF.');
    const { width, height } = textTools.geometry(page);
    const quads = rects.map(({ origin, size }) => {
      check(origin && size && [origin.x, origin.y, size.width, size.height].every(Number.isFinite) &&
        origin.x >= -.5 && origin.y >= -.5 && size.width > 0 && size.height > 0 &&
        origin.x + size.width <= width + .5 && origin.y + size.height <= height + .5,
        'La selezione del testo non corrisponde alla pagina.');
      // The viewer reports unscaled page rectangles, including permanent rotation.
      // PDFium converts every corner back to native PDF coordinates (CropBox included).
      return [textTools.point(page, origin.x, origin.y),
        textTools.point(page, origin.x + size.width, origin.y),
        textTools.point(page, origin.x, origin.y + size.height),
        textTools.point(page, origin.x + size.width, origin.y + size.height)].flat();
    });
    return { id, color: color.toLowerCase(), quads };
  }
  function apply(page, changes) {
    check(Array.isArray(changes) && changes.length <= 1000, 'Troppe evidenziazioni nella pagina.');
    const ids = new Set();
    for (const { id, value } of changes) {
      check(/^pdfmb-h-[0-9a-f-]{36}$/.test(id) && !ids.has(id)); ids.add(id);
      if (value) check(value.id === id && /^#[0-9a-f]{6}$/.test(value.color) && Array.isArray(value.quads) &&
        value.quads.length > 0 && value.quads.length <= 1000 && value.quads.every(q => q.length === 8 && q.every(Number.isFinite)));
    }
    for (let i = api.FPDFPage_GetAnnotCount(page) - 1; i >= 0; i--) {
      const a = api.FPDFPage_GetAnnot(page, i); check(a);
      let remove;
      try { remove = api.FPDFAnnot_GetSubtype(a) === 9 && string(a, 'PDFMBHighlight') === '1' && ids.has(string(a, 'NM')); }
      finally { api.FPDFPage_CloseAnnot(a); }
      if (remove) check(api.FPDFPage_RemoveAnnot(page, i));
    }
    for (const { value } of changes) {
      if (!value) continue;
      const a = api.EPDFPage_CreateAnnot(page, 9); check(a);
      const p = alloc(32);
      try {
        const points = value.quads.flat(), xs = points.filter((_, i) => i % 2 === 0), ys = points.filter((_, i) => i % 2);
        api.pdfium.HEAPF32.set([Math.min(...xs), Math.max(...ys), Math.max(...xs), Math.min(...ys)], p / 4);
        check(api.FPDFAnnot_SetRect(a, p));
        for (const quad of value.quads) { api.pdfium.HEAPF32.set(quad, p / 4); check(api.FPDFAnnot_AppendAttachmentPoints(a, p)); }
        string(a, 'NM', value.id); string(a, 'PDFMBHighlight', '1'); string(a, 'T', 'PDF MB');
        check(api.FPDFAnnot_SetFlags(a, 4));
        check(api.FPDFAnnot_SetColor(a, 0, ...[1, 3, 5].map(i => parseInt(value.color.slice(i, i + 2), 16)), 100));
      } finally { free(p); api.FPDFPage_CloseAnnot(a); }
    }
    check(api.FPDFPage_GenerateContent(page));
  }
  return { list, prepare, apply };
}
