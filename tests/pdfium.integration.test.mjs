import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { init } from '@embedpdf/pdfium';
import { PDFDocument } from 'pdf-lib';
import { createTextTools } from '../src/PdfMB.Desktop/Web/text-engine.mjs';
import { createWorkbenchTools } from '../src/PdfMB.Desktop/Web/workbench-engine.mjs';
import { createHighlightTools } from '../src/PdfMB.Desktop/Web/highlight-engine.mjs';
import { createStampTools } from '../src/PdfMB.Desktop/Web/stamp-engine.mjs';

const wasm = await readFile(new URL('../node_modules/@embedpdf/pdfium/dist/pdfium.wasm', import.meta.url));
const api = await init({ wasmBinary: wasm }); api.PDFiumExt_Init();
const textTools = createTextTools(api), tools = createWorkbenchTools(api, textTools);
const alloc = size => api.pdfium.wasmExports.malloc(size);
const free = p => api.pdfium.wasmExports.free(p);
function writeText(object, text) {
  const p = alloc((text.length + 1) * 2);
  try { api.pdfium.HEAPU16.set([...text].map(c => c.charCodeAt(0)).concat(0), p / 2); assert.ok(api.FPDFText_SetText(object, p)); }
  finally { free(p); }
}
function fixture() {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 240, 200);
  for (const [value, x, y] of [['SECRET', 20, 140], ['VISIBLE', 20, 40]]) {
    const object = api.FPDFPageObj_NewTextObj(doc, 'Helvetica', 16);
    writeText(object, value); api.FPDFPageObj_Transform(object, 1, 0, 0, 1, x, y); api.FPDFPage_InsertObject(page, object);
  }
  assert.ok(api.FPDFPage_GenerateContent(page));
  return { doc, page, close() { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(doc); } };
}
function save(doc) {
  const writer = api.PDFiumExt_OpenFileWriter(); let p = 0;
  try {
    assert.ok(api.FPDF_SaveAsCopy(doc, writer, 2)); const size = api.PDFiumExt_GetFileWriterSize(writer); p = alloc(size);
    api.PDFiumExt_GetFileWriterData(writer, p, size); return api.pdfium.HEAPU8.slice(p, p + size).buffer;
  } finally { if (p) free(p); api.PDFiumExt_CloseFileWriter(writer); }
}
function reopen(buffer, fn) {
  const p = alloc(buffer.byteLength); api.pdfium.HEAPU8.set(new Uint8Array(buffer), p);
  const doc = api.FPDF_LoadMemDocument(p, buffer.byteLength, ''); assert.ok(doc);
  const page = api.FPDF_LoadPage(doc, 0); assert.ok(page);
  try { return fn(doc, page); } finally { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(doc); free(p); }
}
const region = { x: 10, y: 30, width: 120, height: 50 };

test('transparent native stamps survive save/reopen with all permanent rotations', () => {
  const stamps = createStampTools(api, textTools);
  for (let rotation = 0; rotation < 4; rotation++) {
    const f = fixture();
    try {
      const background = api.FPDFPageObj_CreateNewRect(0, 0, 240, 200);
      assert.ok(api.FPDFPageObj_SetFillColor(background, 0, 0, 255, 255));
      assert.ok(api.FPDFPath_SetDrawMode(background, 2, false));
      assert.ok(api.FPDFPage_InsertObjectAtIndex(f.page, background, 0));
      assert.ok(api.FPDFPage_GenerateContent(f.page));
      api.FPDFPage_SetRotation(f.page, rotation);
      const pixels = new Uint8Array(16 * 8 * 4);
      for (let y = 0; y < 8; y++) for (let x = 8; x < 16; x++) { const i = (y * 16 + x) * 4; pixels[i] = 255; pixels[i + 3] = x < 12 ? 255 : 128; }
      stamps.apply(f.doc, f.page, { operation: 'stamp', label: 'Personale trasparente',
        region: { x: 100, y: 90, width: 80, height: 40 }, image: { width: 16, height: 8, pixels: pixels.buffer } });
      reopen(save(f.doc), (_, page) => {
        const [stamp] = tools.annotations(page); assert.equal(stamp.type, 13); assert.equal(stamp.contents, 'Personale trasparente');
        const image = textTools.render(page), data = new Uint8Array(image.pixels), geometry = textTools.geometry(page);
        const at = (x, y) => [...data.slice((Math.round(y * image.height / geometry.height) * image.width + Math.round(x * image.width / geometry.width)) * 4,
          (Math.round(y * image.height / geometry.height) * image.width + Math.round(x * image.width / geometry.width)) * 4 + 4)];
        assert.deepEqual(at(120, 110), [0, 0, 255, 255]);
        assert.deepEqual(at(150, 110), [255, 0, 0, 255]);
        const blend = at(170, 110); assert.ok(Math.abs(blend[0] - 128) <= 1 && Math.abs(blend[2] - 127) <= 1);
        tools.mutateAnnotation(page, { operation: 'annotation-delete', id: stamp.id });
        assert.equal(api.FPDFPage_GetAnnotCount(page), 0);
      });
    } finally { f.close(); }
  }
});

