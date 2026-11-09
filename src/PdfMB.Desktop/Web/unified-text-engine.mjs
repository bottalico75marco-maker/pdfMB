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
  // Only native text is placed one padding inside its box; see textLayout.
  const paddingOf = input => input.source === 'content' ? LAYOUT_PADDING : 0;
  const layout = (document, input, width) =>
    measured(document, input, measure => textLayout(input.contents, width, input.size, measure, paddingOf(input)));
  const natural = (document, input) =>
    measured(document, input, measure => naturalLayout(input.contents, input.size, measure));
  function compact(document, page, input) {
    const bounds = raw(page, input.position);
    const requested = Number.isFinite(input.layoutWidth) && input.layoutWidth >= 12 ? input.layoutWidth : bounds.width;
    // An unconstrained block, such as a single line the user never resized,
    // grows rightwards and only wraps at the edge of the page.
    const sheet = raw(page, { x: 0, y: 0, ...textTools.geometry(page) });
    // The box is rounded up past the lines it holds: leave that room before
    // the edge, or a line wrapped exactly at the page would be rejected.
    const available = Math.max(12, sheet.x + sheet.width - bounds.x - .25);
    const measured = layout(document, input, Math.max(12, Math.min(requested, available)));
    // A box sized to its text near the bottom or right edge moves inside the
    // page instead of failing validation and holding the draft hostage.
    const x = Math.max(sheet.x, Math.min(bounds.x, sheet.x + sheet.width - measured.width));
    const y = Math.max(sheet.y, Math.min(bounds.y, sheet.y + sheet.height - measured.height));
    return { ...input, position: screen(page, { x, y, width: measured.width, height: measured.height }), layout: measured };
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
        font: item.fontCode, fontKey: item.fontKey, size: item.size * m[0], color: item.color, rawPosition: item.rawPosition,
        // Raw space is PDF user space with y negated: the text origin's y is the baseline.
        baseline: -m[5] });
    }
    // The page's text layer, with the spaces PDFium found or inserted, decides
    // whether two native fragments are separated by a space. Its characters are
    // located by origin; where it has none, the ink gap decides as before.
    const characters = [];
    if (canContent) {
      const textPage = api.FPDFText_LoadPage(page);
      if (textPage) {
        const p = alloc(16);
        try {
          for (let i = 0, count = api.FPDFText_CountChars(textPage); i < count; i++) {
            const code = api.FPDFText_GetUnicode(textPage, i);
            if (api.FPDFText_GetCharOrigin(textPage, i, p, p + 8))
              characters.push({ x: api.pdfium.HEAPF64[p / 8], baseline: -api.pdfium.HEAPF64[(p + 8) / 8], space: code === 32 || code === 160 || code === 9 });
          }
        } finally { free(p); api.FPDFText_ClosePage(textPage); }
      }
    }
    // Characters are located by origin; a space PDFium inserted has no place
    // of its own, so the sequence decides: the first glyph of the fragment is
    // found, and the text layer is read backwards to the previous glyph. A
    // space on the way separates the two; none means they are joined. When
    // the previous glyph is not the line's last one the text layer runs in
    // another order here, and the answer is left to the ink gap.
    const near = (c, item) => Math.abs(c.baseline - item.baseline) <= item.size * .22;
    const spaceBetween = (line, item) => {
      if (item.source !== 'content' || !characters.length) return null;
      const x = item.rawPosition.x, end = line.rawPosition.x + line.rawPosition.width;
      let first = -1, distance = Infinity;
      for (let i = 0; i < characters.length; i++) {
        const c = characters[i];
        if (c.space || !near(c, item) || c.x > x + .5 || c.x < x - item.size * .3) continue;
        if (Math.abs(c.x - x) < distance) { distance = Math.abs(c.x - x); first = i; }
      }
      if (first < 0) return null;
      let separated = false;
      for (let i = first - 1; i >= 0; i--) {
        const c = characters[i];
        if (c.space) { separated = true; continue; }
        return near(c, item) && c.x <= end + .5 && c.x >= line.rawPosition.x - item.size * .3 ? separated : null;
      }
      return null;
    };
    return groupNearbyText(items, { spaceBetween }).map(group => {
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
      // Where the text's baseline sits below the box top, in points: the inline
      // editor aligns its own baseline to it instead of hanging the text lower.
      const baselineOffset = group.source === 'content' && Number.isFinite(group.baseline) ? group.baseline - box.y : undefined;
      return { ...group, position, ...(baselineOffset === undefined ? {} : { baselineOffset }) };
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
