import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { init } from '@embedpdf/pdfium';
import { createTextTools } from '../src/PdfMB.Desktop/Web/text-engine.mjs';
import { rewriteFormDocument } from '../src/PdfMB.Desktop/Web/form-document.mjs';
import { PDFDocument, PDFName } from 'pdf-lib';
import { createFormTools } from '../src/PdfMB.Desktop/Web/form-engine.mjs';
import { FORM_FORMATS, fieldValueError, formatCurrentDate, formattedDateToIso } from '../src/PdfMB.Desktop/Web/form-validation.mjs';
import { transformPdfSecurity } from '../src/PdfMB.Desktop/Web/pdf-security.mjs';
import { parse } from 'acorn';

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

test('regex and temporal formats validate full values, leap days, time ranges and persisted PDF actions', async () => {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 240, 200);
  const input = field('text', { pattern: '[A-Z]{2}[0-9]{6}', value: 'AB123456', validationMessage: 'Codice non valido' });
  const code = forms.prepare(page, input);
  assert.throws(() => forms.prepare(page, { ...input, pattern: '[' }), /regolare/);
  assert.throws(() => forms.prepare(page, { ...input, value: 'xAB123456x' }), /Codice/);
  assert.throws(() => forms.prepare(page, { ...input, value: 'AB123456\n', multiline: true }), /Codice/);
  const temporal = forms.prepare(page, field('datetime', { name: 'data', value: '29/02/2024 23:59', defaultValue: '', format: 'gg/mm/aaaa HH:mm' }));
  for (const value of ['29/02/2023 23:59', '31/04/2024 12:30', '01/01/2024 24:00', '01/01/2024 23:60', '1/1/2024 00:00']) assert.ok(fieldValueError(temporal, value), value);
  const samples = ['29/02/2024', '29-02-2024', '2024-02-29', '02/29/2024', '23:59', '23:59:58', '29/02/2024 23:59', '29/02/2024 23:59:58', '2024-02-29 23:59'];
  FORM_FORMATS.forEach((format, i) => assert.equal(fieldValueError({ kind: 'datetime', format }, samples[i]), '', format));
  assert.ok(fieldValueError({ kind: 'text', required: true }, '', true));
  api.FPDF_ClosePage(page); const source = save(doc); api.FPDF_CloseDocument(doc);
  const bytes = await rewriteFormDocument(source, [[code, temporal]]);
  open(bytes, doc => { const fields = forms.documentFields(doc)[0]; assert.equal(fields[0].pattern, input.pattern); assert.equal(fields[1].kind, 'datetime'); assert.equal(fields[1].format, temporal.format); });
  const native = await PDFDocument.load(bytes);
  for (const f of native.getForm().getFields()) {
    const script = f.acroField.dict.lookup(PDFName.of('AA')).lookup(PDFName.of('V')).lookup(PDFName.of('JS')).decodeText();
    assert.doesNotThrow(() => parse(script, { ecmaVersion: 5 }), 'Validation scripts must parse in older Acrobat JavaScript engines');
    const event = { value: f.getName() === 'nome' ? 'AB123' : '31/02/2024 23:59', rc: true };
    const messages = []; new Function('event', 'app', script)(event, { alert: m => messages.push(m) });
    assert.equal(event.rc, false); assert.equal(messages.length, 1);
    event.value = f.getName() === 'nome' ? 'AB123456' : '29/02/2024 23:59'; event.rc = true; messages.length = 0;
    new Function('event', 'app', script)(event, { alert: m => messages.push(m) });
    assert.equal(event.rc, true); assert.equal(messages.length, 0);
  }
});

test('NOW defaults use local date/time formats and survive saving without replacing filled values', async () => {
  const at = new Date(2024, 1, 29, 23, 7, 5);
  const expected = ['29/02/2024', '29-02-2024', '2024-02-29', '02/29/2024', '23:07', '23:07:05', '29/02/2024 23:07', '29/02/2024 23:07:05', '2024-02-29 23:07'];
  FORM_FORMATS.forEach((format, index) => assert.equal(formatCurrentDate(format, at), expected[index]));
  const isoValues = ['2024-02-29', '2024-02-29', '2024-02-29', '2024-02-29', '23:07', '23:07:05', '2024-02-29T23:07', '2024-02-29T23:07:05', '2024-02-29T23:07'];
  FORM_FORMATS.forEach((format, index) => assert.equal(formattedDateToIso(format, expected[index]), isoValues[index]));
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 240, 200);
  const input = field('datetime', { name: 'adesso', value: ' now() ', defaultValue: ' now() ', format: 'gg/mm/aaaa HH:mm:ss' });
  const f = forms.prepare(page, input);
  assert.equal(f.defaultValue, 'NOW()'); assert.equal(f.value, f.resolvedDefaultValue); assert.equal(fieldValueError(f, f.value), '');
  const custom = forms.prepare(page, { ...f, value: '29/02/2024 23:07:05', position: input.position });
  assert.equal(custom.value, '29/02/2024 23:07:05'); assert.equal(custom.resolvedDefaultValue, f.resolvedDefaultValue);
  const blank = forms.prepare(page, { ...custom, value: '', position: input.position }); assert.equal(blank.value, '');
  api.FPDF_ClosePage(page); const source = save(doc); api.FPDF_CloseDocument(doc);
  const bytes = await rewriteFormDocument(source, [[custom]]);
  open(bytes, doc => { const stored = forms.documentFields(doc)[0][0]; assert.equal(stored.defaultValue, 'NOW()'); assert.equal(stored.value, custom.value); assert.equal(stored.resolvedDefaultValue, f.resolvedDefaultValue); });
  const native = (await PDFDocument.load(bytes)).getForm().getTextField('adesso');
  assert.equal(native.acroField.dict.lookup(PDFName.of('DV')).decodeText(), f.resolvedDefaultValue);
  assert.equal(native.getText(), custom.value);
  assert.equal(native.isReadOnly(), false, 'NOW() defaults never make the date/time field read-only');
});

