import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { init } from '@embedpdf/pdfium';
import { createTextTools } from '../src/PdfMB.Desktop/Web/text-engine.mjs';
import { rewriteFormDocument } from '../src/PdfMB.Desktop/Web/form-document.mjs';
import { PDFDocument, PDFName } from 'pdf-lib';
import { createFormTools } from '../src/PdfMB.Desktop/Web/form-engine.mjs';

const api = await init({ wasmBinary: await readFile(new URL('../node_modules/@embedpdf/pdfium/dist/pdfium.wasm', import.meta.url)) });
api.PDFiumExt_Init();
const text = createTextTools(api), forms = createFormTools(api, text);
const alloc = n => api.pdfium.wasmExports.malloc(n), free = p => api.pdfium.wasmExports.free(p);
function save(doc) {
  const w = api.PDFiumExt_OpenFileWriter(); let p;
  try { assert.ok(api.FPDF_SaveAsCopy(doc, w, 2)); const n = api.PDFiumExt_GetFileWriterSize(w); p = alloc(n); api.PDFiumExt_GetFileWriterData(w, p, n); return api.pdfium.HEAPU8.slice(p, p + n).buffer; }
  finally { if (p) free(p); api.PDFiumExt_CloseFileWriter(w); }
}
function open(bytes, fn) {
  const p = alloc(bytes.byteLength); api.pdfium.HEAPU8.set(new Uint8Array(bytes), p);
  const doc = api.FPDF_LoadMemDocument(p, bytes.byteLength, ''); assert.ok(doc);
  try { return fn(doc); } finally { api.FPDF_CloseDocument(doc); free(p); }
}
const field = (kind = 'text', extra = {}) => ({ id: 'pdfmb-f-' + crypto.randomUUID(), kind, name: kind === 'text' ? 'nome' : 'consenso', label: 'Descrizione',
  value: kind === 'text' ? 'Città €' : true, defaultValue: kind === 'text' ? '' : false, font: 'Helvetica', size: 12, color: '#202020',
  maxLength: 1000, multiline: false, readOnly: false, required: true, position: { x: 20, y: kind === 'text' ? 20 : 70, width: kind === 'text' ? 150 : 20, height: 24 }, ...extra });

test('native AcroForm text and checkbox retain Unicode, appearance and field tree after reopening and removal', async () => {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 240, 200);
  const values = [forms.prepare(page, field()), forms.prepare(page, field('checkbox'))];
  api.FPDF_ClosePage(page);
  const source = save(doc); api.FPDF_CloseDocument(doc);
  const bytes = await rewriteFormDocument(source, [values]);
  open(bytes, reopened => {
    const [fields] = forms.documentFields(reopened);
    assert.deepEqual(fields.map(f => f.value), ['Città €', true]);
    const p = api.FPDF_LoadPage(reopened, 0);
    try {
      for (let i = 0; i < 2; i++) { const a = api.FPDFPage_GetAnnot(p, i); try { assert.ok(api.FPDFAnnot_GetAP(a, 0, 0, 0) > 2); } finally { api.FPDFPage_CloseAnnot(a); } }
      assert.ok(new Uint8Array(text.render(p, 1400, 2, reopened).pixels).some((v, i) => i % 4 !== 3 && v < 150));
    } finally { api.FPDF_ClosePage(p); }
  });
  const independent = await PDFDocument.load(bytes);
  assert.equal(independent.getForm().getTextField('nome').getText(), 'Città €');
  assert.ok(independent.getForm().getCheckBox('consenso').isChecked());
  const edited = await rewriteFormDocument(bytes, [[{ ...values[0], value: 'Modificato' }]]);
  open(edited, doc => assert.deepEqual(forms.documentFields(doc)[0].map(f => f.value), ['Modificato']));
  const empty = await rewriteFormDocument(edited);
  assert.equal((await PDFDocument.load(empty)).getForm().getFields().length, 0);
  open(empty, doc => assert.equal(forms.documentFields(doc)[0].length, 0));
  await mkdir(new URL('../artifacts/test/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/test/forms-native.pdf', import.meta.url), Buffer.from(bytes));
  await writeFile(new URL('../artifacts/test/forms-removed.pdf', import.meta.url), Buffer.from(empty));
});