test('reopened highlights expose individual hit regions with permanent page rotation', () => {
  const highlights = createHighlightTools(api, textTools);
  for (let rotation = 0; rotation < 4; rotation++) {
    const f = fixture();
    try {
      api.FPDFPage_SetRotation(f.page, rotation);
      const id = 'pdfmb-h-12345678-1234-1234-1234-123456789abc';
      const rects = [{ origin: { x: 10, y: 20 }, size: { width: 90, height: 12 } },
        { origin: { x: 10, y: 60 }, size: { width: 70, height: 12 } }];
      highlights.apply(f.page, [{ id, value: highlights.prepare(f.page, { id, color: '#ffff00', rects }) }]);
      reopen(save(f.doc), (_, page) => {
        const [item] = highlights.list(page);
        assert.equal(item.id, id); assert.equal(item.rotation, rotation);
        assert.equal(item.rects.length, 2);
        item.rects.forEach((p, i) => {
          assert.ok(Math.abs(p.x - rects[i].origin.x) < .1);
          assert.ok(Math.abs(p.y - rects[i].origin.y) < .1);
          assert.ok(Math.abs(p.width - rects[i].size.width) < .1);
          assert.ok(Math.abs(p.height - rects[i].size.height) < .1);
        });
      });
    } finally { f.close(); }
  }
});

