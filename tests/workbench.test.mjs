import test from 'node:test';
import assert from 'node:assert/strict';
import { blacken, validateRegion, createWorkbenchTools } from '../src/PdfMB.Desktop/Web/workbench-engine.mjs';
import { PageEditor } from '../src/PdfMB.Desktop/Web/page-editor.mjs';

test('redaction replaces source pixels and alpha rather than overlaying a removable shape', () => {
  const pixels = new Uint8Array(4 * 4 * 4).fill(123);
  blacken(pixels, 4, 4, { x: 1, y: 1, width: 2, height: 2 }, 4, 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    assert.deepEqual([...pixels.slice((y * 4 + x) * 4, (y * 4 + x + 1) * 4)],
      x >= 1 && x < 3 && y >= 1 && y < 3 ? [0, 0, 0, 255] : [123, 123, 123, 123]);
  }
});
test('fractional regions cover every intersecting edge pixel', () => {
  const pixels = new Uint8Array(4 * 4 * 4).fill(123);
  blacken(pixels, 4, 4, { x: .9, y: .9, width: 1.2, height: 1.2 }, 4, 4);
  assert.equal(pixels[0], 0);
  assert.equal(pixels[(2 * 4 + 2) * 4], 0);
  assert.equal(pixels[(3 * 4 + 3) * 4], 123);
});
test('invalid or out-of-page regions fail before touching pixels', () => {
  const pixels = new Uint8Array(64).fill(123);
  for (const region of [null, { x: -1, y: 0, width: 2, height: 2 }, { x: 3, y: 3, width: 2, height: 2 }, { x: NaN, y: 0, width: 2, height: 2 }])
    assert.throws(() => blacken(pixels, 4, 4, region, 4, 4));
  assert.ok(pixels.every(byte => byte === 123));
  assert.equal(validateRegion({ x: 0, y: 0, width: 4, height: 4 }, 4, 4).width, 4);
});

function rasterFixture(fail = false) {
  const memory = new ArrayBuffer(1024), calls = [], pixels = new Uint8Array(64).fill(200);
  const api = { pdfium: { HEAPU8: new Uint8Array(memory), wasmExports: { malloc: () => 32, free: () => calls.push('free') } },
    FPDF_CreateNewDocument: () => 2, FPDFPage_New: (...args) => { calls.push(['new-page', ...args]); return 3; },
    FPDFBitmap_CreateEx: () => 4, FPDFPageObj_NewImageObj: () => 5,
    FPDFImageObj_SetBitmap: () => { calls.push(['bitmap', ...api.pdfium.HEAPU8.slice(32, 96)]); return !fail; },
    FPDFImageObj_SetMatrix: () => true, FPDFPage_InsertObject: () => calls.push('insert-image'),
    FPDFPage_GenerateContent: () => true, FPDFBitmap_Destroy: () => calls.push('close-bitmap'),
    FPDFPageObj_Destroy: () => calls.push('destroy-image'), FPDF_ClosePage: () => calls.push('close-page'), FPDF_CloseDocument: () => calls.push('close-document') };
  const tools = createWorkbenchTools(api, { geometry: () => ({ width: 4, height: 4 }), render: () => ({ width: 4, height: 4, pixels: pixels.buffer }) });
  return { tools, calls };
}
test('sanitized page is a fresh image-only document with no source objects imported', () => {
  const { tools, calls } = rasterFixture();
  assert.equal(tools.rasterizeRedacted(1, 10, { x: 0, y: 0, width: 4, height: 4 }), 2);
  assert.ok(calls.includes('insert-image'));
  const pixels = calls.find(call => Array.isArray(call) && call[0] === 'bitmap').slice(1);
  assert.ok(pixels.every((value, index) => value === (index % 4 === 3 ? 255 : 0)));
  assert.ok(!calls.includes('close-document'));
});
test('failed rasterization closes temporary page, bitmap, detached object and document', () => {
  const { tools, calls } = rasterFixture(true);
  assert.throws(() => tools.rasterizeRedacted(1, 10, { x: 0, y: 0, width: 2, height: 2 }));
  assert.ok(calls.includes('close-bitmap'));
  assert.ok(calls.includes('destroy-image'));
  assert.ok(calls.indexOf('close-page') < calls.indexOf('close-document'));
});

