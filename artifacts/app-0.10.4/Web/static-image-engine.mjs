import { validateRegion, MAX_TOOL_ITEMS } from './workbench-engine.mjs';

export function containImage(image, region) {
  const scale = Math.min(region.width / image.width, region.height / image.height);
  const width = image.width * scale, height = image.height * scale;
  return { x: region.x + (region.width - width) / 2, y: region.y + (region.height - height) / 2, width, height };
}

// A page image object, without a widget, action, annotation or upload control.
export function createStaticImageTools(api, text) {
  const check = (value, message = 'Impossibile inserire l’immagine.') => { if (!value) throw new Error(message); };
  function apply(document, page, { image, region }) {
    check(image && Number.isInteger(image.width) && Number.isInteger(image.height) && image.width > 0 && image.height > 0 &&
      image.width <= 1200 && image.height <= 1200 && image.pixels instanceof ArrayBuffer && image.pixels.byteLength === image.width * image.height * 4, 'Immagine non valida.');
    const geometry = text.geometry(page); validateRegion(region, geometry.width, geometry.height, 12);
    check(api.FPDFPage_CountObjects(page) < MAX_TOOL_ITEMS, 'Troppi oggetti nella pagina.');
    const bounds = containImage(image, region), pixels = new Uint8Array(image.pixels.slice(0));
    for (let i = 0; i < pixels.length; i += 4) { const red = pixels[i]; pixels[i] = pixels[i + 2]; pixels[i + 2] = red; }
    let pointer = 0, bitmap = 0, object = 0, inserted = false;
    try {
      pointer = api.pdfium.wasmExports.malloc(pixels.length); check(pointer);
      api.pdfium.HEAPU8.set(pixels, pointer);
      bitmap = api.FPDFBitmap_CreateEx(image.width, image.height, 4, pointer, image.width * 4); check(bitmap);
      object = api.FPDFPageObj_NewImageObj(document); check(object);
      check(api.FPDFImageObj_SetBitmap(0, 0, object, bitmap));
      const origin = text.point(page, bounds.x, bounds.y + bounds.height);
      const x = text.point(page, bounds.x + bounds.width, bounds.y + bounds.height), y = text.point(page, bounds.x, bounds.y);
      check(api.FPDFImageObj_SetMatrix(object, x[0] - origin[0], x[1] - origin[1], y[0] - origin[0], y[1] - origin[1], origin[0], origin[1]));
      check(api.FPDFPage_InsertObjectAtIndex(page, object, api.FPDFPage_CountObjects(page))); inserted = true;
      check(api.FPDFPage_GenerateContent(page));
    } finally {
      if (object && !inserted) api.FPDFPageObj_Destroy(object);
      if (bitmap) api.FPDFBitmap_Destroy(bitmap);
      if (pointer) api.pdfium.wasmExports.free(pointer);
    }
  }
  return { apply };
}