test('PDFium native note, rectangle, ellipse, line and ink survive save/reopen, update and deletion', () => {
  const f = fixture();
  try {
    for (const operation of ['note', 'square', 'circle', 'line', 'ink']) tools.mutateAnnotation(f.page, {
      operation, region: { x: 120, y: 90, width: 50, height: 30 }, points: [[120, 90], [150, 100], [170, 120]],
      color: '#ffcc00', stroke: 2, contents: 'Nota di prova' });
    assert.equal(tools.annotations(f.page).length, 5);
    const bytes = save(f.doc);
    reopen(bytes, (doc, page) => {
      const notes = tools.annotations(page); assert.equal(notes.length, 5);
      const note = notes.find(note => note.type === 1); assert.equal(note.contents, 'Nota di prova');
      tools.mutateAnnotation(page, { operation: 'annotation-update', id: note.id, contents: 'Aggiornata' });
      assert.equal(tools.annotations(page).find(item => item.id === note.id).contents, 'Aggiornata');
      tools.mutateAnnotation(page, { operation: 'annotation-delete', id: note.id });
      assert.equal(tools.annotations(page).length, 4);
      const image = textTools.render(page); assert.equal(image.pixels.byteLength, image.width * image.height * 4);
    });
  } finally { f.close(); }
});
test('PDFium replaces actual text objects, transforms and deletes content without an overlay', () => {
  const f = fixture();
  try {
    assert.equal(tools.objects(f.page, true)[0].text, 'SECRET');
    tools.mutateObject(f.doc, f.page, { operation: 'object-text', index: 0, contents: 'PUBLIC', font: 'Courier', size: 14 });
    assert.equal(tools.objects(f.page, true)[0].text, 'PUBLIC');
    const previous = tools.objects(f.page, true)[0].position;
    tools.mutateObject(f.doc, f.page, { operation: 'object-transform', index: 0, dx: 10, dy: 12, scale: 1, angle: 0 });
    const after = tools.objects(f.page, true)[0].position;
    assert.ok(Math.abs(after.x - previous.x - 10) < .1);
    assert.ok(Math.abs(after.y - previous.y - 12) < .1);
    reopen(save(f.doc), (_, page) => assert.equal(tools.objects(page, true)[0].text, 'PUBLIC'));
    tools.mutateObject(f.doc, f.page, { operation: 'object-delete', index: 0 });
    assert.equal(tools.objects(f.page, true).length, 1);
    assert.equal(tools.objects(f.page, true)[0].text, 'VISIBLE');
  } finally { f.close(); }
});
test('PDFium redaction output has exactly one raster image and no text or annotations after reopen', () => {
  const f = fixture(); let clean = 0;
  try {
    clean = tools.rasterizeRedacted(f.doc, f.page, region);
    reopen(save(clean), (_, page) => {
      const objects = tools.objects(page, true); assert.equal(objects.length, 1); assert.equal(objects[0].type, 3);
      assert.equal(api.FPDFPage_GetAnnotCount(page), 0);
      const t = api.FPDFText_LoadPage(page);
      try { assert.equal(api.FPDFText_CountChars(t), 0); } finally { api.FPDFText_ClosePage(t); }
      const image = textTools.render(page), pixels = new Uint8Array(image.pixels);
      const x = Math.round(30 * image.width / 240), y = Math.round(50 * image.height / 200);
      assert.deepEqual([...pixels.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)], [0, 0, 0, 255]);
      // Visible text below the redaction remains visibly rendered.
      let nonwhite = 0;
      for (let y = Math.round(140 * image.height / 200); y < image.height; y++) for (let x = 0; x < image.width; x++)
        if (pixels[(y * image.width + x) * 4] < 128) nonwhite++;
      assert.ok(nonwhite > 10);
    });
  } finally { if (clean) api.FPDF_CloseDocument(clean); f.close(); }
});

// Exercise the production Worker dispatcher with its real WASM implementation.
// Only browser transport/loading is adapted to Node; handlers and rebuild code are unchanged.
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === './vendor/pdfium-api.js' ? '@embedpdf/pdfium' : specifier, context);
} });
let response;
globalThis.self = { postMessage: message => { response = message; } };
const realFetch = globalThis.fetch;
globalThis.fetch = async url => String(url).endsWith('pdfium.wasm') ? new Response(wasm) : realFetch(url);
await import('../src/PdfMB.Desktop/Web/page-worker.mjs');
let requestId = 0;
async function request(type, payload) {
  response = null; await self.onmessage({ data: { id: ++requestId, type, payload } });
  assert.equal(response.ok, true, response.error); return response.result;
}

test('blank PDF formats have correct physical sizes and insertion leaves source content intact', async () => {
  const expected = { A4: [210, 297], A5: [148, 210], A3: [297, 420] };
  for (const [format, mm] of Object.entries(expected)) for (const landscape of [false, true]) {
    const bytes = await request('create-blank', { format, landscape });
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    const size = landscape ? [...mm].reverse() : mm;
    assert.ok(Math.abs(pdf.getPage(0).getWidth() * 25.4 / 72 - size[0]) < .01);
    assert.ok(Math.abs(pdf.getPage(0).getHeight() * 25.4 / 72 - size[1]) < .01);
    reopen(bytes, (_, page) => { assert.equal(api.FPDFPage_CountObjects(page), 0); assert.equal(api.FPDFPage_GetAnnotCount(page), 0); });
  }
  await assert.rejects(request('create-blank', { format: 'A2', landscape: false }), /A4/);
  const f = fixture(), source = save(f.doc); f.close();
  await request('load', source);
  const blank = await request('create-blank', { format: 'A5', landscape: true });
  const prepared = await request('prepare-import', blank);
  const [inserted] = await request('register-import', { token: prepared.token, pageIndexes: [0] });
  const bytes = await request('rebuild', [inserted, { id: 0, rotation: 0, formFields: [] }]);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.ok(Math.abs(pdf.getPage(0).getWidth() * 25.4 / 72 - 210) < .01);
  assert.equal(pdf.getPage(1).getWidth(), 240);
  const restored = await request('rebuild', [{ id: 0, rotation: 0 }]);
  reopen(restored, (_, page) => assert.equal(tools.objects(page, true)[0].text, 'SECRET'));
});

