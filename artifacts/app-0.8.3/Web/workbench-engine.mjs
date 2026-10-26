export const MAX_TOOL_ITEMS = 2000;
export function validateRegion(region, width, height, minimum = 1) {
  if (!region || ![region.x, region.y, region.width, region.height, width, height].every(Number.isFinite) ||
      region.x < 0 || region.y < 0 || region.width < minimum || region.height < minimum ||
      region.x + region.width > width + .1 || region.y + region.height > height + .1)
    throw new Error('Selezionare un’area interna alla pagina.');
  return region;
}
export function blacken(pixels, imageWidth, imageHeight, region, pageWidth, pageHeight) {
  validateRegion(region, pageWidth, pageHeight);
  const x0 = Math.max(0, Math.floor(region.x * imageWidth / pageWidth));
  const y0 = Math.max(0, Math.floor(region.y * imageHeight / pageHeight));
  const x1 = Math.min(imageWidth, Math.ceil((region.x + region.width) * imageWidth / pageWidth));
  const y1 = Math.min(imageHeight, Math.ceil((region.y + region.height) * imageHeight / pageHeight));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const offset = (y * imageWidth + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0; pixels[offset + 3] = 255;
  }
}

export function createWorkbenchTools(api, textTools) {
  const check = (ok, message = 'Operazione PDF non riuscita.') => { if (!ok) throw new Error(message); };
  const alloc = n => { const p = api.pdfium.wasmExports.malloc(n); check(p); return p; };
  const free = p => api.pdfium.wasmExports.free(p);
  function wide(text, fn) {
    const p = alloc((text.length + 1) * 2);
    try { for (let i = 0; i <= text.length; i++) api.pdfium.HEAPU16[p / 2 + i] = text.charCodeAt(i) || 0; return fn(p); }
    finally { free(p); }
  }
  const set = (a, key, text) => wide(text, p => check(api.FPDFAnnot_SetStringValue(a, key, p)));
  function get(a, key) {
    const length = api.FPDFAnnot_GetStringValue(a, key, 0, 0);
    check(length >= 0 && length <= 22000, 'Annotazione troppo lunga.');
    if (length < 2) return '';
    const p = alloc(length);
    try { check(api.FPDFAnnot_GetStringValue(a, key, p, length)); return new TextDecoder('utf-16le').decode(api.pdfium.HEAPU8.slice(p, p + length - 2)); }
    finally { free(p); }
  }
  function annotations(page) {
    const result = [], count = api.FPDFPage_GetAnnotCount(page); check(count >= 0 && count <= MAX_TOOL_ITEMS);
    for (let index = 0; index < count; index++) {
      const a = api.FPDFPage_GetAnnot(page, index); check(a);
      try {
        if (get(a, 'PDFMBTool') !== '1') continue;
        const id = get(a, 'NM'), type = api.FPDFAnnot_GetSubtype(a), contents = get(a, 'Contents');
        const p = alloc(16);
        try { check(api.FPDFAnnot_GetRect(a, p)); result.push({ id, type, contents,
          position: textTools.screenRect(page, Array.from(api.pdfium.HEAPF32.slice(p / 4, p / 4 + 4))) }); }
        finally { free(p); }
      } finally { api.FPDFPage_CloseAnnot(a); }
    }
    return result;
  }
  function objects(page, allowText) {
    const result = [], count = api.FPDFPage_CountObjects(page); check(count >= 0 && count <= MAX_TOOL_ITEMS, 'Pagina troppo complessa per l’editor oggetti.');
    const textPage = allowText ? api.FPDFText_LoadPage(page) : 0;
    const p = alloc(32);
    try {
      for (let index = 0; index < count; index++) {
        const object = api.FPDFPage_GetObject(page, index); check(object);
        const type = api.FPDFPageObj_GetType(object);
        if (!api.FPDFPageObj_GetBounds(object, p, p + 4, p + 8, p + 12)) continue;
        const [left, bottom, right, top] = api.pdfium.HEAPF32.slice(p / 4, p / 4 + 4);
        let text = '', size = 12, font = 'Helvetica';
        if (type === 1 && textPage) {
          const length = api.FPDFTextObj_GetText(object, textPage, 0, 0);
          if (length > 2 && length <= 20002) {
            const s = alloc(length);
            try { api.FPDFTextObj_GetText(object, textPage, s, length); text = new TextDecoder('utf-16le').decode(api.pdfium.HEAPU8.slice(s, s + length - 2)); }
            finally { free(s); }
          }
          if (api.FPDFTextObj_GetFontSize(object, p + 16)) size = api.pdfium.HEAPF32[(p + 16) / 4];
          const handle = api.FPDFTextObj_GetFont(object), n = handle && api.FPDFFont_GetBaseFontName(handle, 0, 0);
          if (n > 0 && n < 512) {
            const name = alloc(n);
            try {
              api.FPDFFont_GetBaseFontName(handle, name, n);
              const family = new TextDecoder().decode(api.pdfium.HEAPU8.slice(name, name + n));
              font = /courier/i.test(family) ? 'Courier' : /times/i.test(family) ? 'Times-Roman' : 'Helvetica';
            } finally { free(name); }
          }
        }
        result.push({ index, type, text, size, font, position: textTools.screenRect(page, [left, top, right, bottom]) });
      }
      return result;
    } finally { if (textPage) api.FPDFText_ClosePage(textPage); free(p); }
  }
  function rect(page, region) {
    const { width, height } = textTools.geometry(page); validateRegion(region, width, height);
    const a = textTools.point(page, region.x, region.y), b = textTools.point(page, region.x + region.width, region.y + region.height);
    return [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[0], b[0]), Math.min(a[1], b[1])];
  }
  function mutateAnnotation(page, input) {
    check(['note', 'square', 'circle', 'line', 'ink', 'annotation-update', 'annotation-delete'].includes(input.operation));
    if (input.operation.startsWith('annotation-')) {
      check(/^pdfmb-tool-[0-9a-f-]{36}$/.test(input.id));
      let found = false;
      for (let i = api.FPDFPage_GetAnnotCount(page) - 1; i >= 0; i--) {
        const a = api.FPDFPage_GetAnnot(page, i); check(a);
        let match;
        try {
          match = get(a, 'PDFMBTool') === '1' && get(a, 'NM') === input.id;
          if (match && input.operation === 'annotation-update') {
            check(api.FPDFAnnot_GetSubtype(a) === 1, 'Solo le note adesive hanno un contenuto modificabile.');
            check(typeof input.contents === 'string' && input.contents.trim() && input.contents.length <= 10000, 'Scrivere da 1 a 10.000 caratteri.');
            set(a, 'Contents', input.contents);
            check(api.EPDFAnnot_GenerateAppearance(a));
          }
        } finally { api.FPDFPage_CloseAnnot(a); }
        if (match) { found = true; if (input.operation === 'annotation-delete') check(api.FPDFPage_RemoveAnnot(page, i)); break; }
      }
      check(found, 'Annotazione non più disponibile.');
    } else {
      check(api.FPDFPage_GetAnnotCount(page) < MAX_TOOL_ITEMS, 'Troppe annotazioni nella pagina.');
      const types = { note: 1, line: 4, square: 5, circle: 6, ink: 15 };
      const bounds = rect(page, input.region), a = api.EPDFPage_CreateAnnot(page, types[input.operation]); check(a);
      const p = alloc(16);
      try {
        api.pdfium.HEAPF32.set(bounds, p / 4); check(api.FPDFAnnot_SetRect(a, p));
        check(/^#[0-9a-f]{6}$/i.test(input.color) && Number.isFinite(input.stroke) && input.stroke >= .5 && input.stroke <= 20);
        const rgb = [1, 3, 5].map(i => parseInt(input.color.slice(i, i + 2), 16));
        check(api.FPDFAnnot_SetColor(a, 0, ...rgb, 255));
        check(api.EPDFAnnot_SetOpacity(a, 255));
        check(api.EPDFAnnot_SetBorderStyle(a, 1, input.stroke));
        check(api.FPDFAnnot_SetFlags(a, 4));
        set(a, 'NM', 'pdfmb-tool-' + crypto.randomUUID()); set(a, 'PDFMBTool', '1'); set(a, 'T', 'PDF MB');
        if (input.operation === 'note') {
          check(typeof input.contents === 'string' && input.contents.trim() && input.contents.length <= 10000, 'Scrivere da 1 a 10.000 caratteri.');
          set(a, 'Contents', input.contents); set(a, 'Name', 'Note');
        } else if (input.operation === 'line') {
          check(Array.isArray(input.points) && input.points.length >= 2);
          const ends = [input.points[0], input.points.at(-1)];
          const { width, height } = textTools.geometry(page);
          const points = ends.flatMap(point => {
            check(point.length === 2 && point.every(Number.isFinite) && point[0] >= 0 && point[1] >= 0 && point[0] <= width && point[1] <= height);
            return textTools.point(page, ...point);
          });
          api.pdfium.HEAPF32.set(points, p / 4); check(api.EPDFAnnot_SetLine(a, p, p + 8));
        } else if (input.operation === 'ink') {
          check(Array.isArray(input.points) && input.points.length >= 2 && input.points.length <= 10000);
          const { width, height } = textTools.geometry(page);
          const points = input.points.flatMap(point => {
            check(Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && point[0] >= 0 && point[1] >= 0 && point[0] <= width && point[1] <= height);
            return textTools.point(page, ...point);
          });
          const s = alloc(points.length * 4);
          try { api.pdfium.HEAPF32.set(points, s / 4); check(api.FPDFAnnot_AddInkStroke(a, s, input.points.length) >= 0); }
          finally { free(s); }
        }
        if (input.operation !== 'note') check(api.EPDFAnnot_ClearColor(a, 1));
        check(api.EPDFAnnot_GenerateAppearance(a), 'Aspetto annotazione non generato.');
      } finally { free(p); api.FPDFPage_CloseAnnot(a); }
    }
    check(api.FPDFPage_GenerateContent(page));
  }
  function mutateObject(document, page, input) {
    check(Number.isInteger(input.index) && input.index >= 0 && input.index < api.FPDFPage_CountObjects(page), 'Oggetto non disponibile.');
    const object = api.FPDFPage_GetObject(page, input.index); check(object);
    if (input.operation === 'object-delete') {
      check(api.FPDFPage_RemoveObject(page, object)); api.FPDFPageObj_Destroy(object);
    } else if (input.operation === 'object-transform') {
      const { dx, dy, scale, angle } = input;
      check([dx, dy, scale, angle].every(Number.isFinite) && Math.abs(dx) <= 2000 && Math.abs(dy) <= 2000 && scale >= .1 && scale <= 10 && Math.abs(angle) <= 360, 'Trasformazione non valida.');
      // Translation is expressed in displayed page coordinates; rotate/scale around object center.
      const p = alloc(16);
      try {
        check(api.FPDFPageObj_GetBounds(object, p, p + 4, p + 8, p + 12));
        const [l, b, r, t] = api.pdfium.HEAPF32.slice(p / 4, p / 4 + 4), x = (l + r) / 2, y = (b + t) / 2;
        const start = textTools.point(page, 0, 0), end = textTools.point(page, dx, dy);
        const a = scale * Math.cos(angle * Math.PI / 180), c = scale * Math.sin(angle * Math.PI / 180);
        api.FPDFPageObj_Transform(object, a, c, -c, a, x - a * x + c * y + end[0] - start[0], y - c * x - a * y + end[1] - start[1]);
      } finally { free(p); }
    } else if (input.operation === 'object-text') {
      check(api.FPDFPageObj_GetType(object) === 1, 'Selezionare un oggetto di testo.');
      check(typeof input.contents === 'string' && input.contents.length > 0 && input.contents.length <= 10000 && !/[^\u0020-\u007e\u00a0-\u00ff\u20ac]/u.test(input.contents), 'Usare testo occidentale su una sola riga (massimo 10.000 caratteri).');
      check(['Helvetica', 'Times-Roman', 'Courier'].includes(input.font) && Number.isFinite(input.size) && input.size >= 6 && input.size <= 144);
      const p = alloc(24); let replacement = 0, owned = false;
      try {
        check(api.FPDFPageObj_GetMatrix(object, p));
        const matrix = api.pdfium.HEAPF32.slice(p / 4, p / 4 + 6);
        replacement = api.FPDFPageObj_NewTextObj(document, input.font, input.size); check(replacement);
        wide(input.contents, ptr => check(api.FPDFText_SetText(replacement, ptr), 'Il font non può rappresentare il testo.'));
        api.pdfium.HEAPF32.set(matrix, p / 4); check(api.FPDFPageObj_SetMatrix(replacement, p));
        // Preserve the original fill color when available.
        if (api.FPDFPageObj_GetFillColor(object, p, p + 4, p + 8, p + 12))
          check(api.FPDFPageObj_SetFillColor(replacement, ...api.pdfium.HEAPU32.slice(p / 4, p / 4 + 4)));
        check(api.FPDFPage_InsertObjectAtIndex(page, replacement, input.index)); owned = true;
        check(api.FPDFPage_RemoveObject(page, object)); api.FPDFPageObj_Destroy(object);
      } finally { if (replacement && !owned) api.FPDFPageObj_Destroy(replacement); free(p); }
    } else throw new Error('Operazione sugli oggetti non valida.');
    check(api.FPDFPage_GenerateContent(page));
  }
  function rasterizeRedacted(document, page, region) {
    const { width, height } = textTools.geometry(page); validateRegion(region, width, height);
    const image = textTools.render(page, 2800, 2, document), pixels = new Uint8Array(image.pixels);
    blacken(pixels, image.width, image.height, region, width, height);
    // A fresh page contains only the sanitized pixels: original text, images,
    // annotations, alternate content and OCR layer never enter this document.
    const destination = api.FPDF_CreateNewDocument(); check(destination);
    let cleanPage = 0, p = 0, bitmap = 0, object = 0, inserted = false, success = false;
    try {
      cleanPage = api.FPDFPage_New(destination, 0, width, height); check(cleanPage);
      p = alloc(pixels.length);
      for (let i = 0; i < pixels.length; i += 4) { const b = pixels[i]; pixels[i] = pixels[i + 2]; pixels[i + 2] = b; }
      api.pdfium.HEAPU8.set(pixels, p);
      bitmap = api.FPDFBitmap_CreateEx(image.width, image.height, 4, p, image.width * 4); check(bitmap);
      object = api.FPDFPageObj_NewImageObj(destination); check(object);
      check(api.FPDFImageObj_SetBitmap(0, 0, object, bitmap));
      check(api.FPDFImageObj_SetMatrix(object, width, 0, 0, height, 0, 0));
      api.FPDFPage_InsertObject(cleanPage, object); inserted = true;
      check(api.FPDFPage_GenerateContent(cleanPage));
      success = true; return destination;
    }
    finally { if (bitmap) api.FPDFBitmap_Destroy(bitmap); if (object && !inserted) api.FPDFPageObj_Destroy(object); if (p) free(p); if (cleanPage) api.FPDF_ClosePage(cleanPage); if (!success) api.FPDF_CloseDocument(destination); }
  }
  return { annotations, objects, mutateAnnotation, mutateObject, rasterizeRedacted };
}
