import { validateRegion, MAX_TOOL_ITEMS } from './workbench-engine.mjs';

export function createStampTools(api, textTools) {
  const check = (ok, message = 'Impossibile applicare il timbro.') => { if (!ok) throw new Error(message); };
  function text(annot, key, value) {
    const p = api.pdfium.wasmExports.malloc((value.length + 1) * 2); check(p);
    try {
      for (let i = 0; i <= value.length; i++) api.pdfium.HEAPU16[p / 2 + i] = value.charCodeAt(i) || 0;
      check(api.FPDFAnnot_SetStringValue(annot, key, p));
    } finally { api.pdfium.wasmExports.free(p); }
  }
  function bounds(page, annot, region) {
    const { width, height } = textTools.geometry(page); validateRegion(region, width, height);
    const a = textTools.point(page, region.x, region.y), b = textTools.point(page, region.x + region.width, region.y + region.height);
    const p = api.pdfium.wasmExports.malloc(16); check(p);
    try { api.pdfium.HEAPF32.set([Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[0], b[0]), Math.min(a[1], b[1])], p / 4); check(api.FPDFAnnot_SetRect(annot, p)); }
    finally { api.pdfium.wasmExports.free(p); }
  }
  function apply(document, page, input) {
    const { image, region, label } = input;
    check(image && Number.isInteger(image.width) && Number.isInteger(image.height) && image.width > 0 && image.height > 0 &&
      image.width <= 1200 && image.height <= 1200 && image.pixels instanceof ArrayBuffer && image.pixels.byteLength === image.width * image.height * 4,
    'Immagine del timbro non valida.');
    check(typeof label === 'string' && label.length > 0 && label.length <= 120, 'Nome del timbro non valido.');
    check(api.FPDFPage_GetAnnotCount(page) < MAX_TOOL_ITEMS, 'Troppi elementi nella pagina.');
    const geometry = textTools.geometry(page); validateRegion(region, geometry.width, geometry.height);
    const annot = api.EPDFPage_CreateAnnot(page, 13); check(annot);
    let p = 0, bitmap = 0, object = 0, appended = false;
    try {
      bounds(page, annot, region);
      text(annot, 'NM', 'pdfmb-tool-' + crypto.randomUUID()); text(annot, 'PDFMBTool', '1');
      text(annot, 'Contents', label); text(annot, 'T', 'PDF MB'); text(annot, 'Name', 'PDFMBStamp');
      check(api.FPDFAnnot_SetFlags(annot, 4));
      const pixels = new Uint8Array(image.pixels.slice(0));
      for (let i = 0; i < pixels.length; i += 4) { const red = pixels[i]; pixels[i] = pixels[i + 2]; pixels[i + 2] = red; }
      p = api.pdfium.wasmExports.malloc(pixels.length); check(p); api.pdfium.HEAPU8.set(pixels, p);
      bitmap = api.FPDFBitmap_CreateEx(image.width, image.height, 4, p, image.width * 4); check(bitmap);
      object = api.FPDFPageObj_NewImageObj(document); check(object);
      check(api.FPDFImageObj_SetBitmap(0, 0, object, bitmap));
      const o = textTools.point(page, region.x, region.y + region.height);
      const x = textTools.point(page, region.x + region.width, region.y + region.height), y = textTools.point(page, region.x, region.y);
      check(api.FPDFImageObj_SetMatrix(object, x[0] - o[0], x[1] - o[1], y[0] - o[0], y[1] - o[1], o[0], o[1]));
      check(api.FPDFAnnot_AppendObject(annot, object)); appended = true;
      check(api.FPDFPage_GenerateContent(page));
    } finally {
      if (object && !appended) api.FPDFPageObj_Destroy(object);
      if (bitmap) api.FPDFBitmap_Destroy(bitmap);
      if (p) api.pdfium.wasmExports.free(p);
      api.FPDFPage_CloseAnnot(annot);
    }
  }
  return { apply };
}
