import { groupNearbyText, LAYOUT_PADDING, naturalLayout, standardFonts, textLayout } from './text-layout.mjs';

export function createUnifiedTextTools(api, textTools, workbenchTools) {
  const check = (ok, message = 'Impossibile modificare il blocco di testo.') => { if (!ok) throw new Error(message); };
  const alloc = n => { const p = api.pdfium.wasmExports.malloc(n); check(p); return p; };
  const free = p => api.pdfium.wasmExports.free(p);
  const raw = (page, position) => {
    const a = textTools.point(page, position.x, position.y), b = textTools.point(page, position.x + position.width, position.y + position.height);
    return { x: Math.min(a[0], b[0]), y: -Math.max(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) };
  };
  const screen = (page, p) => textTools.screenRect(page, [p.x, -p.y, p.x + p.width, -p.y - p.height]);
  function measured(document, input, flow) {
    check(standardFonts[input.font] && Number.isFinite(input.size) && input.size >= 6 && input.size <= 144, 'Font o dimensione non validi.');
    const font = api.FPDFText_LoadStandardFont(document, standardFonts[input.font]); check(font);
    const p = alloc(4), widths = new Map();
    try {
      return flow(text => [...text].reduce((sum, ch) => {
        if (!widths.has(ch)) {
          check(api.FPDFFont_GetGlyphWidth(font, ch.codePointAt(0), input.size, p), 'Il font non può rappresentare il testo.');
          widths.set(ch, api.pdfium.HEAPF32[p / 4]);
        }
        return sum + widths.get(ch);
      }, 0));
    } finally { free(p); api.FPDFFont_Close(font); }
  }
  const layout = (document, input, width) =>
    measured(document, input, measure => textLayout(input.contents, width, input.size, measure));
  const natural = (document, input) =>
    measured(document, input, measure => naturalLayout(input.contents, input.size, measure));
  function compact(document, page, input) {
    const bounds = raw(page, input.position);
    const requested = Number.isFinite(input.layoutWidth) && input.layoutWidth >= 12 ? input.layoutWidth : bounds.width;
    // An unconstrained block, such as a single line the user never resized,
    // grows rightwards and only wraps at the edge of the page.
    const sheet = raw(page, { x: 0, y: 0, ...textTools.geometry(page) });
    const available = Math.max(12, sheet.x + sheet.width - bounds.x);
    const measured = layout(document, input, Math.max(12, Math.min(requested, available)));
    return { ...input, position: screen(page, { ...bounds, width: measured.width, height: measured.height }), layout: measured };
  }
  function groups(document, page, { canContent = true, canAnnotate = true } = {}) {
    const items = [];
    if (canAnnotate) for (const note of textTools.notes(page)) {
      let position = note.position;
      try { position = compact(document, page, note).position; } catch { /* A legacy field remains selectable for correction. */ }
      items.push({ ...note, source: 'annotation', members: [note.id], fontKey: String(note.font), rawPosition: raw(page, position) });
    }
    if (canContent) for (const item of workbenchTools.objects(page, true)) {
      const m = item.matrix;
      // Text rotated with the page is supported; skewed or individually rotated
      // artwork stays in the object inspector, rather than being silently flattened.
      if (item.type !== 1 || item.renderMode !== 0 || item.opacity !== 255 || !item.text.trim() || !m || Math.abs(m[1]) > .001 || Math.abs(m[2]) > .001 || m[0] <= 0 || m[3] <= 0 || Math.abs(m[0] - m[3]) > .01) continue;
      items.push({ id: `content-${item.index}`, source: 'content', members: [item.index], contents: item.text.trimEnd(),
        font: item.fontCode, fontKey: item.fontKey, size: item.size * m[0], color: item.color, rawPosition: item.rawPosition });
    }
    return groupNearbyText(items).map(group => {
      const p = group.rawPosition, geometry = textTools.geometry(page);
      let box = p;
      if (group.source === 'content') {
        // Size the block from the advance widths a commit will use, not from the
        // glyph bounding box: the bounding box is narrower than the text it
        // holds, so selecting an untouched paragraph re-wrapped its last word.
        let flowed = null;
        try { flowed = natural(document, group); } catch { /* An unsupported size or glyph stays selectable for correction. */ }
        const pad = flowed?.padding ?? LAYOUT_PADDING;
        // Pad the top only: the commit offsets the first line by one padding,
        // and a bottom pad would push the block over the next line's box.
        box = { x: p.x - pad, y: p.y - pad, width: Math.max(p.width + pad * 2, flowed?.width ?? 0),
          height: Math.max(p.height + pad, flowed?.height ?? group.size * 1.2) };
      }
      const position = screen(page, box);
      position.x = Math.max(0, position.x); position.y = Math.max(0, position.y);
      position.width = Math.min(position.width, geometry.width - position.x);
      position.height = Math.min(position.height, geometry.height - position.y);
      return { ...group, position };
    });
  }
  function remove(page, group) {
    if (group.source === 'annotation') textTools.apply(page, group.members.map(id => ({ id, value: null })));
    else for (const index of [...group.members].sort((a, b) => b - a)) {
      const object = api.FPDFPage_GetObject(page, index); check(object && api.FPDFPageObj_GetType(object) === 1);
      check(api.FPDFPage_RemoveObject(page, object)); api.FPDFPageObj_Destroy(object);
    }
  }
  function change(document, page, input) {
    const group = groups(document, page).find(group => group.id === input.id);
    check(group, 'Il testo è cambiato. Selezionarlo di nuovo.');
    if (input.remove) { remove(page, group); check(api.FPDFPage_GenerateContent(page)); return; }
    const fitted = compact(document, page, input);
    // Use the existing validation for bounds, Western glyphs and style before
    // changing the temporary page. A failure never commits a document revision.
    const annotationId = group.source === 'annotation' ? group.members[0] : `pdfmb-${crypto.randomUUID()}`;
    const prepared = textTools.prepare(page, { ...fitted, id: annotationId });
    if (group.source === 'annotation') {
      remove(page, group); textTools.apply(page, [{ id: annotationId, value: prepared }]); return;
    }
    const position = raw(page, fitted.position), p = alloc(16), replacements = [];
    try {
      for (const [index, line] of fitted.layout.lines.entries()) {
        if (!line) continue;
        const object = api.FPDFPageObj_NewTextObj(document, standardFonts[input.font], input.size); check(object);
        replacements.push(object);
        const value = alloc((line.length + 1) * 2);
        try {
          for (let i = 0; i <= line.length; i++) api.pdfium.HEAPU16[value / 2 + i] = line.charCodeAt(i) || 0;
          check(api.FPDFText_SetText(object, value));
        } finally { free(value); }
        check(api.FPDFPageObj_GetBounds(object, p, p + 4, p + 8, p + 12));
        const left = api.pdfium.HEAPF32[p / 4], top = api.pdfium.HEAPF32[p / 4 + 3];
        const pad = fitted.layout.padding;
        api.FPDFPageObj_Transform(object, 1, 0, 0, 1, position.x + pad - left, -position.y - pad - index * input.size * 1.2 - top);
        check(api.FPDFPageObj_SetFillColor(object, ...[1, 3, 5].map(offset => parseInt(input.color.slice(offset, offset + 2), 16)), 255));
      }
      const insertAt = Math.min(...group.members);
      remove(page, group);
      for (let i = 0; i < replacements.length; i++) {
        check(api.FPDFPage_InsertObjectAtIndex(page, replacements[i], insertAt + i)); replacements[i] = 0;
      }
      check(api.FPDFPage_GenerateContent(page));
    } finally { for (const object of replacements) if (object) api.FPDFPageObj_Destroy(object); free(p); }
  }
  return { groups, remove, change, compact };
}
