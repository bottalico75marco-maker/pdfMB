import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { init } from '@embedpdf/pdfium';
import { createTextTools } from '../src/PdfMB.Desktop/Web/text-engine.mjs';
import { createStaticImageTools } from '../src/PdfMB.Desktop/Web/static-image-engine.mjs';
import { extractMarkdownPage, extractMarkdownImage, markdownPageAt, markdownPageOffset, pageMarker } from '../src/PdfMB.Desktop/Web/markdown-engine.mjs';

const api = await init({ wasmBinary: await readFile(new URL('../node_modules/@embedpdf/pdfium/dist/pdfium.wasm', import.meta.url)) });
api.PDFiumExt_Init();
const images = createStaticImageTools(api, createTextTools(api));
test('PDF images are extracted individually, without text or neighboring images; UTF-8 text stays separate', () => {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 400, 400);
  try {
    const text = 'Caffè e città', object = api.FPDFPageObj_NewTextObj(doc, 'Helvetica', 12);
    const pointer = api.pdfium.wasmExports.malloc((text.length + 1) * 2);
    try {
      api.pdfium.HEAPU16.set([...text].map(c => c.charCodeAt(0)).concat(0), pointer / 2);
      assert.ok(api.FPDFText_SetText(object, pointer));
      api.FPDFPageObj_Transform(object, 1, 0, 0, 1, 20, 350); api.FPDFPage_InsertObject(page, object);
    } finally { api.pdfium.wasmExports.free(pointer); }
    for (const [index, color] of [[0, [255, 0, 0, 255]], [1, [0, 255, 0, 255]]]) {
      const pixels = new Uint8Array(16 * 8 * 4);
      for (let i = 0; i < pixels.length; i += 4) pixels.set(color, i);
      images.apply(doc, page, { image: { width: 16, height: 8, pixels: pixels.buffer }, region: { x: 20 + index * 150, y: 150, width: 100, height: 50 } });
    }
    const result = extractMarkdownPage(api, page);
    assert.equal(result.imageCount, 2); assert.equal(result.hasText, true); assert.match(result.markdown, /Caffè e città/);
    for (const [index, expected] of [[0, [255, 0, 0, 255]], [1, [0, 255, 0, 255]]]) {
      const image = extractMarkdownImage(api, doc, page, index);
      assert.ok(Math.abs(image.width / image.height - 2) < .05, 'Individual image aspect ratio, not full square page');
      const pixels = new Uint8Array(image.pixels);
      assert.deepEqual([...pixels.slice(Math.floor(image.width * image.height / 2) * 4, Math.floor(image.width * image.height / 2) * 4 + 4)], expected);
    }
    assert.throws(() => extractMarkdownImage(api, doc, page, 2), /non disponibile/);
  } finally { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(doc); }
});

test('image-only scans expose one image and do not invent extracted text', () => {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 200, 300);
  try {
    const pixels = new Uint8Array(8 * 12 * 4).fill(255);
    images.apply(doc, page, { image: { width: 8, height: 12, pixels: pixels.buffer }, region: { x: 0, y: 0, width: 200, height: 300 } });
    const result = extractMarkdownPage(api, page);
    assert.equal(result.imageCount, 1); assert.equal(result.hasText, false); assert.match(result.markdown, /Nessun testo selezionabile/);
  } finally { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(doc); }
});

test('page comparison follows stable Markdown markers after user edits', () => {
  const text = `# Titolo\n${pageMarker(1)}\nPrimo\n\n${pageMarker(2)}\nSecondo`;
  assert.equal(markdownPageAt(text, text.indexOf('Primo')), 1);
  assert.equal(markdownPageAt(text, text.length), 2);
  assert.equal(markdownPageOffset(text, 2), text.indexOf(pageMarker(2)));
  assert.equal(markdownPageOffset(text, 3), -1);
  assert.equal(markdownPageAt('Testo senza marcatori', 20), 1);
});
