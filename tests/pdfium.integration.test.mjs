import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { init } from '@embedpdf/pdfium';
import { createTextTools } from '../src/PdfMB.Desktop/Web/text-engine.mjs';
import { createWorkbenchTools } from '../src/PdfMB.Desktop/Web/workbench-engine.mjs';

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

test('form field appearances are present in captures and preserved outside a redacted area', () => {
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
