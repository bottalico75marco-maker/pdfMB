import test from 'node:test';
import assert from 'node:assert/strict';
import { PageEditor } from '../src/PdfMB.Desktop/Web/page-editor.mjs';

function fixture() {
  let failView = false;
  const editor = new PageEditor('modulo.pdf', async () => { if (failView) throw Error('Viewer non disponibile'); }, () => 1);
  editor.source = editor.bytes = new ArrayBuffer(20);
  editor.policy = { readOnly: false, canFormDesign: true, canFormFill: true, canAnnotate: true, canContent: true };
  editor.worker = { alive: true, request: async (type, payload) => {
    if (type === 'form-prepare') return structuredClone(payload.input);
    if (type === 'rebuild') return new ArrayBuffer(30);
    if (type === 'workbench-change') return { override: crypto.randomUUID() };
    if (type === 'retain-pages') return {};
    throw Error(type);
  } };
  editor.finishOpen(2);
  const input = { id: 'pdfmb-f-' + crypto.randomUUID(), name: 'nome', kind: 'text', value: 'Iniziale', readOnly: false };
  const change = (extra = {}) => editor.changeForm({ token: editor.token, revision: editor.revision, pageIndex: 0, input, ...extra });
  return { editor, input, change, fail: () => { failView = true; } };
}

test('form design and fill share save state, undo/redo and page history without changing earlier snapshots', async () => {
  const { editor, input, change } = fixture();
  await change(); editor.markSaved({ token: editor.token, revision: editor.revision, name: 'salvato.pdf' });
  assert.equal(editor.dirty, false);
  await change({ input: { id: input.id, value: 'Compilato €' }, fillOnly: true });
  assert.equal(editor.pages[0].formFields[0].value, 'Compilato €'); assert.ok(editor.dirty);
  await editor.undo(); assert.equal(editor.pages[0].formFields[0].value, 'Iniziale'); assert.equal(editor.dirty, false);
  await editor.redo(); assert.equal(editor.pages[0].formFields[0].value, 'Compilato €');
  await editor.change({ operation: 'rotate-right' }); assert.equal(editor.pages[0].formFields[0].value, 'Compilato €');
  await change({ remove: true }); assert.equal(editor.pages[0].formFields.length, 0);
  await editor.undo(); assert.equal(editor.pages[0].formFields[0].value, 'Compilato €');
  await editor.changeWorkbench({ pageIndex: 0, token: editor.token, revision: editor.revision, input: { operation: 'redact' } });
  assert.equal(editor.pages[0].formFields.length, 0);
  await editor.undo(); assert.equal(editor.pages[0].formFields[0].value, 'Compilato €');
});

test('failed form commits preserve document, drafts and history; stale and read-only values are rejected', async () => {
  const { editor, input, change, fail } = fixture();
  await change(); const bytes = editor.bytes, revision = editor.revision, history = editor.past.length;
  fail(); await assert.rejects(change({ input: { ...input, name: 'altro' } }), /Viewer/);
  assert.equal(editor.bytes, bytes); assert.equal(editor.revision, revision); assert.equal(editor.past.length, history);
  assert.equal(editor.pages[0].formFields[0].name, 'nome');
  await assert.rejects(change({ revision: -1 }), /Documento/);
  editor.pages[0].formFields = [{ ...input, readOnly: true }];
  await assert.rejects(change({ input: { id: input.id, value: 'X' }, fillOnly: true }), /sola lettura/);
  editor.policy.canFormDesign = false; await assert.rejects(change(), /moduli/);
});