test('managed forms survive Worker rotation, page overrides, extraction, reopening and redaction without orphan fields', async () => {
  const f = fixture();
  const second = api.FPDFPage_New(f.doc, 1, 240, 200); api.FPDF_ClosePage(second);
  const source = save(f.doc); f.close();
  const policy = await request('load', source); assert.ok(policy.canFormDesign);
  const prepare = (index, kind, name, value) => request('form-prepare', { buffer: source, pageIndex: index, pageId: index, input: {
    id: 'pdfmb-f-' + crypto.randomUUID(), kind, name, label: name, value, defaultValue: kind === 'text' ? '' : false,
    font: 'Helvetica', size: 14, color: '#112233', maxLength: 1000, required: false, readOnly: false, multiline: false,
    position: { x: 20, y: 20, width: kind === 'text' ? 150 : 20, height: 24 } } });
  const text = await prepare(0, 'text', 'nome', 'Città €'), checkbox = await prepare(1, 'checkbox', 'consenso', true);
  const pages = [{ id: 0, rotation: 1, formFields: [text] }, { id: 1, rotation: 0, formFields: [checkbox] }];
  let bytes = await request('rebuild', pages);
  let pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getForm().getTextField('nome').getText(), 'Città €');
  assert.ok(pdf.getForm().getCheckBox('consenso').isChecked());
  const context = await request('form-context', { buffer: bytes, pageIndex: 0 });
  assert.equal(context.width, 200); assert.equal(context.fields[0].name, 'nome');
  const note = await request('workbench-change', { buffer: bytes, pageIndex: 0, pageId: 0,
    input: { operation: 'note', region: { x: 160, y: 140, width: 24, height: 24 }, color: '#ffff00', stroke: 2, contents: 'Nota' } });
  pages[0] = { ...pages[0], override: note.override, rotation: 0 };
  bytes = await request('rebuild', pages);
  pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getForm().getFields().length, 2);
  assert.equal(pdf.getForm().getTextField('nome').getText(), 'Città €');
  const extracted = await request('extract', { buffer: bytes, pageIndexes: [1] });
  const single = await PDFDocument.load(extracted);
  assert.deepEqual(single.getForm().getFields().map(f => f.getName()), ['consenso']);
  assert.ok(single.getForm().getCheckBox('consenso').isChecked());
  // Remove a page and verify its global field tree entries disappear too.
  const removed = await request('rebuild', [pages[1]]);
  assert.deepEqual((await PDFDocument.load(removed)).getForm().getFields().map(f => f.getName()), ['consenso']);
  const redaction = await request('workbench-change', { buffer: bytes, pageIndex: 0, pageId: 0, pageOverride: note.override,
    input: { operation: 'redact', region: { x: 10, y: 10, width: 80, height: 80 } } });
  pages[0] = { ...pages[0], override: redaction.override, formFields: [] };
  bytes = await request('rebuild', pages);
  pdf = await PDFDocument.load(bytes);
  assert.deepEqual(pdf.getForm().getFields().map(f => f.getName()), ['consenso']);
  assert.ok(pdf.getForm().getCheckBox('consenso').isChecked());
  const reopened = await request('load', bytes);
  assert.equal(reopened.formPages[0].length, 0); assert.equal(reopened.formPages[1][0].value, true);
  const again = await request('rebuild', [{ id: 1, rotation: 0, formFields: reopened.formPages[1] }, { id: 0, rotation: 0, formFields: [] }]);
  assert.ok((await PDFDocument.load(again)).getForm().getCheckBox('consenso').isChecked());
});

