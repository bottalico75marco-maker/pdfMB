import test from 'node:test';
import assert from 'node:assert/strict';
import { PageEditor } from '../src/PdfMB.Desktop/Web/page-editor.mjs';
import { nearestCharacter } from '../src/PdfMB.Desktop/Web/highlight-surface.mjs';

const input = { id: 'pdfmb-h-12345678-1234-1234-1234-123456789abc', start: 0, end: 4, color: '#ffff00' };
function setup({ exists = false, failView = false } = {}) {
  const requests = [];
  const editor = new PageEditor('test.pdf', async () => { if (failView) throw new Error('Viewer failed'); }, () => 1);
  editor.source = editor.bytes = new ArrayBuffer(16);
  editor.policy = { canAnnotate: true, readOnly: false };
  editor.worker = { alive: true, request: async (type, payload) => {
    requests.push({ type, payload });
    if (type === 'highlight-change') return { value: payload.remove ? null : { id: input.id, color: input.color, quads: [[0, 10, 30, 10, 0, 0, 30, 0]] }, exists };
    if (type === 'rebuild') return new ArrayBuffer(32);
    throw Error(type);
  } };
  editor.finishOpen(2);
  return { editor, requests, change: (remove = false) => editor.changeHighlight({
    pageIndex: 0, token: editor.token, revision: editor.revision, input, remove
  }) };
}
test('highlight participates in save state, undo, redo and page operations', async () => {
  const { editor, change } = setup();
  await change();
  assert.equal(editor.dirty, true);
  assert.equal(editor.past.length, 1);
  editor.markSaved({ token: editor.token, revision: editor.revision, name: 'saved.pdf' });
  assert.equal(editor.dirty, false);
  await editor.undo();
  assert.equal(editor.dirty, true);
  assert.equal(editor.pages[0].highlightChanges, undefined);
  await editor.redo();
  assert.equal(editor.dirty, false);
  await editor.change({ operation: 'rotate-right' });
  assert.equal(editor.pages[0].highlightChanges[0].id, input.id);
  assert.equal(editor.past[0].pages[0].highlightChanges, undefined);
});
test('removing a newly created highlight returns to original bytes and clean state', async () => {
  const { editor, change } = setup();
  await change(); await change(true);
  assert.equal(editor.dirty, false);
  assert.equal(editor.bytes, editor.source);
  await editor.undo();
  assert.equal(editor.pages[0].highlightChanges.length, 1);
});
test('removing a reopened highlight retains an explicit deletion through rebuilds', async () => {
  const { editor, change } = setup({ exists: true });
  await change(true);
  assert.deepEqual(editor.pages[0].highlightChanges, [{ id: input.id, value: null }]);
  assert.equal(editor.dirty, true);
  await editor.undo();
  assert.equal(editor.dirty, false);
});
test('a failed viewer replacement leaves model, bytes and history unchanged', async () => {
  const { editor, change } = setup({ failView: true });
  await assert.rejects(change(), /Viewer failed/);
  assert.equal(editor.bytes, editor.source);
  assert.equal(editor.dirty, false);
  assert.equal(editor.past.length, 0);
  assert.equal(editor.revision, 0);
});
test('stale selections and insufficient annotation permissions never reach worker', async () => {
  const { editor, requests } = setup();
  await assert.rejects(editor.changeHighlight({ pageIndex: 0, token: 'old', revision: 0, input }));
  editor.policy.canAnnotate = false;
  await assert.rejects(editor.changeHighlight({ pageIndex: 0, token: editor.token, revision: 0, input }));
  assert.equal(requests.length, 0);
});
test('hit testing selects characters only near the pointer', () => {
  const chars = [{ index: 4, position: { x: 10, y: 20, width: 8, height: 12 } },
    { index: 5, position: { x: 20, y: 20, width: 8, height: 12 } }];
  assert.equal(nearestCharacter(chars, 24, 25).index, 5);
  assert.equal(nearestCharacter(chars, 400, 400), null);
  assert.equal(nearestCharacter([], 0, 0), null);
});
