import test from 'node:test';
import assert from 'node:assert/strict';
import { PageEditor } from '../src/PdfMB.Desktop/Web/page-editor.mjs';
import { paperSize } from '../src/PdfMB.Desktop/Web/paper-sizes.mjs';

test('paper sizes accept only known formats and boolean orientation', () => {
  assert.throws(() => paperSize({ format: '__proto__' }), /formato/);
  assert.throws(() => paperSize({ format: 'A4', landscape: 'false' }), /orientamento/);
});

test('new documents stay unsaved; blank insertion uses common history and rolls back a failed view', async () => {
  let fail = false;
  const editor = new PageEditor('Nuovo documento.pdf', async () => { if (fail) throw Error('Viewer failed'); }, () => 1);
  editor.source = editor.bytes = new ArrayBuffer(12);
  editor.policy = { readOnly: false };
  const requests = [];
  editor.worker = { alive: true, request: async (type, payload) => {
    requests.push(type);
    if (type === 'create-blank' || type === 'rebuild') return new ArrayBuffer(20);
    if (type === 'prepare-import') return { token: 'blank', pageCount: 1 };
    if (type === 'register-import') return [{ id: 1, rotation: 0, formFields: [] }];
    if (type === 'retain-pages' || type === 'cancel-import') return {};
    throw Error(type);
  } };
  editor.finishOpen(1); editor.unsavedDocument = true;
  assert.ok(editor.dirty);
  editor.markSaved({ token: editor.token, revision: 0, name: 'Documento.pdf' });
  assert.equal(editor.dirty, false);
  await editor.insertBlank({ format: 'A3', landscape: false, position: 1 });
  assert.deepEqual(editor.pages.map(p => p.id), [1, 0]); assert.ok(editor.dirty);
  await editor.undo(); assert.deepEqual(editor.pages.map(p => p.id), [0]); assert.equal(editor.dirty, false);
  await editor.redo(); assert.deepEqual(editor.pages.map(p => p.id), [1, 0]);
  await editor.undo(); const bytes = editor.bytes;
  fail = true; await assert.rejects(editor.insertBlank({ format: 'A4', landscape: false, position: 2 }), /Viewer/);
  assert.equal(editor.bytes, bytes); assert.deepEqual(editor.pages.map(p => p.id), [0]); assert.equal(editor.dirty, false);
  const count = requests.length; editor.policy.readOnly = true;
  await assert.rejects(editor.insertBlank({ format: 'A4', landscape: false, position: 1 }));
  assert.equal(requests.length, count);
});
