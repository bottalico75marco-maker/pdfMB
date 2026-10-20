// FreeText authoring is kept in the same local PDFium Worker as page editing.
export function createTextTools(api) {
  const limit = 10000;
  const alloc = size => {
    const ptr = api.pdfium.wasmExports.malloc(size);
    if (!ptr) throw new Error('Memoria insufficiente.');
    return ptr;
  };
  const free = ptr => api.pdfium.wasmExports.free(ptr);
  const checked = (ok, message = 'Impossibile elaborare il testo PDF.') => { if (!ok) throw new Error(message); };
  function wide(value, action) {
    const ptr = alloc((value.length + 1) * 2);
    try {
      for (let i = 0; i <= value.length; i++) api.pdfium.HEAPU16[ptr / 2 + i] = i === value.length ? 0 : value.charCodeAt(i);
      return action(ptr);
    } finally { free(ptr); }
  }
  function readString(annot, key) {
    const length = api.FPDFAnnot_GetStringValue(annot, key, 0, 0);
    if (length < 2) return '';
    if (length > (limit + 100) * 2) throw new Error('Testo PDF troppo lungo per questo editor.');
    const ptr = alloc(length);
    try {
      checked(api.FPDFAnnot_GetStringValue(annot, key, ptr, length));
      return new TextDecoder('utf-16le').decode(api.pdfium.HEAPU8.slice(ptr, ptr + length - 2));
    } finally { free(ptr); }
  }
  const setString = (annot, key, value) => wide(value, ptr => checked(api.FPDFAnnot_SetStringValue(annot, key, ptr)));
  function geometry(page) {
    const width = api.FPDF_GetPageWidthF(page), height = api.FPDF_GetPageHeightF(page);
    if (!(width > 0 && height > 0) || !Number.isFinite(width + height)) throw new Error('Dimensioni pagina non valide.');
    return { width, height, rotation: api.FPDFPage_GetRotation(page) };
  }
  function point(page, x, y, reverse = false) {
    const size = geometry(page), ptr = alloc(16);
    // Fixed sub-point resolution avoids zoom-dependent placement and handles
    // CropBox origins and all four permanent page rotations via PDFium itself.
    const scale = 16;
    try {
      if (reverse) {
        checked(api.FPDF_PageToDevice(page, 0, 0, Math.round(size.width * scale), Math.round(size.height * scale), 0,
          x, y, ptr, ptr + 8));
        return [api.pdfium.HEAP32[ptr / 4] / scale, api.pdfium.HEAP32[(ptr + 8) / 4] / scale];
      }
      checked(api.FPDF_DeviceToPage(page, 0, 0, Math.round(size.width * scale), Math.round(size.height * scale), 0,
        Math.round(x * scale), Math.round(y * scale), ptr, ptr + 8));
      return [api.pdfium.HEAPF64[ptr / 8], api.pdfium.HEAPF64[(ptr + 8) / 8]];
    } finally { free(ptr); }
  }
  function screenRect(page, rect) {
    const a = point(page, rect[0], rect[1], true), b = point(page, rect[2], rect[3], true);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
  }
  function readNote(annot) {
    if (api.FPDFAnnot_GetSubtype(annot) !== 3 || readString(annot, 'PDFMBText') !== '1') return null;
    const id = readString(annot, 'NM');
    if (!/^pdfmb-[0-9a-f-]{36}$/.test(id)) return null;
    const ptr = alloc(40);
    try {
      checked(api.FPDFAnnot_GetRect(annot, ptr));
      const rect = Array.from(api.pdfium.HEAPF32.slice(ptr / 4, ptr / 4 + 4));
      checked(api.EPDFAnnot_GetDefaultAppearance(annot, ptr + 16, ptr + 20, ptr + 24, ptr + 28, ptr + 32));
      const font = api.pdfium.HEAP32[(ptr + 16) / 4], size = api.pdfium.HEAPF32[(ptr + 20) / 4];
      const color = '#' + [24, 28, 32].map(offset => (api.pdfium.HEAP32[(ptr + offset) / 4] & 255).toString(16).padStart(2, '0')).join('');
      return { id, contents: readString(annot, 'Contents'), font, size, color, rect };
    } finally { free(ptr); }
  }
  function notes(page) {
    const result = [];
    const count = api.FPDFPage_GetAnnotCount(page);
    if (count < 0) throw new Error('Impossibile leggere le annotazioni.');
    for (let i = 0; i < count; i++) {
      const annot = api.FPDFPage_GetAnnot(page, i);
      if (!annot) throw new Error('Annotazione non leggibile.');
      try {
        const value = readNote(annot);
        if (value) result.push({ ...value, position: screenRect(page, value.rect) });
      } finally { api.FPDFPage_CloseAnnot(annot); }
    }
    return result;
  }
  function validate(value) {
    checked(value && /^pdfmb-[0-9a-f-]{36}$/.test(value.id), 'Identificativo testo non valido.');
    checked(typeof value.contents === 'string' && value.contents.trim() && value.contents.length <= limit, 'Inserire da 1 a 10.000 caratteri.');
    // These standard fonts cover Western text. Never save missing glyphs silently.
    checked(!/[^\u0020-\u007e\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122\n]/u.test(value.contents),
      'I font disponibili supportano testo occidentale, accenti e simbolo €. Rimuovere i caratteri non supportati.');
    checked(Number.isInteger(value.font) && value.font >= 0 && value.font <= 11, 'Font non valido.');
    checked(Number.isFinite(value.size) && value.size >= 6 && value.size <= 144, 'Indicare una dimensione da 6 a 144 pt.');
    checked(/^#[0-9a-f]{6}$/i.test(value.color), 'Colore non valido.');
    checked(Array.isArray(value.rect) && value.rect.length === 4 && value.rect.every(Number.isFinite) &&
      value.rect[2] > value.rect[0] && value.rect[1] > value.rect[3], 'Rettangolo del testo non valido.');
  }
  function prepare(page, input) {
    const { width, height } = geometry(page);
    const p = input.position;
    checked(p && [p.x, p.y, p.width, p.height].every(Number.isFinite) && p.x >= 0 && p.y >= 0 &&
      p.width >= 12 && p.height >= 12 && p.x + p.width <= width + .1 && p.y + p.height <= height + .1,
      'La casella deve essere interamente nella pagina e misurare almeno 12 × 12 pt.');
    const a = point(page, p.x, p.y), b = point(page, p.x + p.width, p.y + p.height);
    const value = { id: input.id, contents: input.contents.replace(/\r\n?/g, '\n').replace(/\t/g, '    '),
      font: input.font, size: input.size, color: input.color.toLowerCase(),
      rect: [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[0], b[0]), Math.min(a[1], b[1])] };
    // Keep identical raw coordinates when the user only edits text/style.
    const existing = notes(page).find(note => note.id === value.id);
    if (existing && ['x', 'y', 'width', 'height'].every(key => Math.abs(existing.position[key] - p[key]) < .1)) value.rect = existing.rect;
    validate(value);
    return value;
  }
  function appearanceText(annot) {
    const length = api.FPDFAnnot_GetAP(annot, 0, 0, 0);
    if (length <= 2) return '';
    checked(length <= 4 * 1024 * 1024, 'Aspetto del testo troppo grande.');
    const ptr = alloc(length);
    try {
      checked(api.FPDFAnnot_GetAP(annot, 0, ptr, length));
      return new TextDecoder('utf-16le').decode(api.pdfium.HEAPU8.slice(ptr, ptr + length - 2));
    } finally { free(ptr); }
  }
  function appearance(annot, value) {
    // The native setter takes an 8-bit alpha, unlike the SDK's 0..1 wrapper.
    // Generate directly on the destination annotation: exporting/importing its
    // AP through a page can leave operators referring to the wrong Resources.
    checked(api.EPDFAnnot_SetOpacity(annot, 255));
    const rgb = [1, 3, 5].map(offset => parseInt(value.color.slice(offset, offset + 2), 16));
    checked(api.EPDFAnnot_SetDefaultAppearance(annot, value.font, value.size, ...rgb));
    checked(api.FPDFAnnot_SetAP(annot, 0, 0)); // remove broken legacy wrappers
    checked(api.EPDFAnnot_GenerateAppearance(annot), 'Impossibile generare l’aspetto del testo.');
    checked(/\b(?:Tj|TJ)\b/.test(appearanceText(annot)),
      'Il motore non ha generato il testo della casella. Provare un altro font o una casella più grande.');
  }
  function needsRepair(page) {
    const count = api.FPDFPage_GetAnnotCount(page), ptr = alloc(4);
    try {
      checked(count >= 0, 'Impossibile leggere le annotazioni.');
      for (let i = 0; i < count; i++) {
        const annot = api.FPDFPage_GetAnnot(page, i);
        checked(annot, 'Annotazione non leggibile.');
        try {
          const value = readNote(annot);
          if (!value || !value.contents.trim()) continue;
          checked(api.EPDFAnnot_GetOpacity(annot, ptr));
          if (api.pdfium.HEAP32[ptr / 4] !== 255 || !/\b(?:Tj|TJ)\b/.test(appearanceText(annot))) return true;
        } finally { api.FPDFPage_CloseAnnot(annot); }
      }
      return false;
    } finally { free(ptr); }
  }
  function repairAppearances(page, skip = new Set()) {
    const count = api.FPDFPage_GetAnnotCount(page);
    for (let i = 0; i < count; i++) {
      const annot = api.FPDFPage_GetAnnot(page, i);
      checked(annot, 'Annotazione non leggibile.');
      try {
        const value = readNote(annot);
        if (value && !skip.has(value.id) && value.contents.trim()) appearance(annot, value);
      } finally { api.FPDFPage_CloseAnnot(annot); }
    }
  }
  function apply(page, changes) {
    if (!Array.isArray(changes) || changes.length > 1000) throw new Error('Troppe caselle di testo nella pagina.');
    const ids = new Set();
    for (const change of changes) {
      checked(/^pdfmb-[0-9a-f-]{36}$/.test(change.id) && !ids.has(change.id), 'Elenco testi non valido.');
      ids.add(change.id);
      if (change.value) { validate(change.value); checked(change.id === change.value.id); }
    }
    for (let i = api.FPDFPage_GetAnnotCount(page) - 1; i >= 0; i--) {
      const annot = api.FPDFPage_GetAnnot(page, i);
      if (!annot) throw new Error('Annotazione non leggibile.');
      let remove = false;
      try { remove = api.FPDFAnnot_GetSubtype(annot) === 3 && readString(annot, 'PDFMBText') === '1' && ids.has(readString(annot, 'NM')); }
      finally { api.FPDFPage_CloseAnnot(annot); }
      if (remove) checked(api.FPDFPage_RemoveAnnot(page, i));
    }
    for (const { value } of changes) {
      if (!value) continue;
      const annot = api.EPDFPage_CreateAnnot(page, 3);
      checked(annot, 'Impossibile creare la casella di testo.');
      let ptr = 0;
      try {
        ptr = alloc(16);
        api.pdfium.HEAPF32.set(value.rect, ptr / 4);
        checked(api.FPDFAnnot_SetRect(annot, ptr));
        setString(annot, 'NM', value.id);
        setString(annot, 'PDFMBText', '1');
        setString(annot, 'Contents', value.contents);
        setString(annot, 'T', 'PDF MB');
        checked(api.FPDFAnnot_SetFlags(annot, 4)); // printable, rotates with the page
        checked(api.EPDFAnnot_SetBorderStyle(annot, 1, 0));
        checked(api.EPDFAnnot_ClearColor(annot, 0)); // transparent background
        checked(api.EPDFAnnot_SetTextAlignment(annot, 0));
        checked(api.EPDFAnnot_SetVerticalAlignment(annot, 0));
        appearance(annot, value);
      } finally { if (ptr) free(ptr); api.FPDFPage_CloseAnnot(annot); }
    }
    checked(api.FPDFPage_GenerateContent(page));
  }
  function render(page, maximumSide = 1400, maximumScale = 2, document = 0) {
    const { width, height } = geometry(page), scale = Math.min(maximumScale, maximumSide / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const ptr = alloc(w * h * 4);
    let bitmap = 0;
    try {
      bitmap = api.FPDFBitmap_CreateEx(w, h, 4, ptr, w * 4);
      checked(bitmap);
      api.FPDFBitmap_FillRect(bitmap, 0, 0, w, h, 0xffffffff);
      api.FPDF_RenderPageBitmap(bitmap, page, 0, 0, w, h, 0, 1); // BGRA; converted once below
      if (document && api.FPDF_GetFormType(document)) {
        const info = api.PDFiumExt_OpenFormFillInfo(); checked(info);
        let form = 0;
        try {
          form = api.PDFiumExt_InitFormFillEnvironment(document, info); checked(form, 'Impossibile renderizzare i moduli della pagina.');
          api.FORM_OnAfterLoadPage(page, form);
          try { api.FPDF_FFLDraw(form, bitmap, page, 0, 0, w, h, 0, 1); }
          finally { api.FORM_OnBeforeClosePage(page, form); }
        } finally { if (form) api.PDFiumExt_ExitFormFillEnvironment(form); api.PDFiumExt_CloseFormFillInfo(info); }
      }
      const pixels = api.pdfium.HEAPU8.slice(ptr, ptr + w * h * 4);
      for (let i = 0; i < pixels.length; i += 4) { const b = pixels[i]; pixels[i] = pixels[i + 2]; pixels[i + 2] = b; }
      return { pixels: pixels.buffer, width: w, height: h };
    } finally { if (bitmap) api.FPDFBitmap_Destroy(bitmap); free(ptr); }
  }
  return { notes, geometry, point, screenRect, prepare, apply, repairAppearances, needsRepair, render };
}

