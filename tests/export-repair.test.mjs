import test from 'node:test';
import assert from 'node:assert/strict';
import { PageEditor } from '../src/PdfMB.Desktop/Web/page-editor.mjs';

function editorWith(policy, worker) {
  const editor = new PageEditor('Modulo.pdf', async () => {}, () => 1);
  editor.source = editor.bytes = new ArrayBuffer(12);
  editor.policy = { readOnly: false, ...policy };
  editor.worker = worker;
  editor.textRepairPending = !!policy.textRepairNeeded;
  editor.formRepairPending = !!policy.formRepairNeeded;
  editor.legacySource = editor.textRepairPending || editor.formRepairPending;
  editor.finishOpen(2);
  return editor;
}

function mockWorker(requests) {
  return { alive: true, request: async (type, payload) => {
    requests.push(type);
    if (type === 'rebuild') return new ArrayBuffer(20 + payload.length);
    if (type === 'retain-pages') return {};
    if (type === 'security') return { buffer: new ArrayBuffer(40) };
    throw Error(type);
  } };
}

test('undo back to the initial state regenerates a form document that needed repair instead of restoring its source bytes', async () => {
  const requests = [];
  const editor = editorWith({ formRepairNeeded: true }, mockWorker(requests));
  await editor.change({ operation: 'rotate-right' });
  await editor.export();
  editor.markSaved({ token: editor.token, revision: editor.revision, name: 'Modulo.pdf' });
  assert.equal(editor.formRepairPending, false);
  requests.length = 0;
  await editor.undo();
  assert.deepEqual(requests.filter(type => type === 'rebuild'), ['rebuild']);
  assert.notEqual(editor.bytes, editor.source);
});

test('a document without pending repair still takes the source shortcut on undo to the initial state', async () => {
  const requests = [];
  const editor = editorWith({}, mockWorker(requests));
  await editor.change({ operation: 'rotate-right' });
  requests.length = 0;
  await editor.undo();
  assert.deepEqual(requests.filter(type => type === 'rebuild'), []);
  assert.equal(editor.bytes, editor.source);
});

test('export after the Worker stopped still returns the committed bytes and skips the pending repair', async () => {
  const requests = [];
  const worker = mockWorker(requests);
  const editor = editorWith({ textRepairNeeded: true }, worker);
  await editor.change({ operation: 'rotate-right' });
  const committed = editor.bytes;
  worker.alive = false;
  requests.length = 0;
  assert.equal(editor.canEdit, false);
  assert.ok(editor.dirty);
  const exported = await editor.export();
  assert.deepEqual(requests, []);
  assert.equal(editor.bytes, committed);
  assert.equal(exported.revision, editor.revision);
  assert.equal(Buffer.from(exported.base64, 'base64').length, committed.byteLength);
  editor.markSaved({ token: editor.token, revision: editor.revision, name: 'Modulo.pdf' });
  assert.equal(editor.dirty, false);
});

test('export with a live Worker repairs first and re-encrypts when a password is configured', async () => {
  const requests = [];
  const editor = editorWith({ textRepairNeeded: true }, mockWorker(requests));
  editor.password = 'segreta';
  const exported = await editor.export();
  assert.deepEqual(requests, ['rebuild', 'security']);
  assert.equal(Buffer.from(exported.base64, 'base64').length, 40);
  assert.ok(editor.dirty);
});