test('shape appearances and styles persist through Worker rebuild, file reopen and later edits without note contents', async () => {
  const f = fixture(), source = save(f.doc); f.close();
  await request('load', source);
  let bytes = source, page = { id: 0, rotation: 0 };
  for (const operation of ['square', 'circle']) {
    const result = await request('workbench-change', { buffer: bytes, pageIndex: 0, pageId: 0, pageOverride: page.override,
      input: { operation, region: { x: 120, y: 90, width: 60, height: 40 }, color: '#ff0000', stroke: 3 } });
    page = { ...page, override: result.override }; bytes = await request('rebuild', [page]);
  }
  const verify = (buffer, color) => reopen(buffer, (_, handle) => {
    const shapes = tools.annotations(handle); assert.equal(shapes.length, 2);
    shapes.forEach(shape => { assert.equal(shape.contents, ''); assert.equal(shape.color, color); });
    for (let i = 0; i < 2; i++) {
      const annot = api.FPDFPage_GetAnnot(handle, i);
      try { assert.ok(api.FPDFAnnot_GetAP(annot, 0, 0, 0) > 2, 'Saved shape has a native appearance'); }
      finally { api.FPDFPage_CloseAnnot(annot); }
    }
    const image = textTools.render(handle), pixels = new Uint8Array(image.pixels);
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (color === '#ff0000' ? pixels[i] > 180 && pixels[i + 1] < 80 && pixels[i + 2] < 80 : pixels[i + 2] > 180 && pixels[i] < 80) colored++;
    }
    assert.ok(colored > 100, 'Shapes are visible in the saved PDF, outside the UI preview');
    return shapes;
  });
  const original = verify(bytes, '#ff0000');
  for (const shape of original) {
    const change = await request('workbench-change', { buffer: bytes, pageIndex: 0, pageId: 0, pageOverride: page.override,
      input: { operation: 'annotation-update', id: shape.id, color: '#0000ff', stroke: 5 } });
    page = { ...page, override: change.override }; bytes = await request('rebuild', [page]);
  }
  verify(bytes, '#0000ff').forEach(shape => assert.equal(shape.stroke, 5));
});