test('image upload and email pushbuttons retain appearance, action and editable metadata through rewrites', async () => {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 240, 200);
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const values = [forms.prepare(page, field('image', { name: 'foto', value: image, defaultValue: '', position: { x: 20, y: 20, width: 80, height: 80 } })),
    forms.prepare(page, field('button', { name: 'invia', value: '', defaultValue: '', caption: 'Invia PDF', email: 'test@example.com', position: { x: 20, y: 120, width: 150, height: 30 } }))];
  assert.throws(() => forms.prepare(page, { ...values[1], position: { x: 0, y: 0, width: 20, height: 20 }, email: 'a@b.com\nCc:bad' }), /email/);
  api.FPDF_ClosePage(page); const source = save(doc); api.FPDF_CloseDocument(doc);
  const bytes = await rewriteFormDocument(source, [values]);
  open(bytes, doc => { const fields = forms.documentFields(doc)[0]; assert.deepEqual(fields.map(f => f.kind), ['image', 'button']); assert.equal(fields[0].value, image); assert.equal(fields[1].email, 'test@example.com'); });
  const native = await PDFDocument.load(bytes);
  const action = native.getForm().getButton('invia').acroField.getWidgets()[0].dict.lookup(PDFName.of('A'));
  assert.equal(action.lookup(PDFName.of('S')).toString(), '/SubmitForm'); assert.equal(action.lookup(PDFName.of('Flags')).asNumber(), 256);
  const destination = action.lookup(PDFName.of('F'));
  assert.equal(destination.lookup(PDFName.of('Type')).toString(), '/Filespec');
  assert.equal(destination.lookup(PDFName.of('FS')).toString(), '/URL');
  assert.deepEqual([...destination.lookup(PDFName.of('F')).asBytes()], [...Buffer.from('mailto:test@example.com', 'ascii')]);
  for (const email of ['', 'nome+copia@example.com', 'città@example.com']) {
    const changed = await rewriteFormDocument(bytes, [[{ ...values[1], email }]]);
    const f = (await PDFDocument.load(changed)).getForm().getButton('invia');
    const raw = f.acroField.getWidgets()[0].dict.lookup(PDFName.of('A')).lookup(PDFName.of('F')).lookup(PDFName.of('F')).asBytes();
    assert.ok(raw.every(b => b < 128), 'Mail destination contains only ASCII URL bytes without a UTF-16 BOM');
    assert.equal(decodeURIComponent(new TextDecoder().decode(raw).slice(7)), email);
  }
  const replaced = await rewriteFormDocument(bytes, [[{ ...values[0], value: '' }, values[1]]]);
  open(replaced, doc => assert.equal(forms.documentFields(doc)[0][0].value, ''));
});

test('password encryption rejects missing/wrong passwords and preserves AcroForms after authenticated reopen', async () => {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 240, 200);
  const value = forms.prepare(page, field()); api.FPDF_ClosePage(page); const source = save(doc); api.FPDF_CloseDocument(doc);
  const bytes = await rewriteFormDocument(source, [[value]]);
  const password = 'Riservato-2026-è';
  const encrypted = transformPdfSecurity(api, bytes, password, true).buffer;
  const encryptedPtr = alloc(encrypted.byteLength); api.pdfium.HEAPU8.set(new Uint8Array(encrypted), encryptedPtr);
  const encryptedDoc = api.FPDF_LoadMemDocument(encryptedPtr, encrypted.byteLength, password);
  try { assert.ok(encryptedDoc); assert.ok(api.FPDF_GetSecurityHandlerRevision(encryptedDoc) >= 6, 'Use modern AES-256 security revision'); }
  finally { if (encryptedDoc) api.FPDF_CloseDocument(encryptedDoc); free(encryptedPtr); }
  assert.throws(() => transformPdfSecurity(api, encrypted), /PASSWORD/);
  assert.throws(() => transformPdfSecurity(api, encrypted, 'errata'), /PASSWORD/);
  const opened = transformPdfSecurity(api, encrypted, password);
  assert.equal(opened.protected, true);
  open(opened.buffer, doc => assert.equal(forms.documentFields(doc)[0][0].value, value.value));
  const changed = await rewriteFormDocument(opened.buffer, [[{ ...value, value: 'Compilato protetto' }]]);
  const protectedAgain = transformPdfSecurity(api, changed, password, true).buffer;
  open(transformPdfSecurity(api, protectedAgain, password).buffer, doc => assert.equal(forms.documentFields(doc)[0][0].value, 'Compilato protetto'));
});

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