function editorFixture(failView = false) {
  const requests = [], editor = new PageEditor('test.pdf', async () => { if (failView) throw Error('viewer failure'); }, () => 1);
  editor.source = editor.bytes = new ArrayBuffer(16);
  editor.policy = { readOnly: false, canContent: true, canAnnotate: true, canPrint: true };
  editor.worker = { alive: true, request: async (type, payload) => {
    requests.push({ type, payload });
    if (type === 'workbench-change') return { override: 'revision-' + requests.length };
    if (type === 'rebuild') return new ArrayBuffer(32);
    if (type === 'retain-pages') return {};
    if (type === 'output-page') return { image: {} };
    if (type === 'text-change') return { baseline: null, value: { id: payload.input.id } };
    throw Error(type);
  } };
  editor.finishOpen(2);
  const change = input => editor.changeWorkbench({ pageIndex: 0, token: editor.token, revision: editor.revision, input });
  return { editor, requests, change };
}
test('content revision folds committed page state, keeps undo and remains dirty until save', async () => {
  const { editor, change } = editorFixture();
  editor.pages[0].rotation = 1; editor.pages[0].highlightChanges = [{ id: 'h', value: {} }];
  await change({ operation: 'object-delete', index: 0 });
  assert.ok(editor.pages[0].override);
  assert.equal(editor.pages[0].rotation, 0);
  assert.equal(editor.pages[0].highlightChanges, undefined);
  assert.equal(editor.past[0].pages[0].rotation, 1);
  assert.equal(editor.dirty, true);
  editor.markSaved({ token: editor.token, revision: editor.revision, name: 'saved.pdf' });
  assert.equal(editor.dirty, false);
  await editor.undo(); assert.equal(editor.pages[0].rotation, 1); assert.equal(editor.dirty, true);
  await editor.redo(); assert.equal(editor.dirty, false);
});
test('failed replacement never commits a revision and releases the orphaned source', async () => {
  const { editor, change, requests } = editorFixture(true);
  await assert.rejects(change({ operation: 'redact', region: {} }), /viewer failure/);
  assert.equal(editor.dirty, false);
  assert.equal(editor.bytes, editor.source);
  assert.equal(editor.past.length, 0);
  assert.deepEqual(requests.at(-1).payload.overrides, []);
});
test('override sources needed by undo/redo are retained; branching discards redo sources', async () => {
  const { editor, change, requests } = editorFixture();
  await change({ operation: 'note' });
  const first = editor.pages[0].override;
  await change({ operation: 'square' });
  const second = editor.pages[0].override;
  await editor.undo();
  assert.ok(requests.at(-1).payload.overrides.includes(second));
  await change({ operation: 'circle' });
  assert.ok(requests.at(-1).payload.overrides.includes(first));
  assert.ok(!requests.at(-1).payload.overrides.includes(second));
});
test('new text edits use the current override as their baseline after content changes', async () => {
  const { editor, change, requests } = editorFixture();
  await change({ operation: 'note' });
  const override = editor.pages[0].override;
  await editor.changeText({ pageIndex: 0, token: editor.token, revision: editor.revision, input: { id: 'text' } });
  assert.equal(requests.find(r => r.type === 'text-change').payload.pageOverride, override);
});
test('content, annotations and print enforce separate permissions', async () => {
  const { editor, change, requests } = editorFixture();
  editor.policy.canContent = false;
  await assert.rejects(change({ operation: 'object-delete' }));
  await assert.rejects(change({ operation: 'redact' }));
  assert.equal(requests.length, 0);
  await change({ operation: 'note' });
  editor.policy.canPrint = false; await assert.rejects(editor.outputPage(0, 'print'));
  editor.policy.canAnnotate = false; await assert.rejects(change({ operation: 'square' }));
});
test('stale workbench rejects modifications before creating worker sources', async () => {
  const { editor, requests } = editorFixture();
  await assert.rejects(editor.changeWorkbench({ pageIndex: 0, token: 'old', revision: 0, input: { operation: 'note' } }));
  assert.equal(requests.length, 0);
});
