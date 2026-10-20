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
  function characters(page) {
    const text = api.FPDFText_LoadPage(page); check(text);
    const p = alloc(32);
    try {
      const count = api.FPDFText_CountChars(text); check(count >= 0 && count <= 100000, 'La pagina contiene troppo testo.');
      const chars = [];
      for (let i = 0; i < count; i++) {
        const code = api.FPDFText_GetUnicode(text, i);
        if (!code || code <= 32 || code > 0x10ffff) continue;
        if (!api.FPDFText_GetCharBox(text, i, p, p + 8, p + 16, p + 24)) continue;
        const [left, right, bottom, top] = api.pdfium.HEAPF64.slice(p / 8, p / 8 + 4);
        const position = textTools.screenRect(page, [left, top, right, bottom]);
        if (position.width > 0 && position.height > 0) chars.push({ index: i, text: String.fromCodePoint(code), position });
      }
      return chars;
    } finally { free(p); api.FPDFText_ClosePage(text); }
  }
  function prepare(page, { id, start, end, color }) {
    check(/^pdfmb-h-[0-9a-f-]{36}$/.test(id) && /^#[0-9a-f]{6}$/i.test(color), 'Evidenziazione non valida.');
    const text = api.FPDFText_LoadPage(page); check(text);
    const p = alloc(32);
    try {
      const count = api.FPDFText_CountChars(text);
      check(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end < count && end - start < 10000,
        'Selezionare da 1 a 10.000 caratteri della pagina.');
      const n = api.FPDFText_CountRects(text, start, end - start + 1);
      check(n > 0 && n <= 1000, 'Nessun testo selezionabile. I PDF scansiti richiedono OCR.');
      const quads = [];
      for (let i = 0; i < n; i++) {
        check(api.FPDFText_GetRect(text, i, p, p + 8, p + 16, p + 24));
        const [left, top, right, bottom] = api.pdfium.HEAPF64.slice(p / 8, p / 8 + 4);
        check([left, top, right, bottom].every(Number.isFinite) && right > left && top > bottom);
        quads.push([left, top, right, top, left, bottom, right, bottom]);
      }
      return { id, color: color.toLowerCase(), quads };
    } finally { free(p); api.FPDFText_ClosePage(text); }
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
  return { list, characters, prepare, apply };
}