test('form validation rejects duplicate names, unsupported text, oversize values and invalid geometry', async () => {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 240, 200);
  try {
    const f = forms.prepare(page, field());
    assert.throws(() => forms.prepare(page, field('text', { value: '😀' })), /occidentali/);
    assert.throws(() => forms.prepare(page, field('text', { maxLength: 2 })), /lunghezza/);
    assert.throws(() => forms.prepare(page, field('text', { position: { x: -1, y: 0, width: 20, height: 20 } })), /pagina/);
    await assert.rejects(rewriteFormDocument(save(doc), [[f, { ...f, id: 'pdfmb-f-' + crypto.randomUUID() }]]), /già usato/);
  } finally { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(doc); }
});

test('single-choice dropdown persists options, Unicode selection, default and flags in native and canonical readers', async () => {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 240, 200);
  const options = ['Città', 'Estero €', 'Altro'];
  const input = field('dropdown', { name: 'destinazione', value: 'Estero €', defaultValue: 'Città', options,
    position: { x: 20, y: 110, width: 180, height: 28 } });
  const f = forms.prepare(page, input);
  for (const extra of [{ options: [] }, { options: ['A', 'A'] }, { options: ['😀'] }, { value: 'Assente' }, { defaultValue: 'Assente' }])
    assert.throws(() => forms.prepare(page, { ...input, ...extra }));
  api.FPDF_ClosePage(page); const source = save(doc); api.FPDF_CloseDocument(doc);
  const bytes = await rewriteFormDocument(source, [[f]]);
  open(bytes, doc => {
    const [actual] = forms.documentFields(doc)[0];
    assert.equal(actual.kind, 'dropdown'); assert.deepEqual(actual.options, options);
    assert.equal(actual.value, 'Estero €'); assert.equal(actual.defaultValue, 'Città'); assert.equal(actual.required, true);
    const page = api.FPDF_LoadPage(doc, 0);
    try { assert.ok(text.render(page, 1400, 2, doc).pixels.byteLength > 0); } finally { api.FPDF_ClosePage(page); }
  });
  const external = await PDFDocument.load(bytes), dropdown = external.getForm().getDropdown('destinazione');
  assert.deepEqual(dropdown.getSelected(), ['Estero €']); assert.deepEqual(dropdown.getOptions(), options);
  assert.equal(dropdown.isMultiselect(), false); assert.equal(dropdown.isEditable(), false);
  assert.equal(dropdown.acroField.dict.lookup(PDFName.of('DV')).decodeText(), 'Città');
  // Canonical values edited by another PDF reader take precedence over metadata.
  dropdown.select('Altro'); const edited = await external.save();
  open(edited.buffer.slice(edited.byteOffset, edited.byteOffset + edited.byteLength), doc => assert.equal(forms.documentFields(doc)[0][0].value, 'Altro'));
  const cleared = await rewriteFormDocument(bytes, [[{ ...f, value: '', defaultValue: '' }]]);
  open(cleared, doc => assert.equal(forms.documentFields(doc)[0][0].value, ''));
  assert.equal((await PDFDocument.load(await rewriteFormDocument(bytes))).getForm().getFields().length, 0);
  await writeFile(new URL('../artifacts/test/forms-dropdown.pdf', import.meta.url), Buffer.from(bytes));
});

test('fields created on all permanent rotations and offset CropBoxes keep their screen geometry and readable appearance', async () => {
  for (let rotation = 0; rotation < 4; rotation++) {
    const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 400, 400);
    api.FPDFPage_SetCropBox(page, 30, 40, 350, 360); api.FPDFPage_SetRotation(page, rotation);
    const f = forms.prepare(page, field('text', { value: 'TEST', position: { x: 20, y: 20, width: 150, height: 30 } }));
    api.FPDF_ClosePage(page); const source = save(doc); api.FPDF_CloseDocument(doc);
    const bytes = await rewriteFormDocument(source, [[f]]);
    open(bytes, doc => {
      const p = api.FPDF_LoadPage(doc, 0);
      try {
        const [value] = forms.list(doc, p);
        assert.deepEqual(value.position, { x: 20, y: 20, width: 150, height: 30 });
        const image = text.render(p, 1400, 2, doc), pixels = new Uint8Array(image.pixels), points = [];
        for (let y = 45; y < 95; y++) for (let x = 45; x < 335; x++) {
          const i = (y * image.width + x) * 4;
          if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] < 80) points.push([x, y]);
        }
        assert.ok(points.length > 10, 'The value is visible');
        const width = Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]));
        const height = Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1]));
        assert.ok(width > height * 1.5, `Text is horizontal on rotation ${rotation}`);
      } finally { api.FPDF_ClosePage(p); }
    });
  }
});