test('live text preview matches the committed PDF rendering and leaves original bytes untouched', async () => {
  const f = fixture(), source = save(f.doc); f.close();
  await request('load', source);
  const input = { operation: 'object-text', index: 0, contents: 'PREVIEW', font: 'Courier', size: 24 };
  const preview = await request('workbench-preview', { buffer: source, pageIndex: 0, pageId: 0, input });
  const original = await request('workbench-context', { buffer: source, pageIndex: 0, pageId: 0 });
  assert.equal(original.objects[0].text, 'SECRET'); assert.equal(original.objects[0].size, 16);
  assert.notDeepEqual(preview.image.pixels, original.image.pixels);
  const change = await request('workbench-change', { buffer: source, pageIndex: 0, pageId: 0, input });
  const bytes = await request('rebuild', [{ id: 0, rotation: 0, override: change.override }]);
  const committed = await request('workbench-context', { buffer: bytes, pageIndex: 0, pageId: 0 });
  assert.equal(committed.objects[0].text, 'PREVIEW'); assert.equal(committed.objects[0].font, 'Courier');
  assert.deepEqual(committed.image.pixels, preview.image.pixels);
});
test('production Worker composes notes, text edits, permanent rotation, redaction and subsequent edits', async () => {
  const f = fixture(); const source = save(f.doc); f.close();
  const policy = await request('load', source); assert.ok(policy.canContent && policy.canAnnotate);
  const pages = [{ id: 0, rotation: 0 }];
  let bytes = source;
  const note = await request('workbench-change', { buffer: bytes, pageIndex: 0, pageId: 0,
    input: { operation: 'note', region: { x: 180, y: 90, width: 24, height: 24 }, color: '#ffff00', stroke: 2, contents: 'Persistente' } });
  pages[0].override = note.override;
  bytes = await request('rebuild', pages);
  assert.equal((await request('workbench-context', { buffer: bytes, pageIndex: 0, pageId: 0 })).annotations.length, 1);
  pages[0].rotation = 1;
  bytes = await request('rebuild', pages);
  let context = await request('workbench-context', { buffer: bytes, pageIndex: 0, pageId: 0 });
  assert.equal(context.width, 200); assert.equal(context.height, 240);
  const change = await request('workbench-change', { buffer: bytes, pageIndex: 0, pageId: 0, pageOverride: note.override,
    input: { operation: 'object-text', index: 0, contents: 'CHANGED', font: 'Helvetica', size: 16 } });
  pages[0] = { id: 0, rotation: 0, override: change.override };
  bytes = await request('rebuild', pages);
  context = await request('workbench-context', { buffer: bytes, pageIndex: 0, pageId: 0 });
  assert.equal(context.width, 200); assert.equal(context.objects[0].text, 'CHANGED');
  const secret = context.objects[0].position;
  const redacted = await request('workbench-change', { buffer: bytes, pageIndex: 0, pageId: 0, pageOverride: change.override,
    input: { operation: 'redact', region: { x: Math.max(0, secret.x - 2), y: Math.max(0, secret.y - 2), width: secret.width + 4, height: secret.height + 4 } } });
  assert.equal(redacted.redacted, true);
  pages[0].override = redacted.override;
  bytes = await request('rebuild', pages);
  reopen(bytes, (_, page) => { assert.equal(api.FPDFPage_CountObjects(page), 1); assert.equal(api.FPDFPage_GetAnnotCount(page), 0); });
  // New annotations after redaction keep the sanitization flag and don't revive source text.
  const after = await request('workbench-change', { buffer: bytes, pageIndex: 0, pageId: 0, pageOverride: redacted.override,
    input: { operation: 'note', region: { x: 140, y: 180, width: 24, height: 24 }, color: '#ffff00', stroke: 2, contents: 'Dopo oscuramento' } });
  assert.equal(after.redacted, true);
  pages[0].override = after.override;
  bytes = await request('rebuild', pages);
  context = await request('workbench-context', { buffer: bytes, pageIndex: 0, pageId: 0 });
  assert.equal(context.annotations.length, 1);
  assert.equal(context.objects.length, 1); assert.equal(context.objects[0].type, 3);
  const printed = await request('output-page', { buffer: bytes, pageIndex: 0, pageId: 0, kind: 'print' });
  assert.ok(printed.image.pixels.byteLength > 0);
  const extracted = await request('extract', { buffer: bytes, pageIndexes: [0] });
  reopen(extracted, (_, page) => assert.equal(api.FPDFPage_CountObjects(page), 1));
});

test('form field appearances are rendered for printing and preserved outside a redacted area', () => {
  const appearance = 'q 0 0 1 rg 0 0 140 40 re f Q';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] /DR << /Font << /F1 6 0 R >> >> /DA (/F1 14 Tf 0 g) >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 200] /Resources << /Font << /F1 6 0 R >> >> /Annots [4 0 R] >>',
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (field) /V (FORM) /Rect [20 100 160 140] /F 4 /P 3 0 R /AP << /N 5 0 R >> /DA (/F1 14 Tf 0 g) >>',
    `<< /Type /XObject /Subtype /Form /BBox [0 0 140 40] /Resources << >> /Length ${appearance.length} >>\nstream\n${appearance}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.7\n', offsets = [0];
  objects.forEach((value, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const buffer = Uint8Array.from(Buffer.from(pdf)).buffer;
  reopen(buffer, (doc, page) => {
    assert.equal(api.FPDF_GetFormType(doc), 1);
    const image = textTools.render(page, 1400, 2, doc), pixels = new Uint8Array(image.pixels);
    const offset = (Math.round(70 * image.height / 200) * image.width + Math.round(40 * image.width / 240)) * 4;
    assert.deepEqual([...pixels.slice(offset, offset + 4)], [0, 0, 255, 255]);
    const clean = tools.rasterizeRedacted(doc, page, { x: 0, y: 0, width: 10, height: 10 });
    try {
      reopen(save(clean), (_, savedPage) => {
        const saved = textTools.render(savedPage), bytes = new Uint8Array(saved.pixels);
        assert.deepEqual([...bytes.slice(offset, offset + 4)], [0, 0, 255, 255]);
        assert.equal(api.FPDFPage_GetAnnotCount(savedPage), 0);
      });
    } finally { api.FPDF_CloseDocument(clean); }
  });
});
