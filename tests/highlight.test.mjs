import test from 'node:test';
import assert from 'node:assert/strict';
import { PageEditor } from '../src/PdfMB.Desktop/Web/page-editor.mjs';
import { captureSelection, markerCursor, HighlightSurface } from '../src/PdfMB.Desktop/Web/highlight-surface.mjs';

const input = { id: 'pdfmb-h-12345678-1234-1234-1234-123456789abc', start: 0, end: 4, color: '#ffff00' };
function setup({ exists = false, failView = false } = {}) {
  const requests = [];
  const editor = new PageEditor('test.pdf', async () => { if (failView) throw new Error('Viewer failed'); }, () => 1);
  editor.source = editor.bytes = new ArrayBuffer(16);
  editor.policy = { canAnnotate: true, readOnly: false };
  editor.worker = { alive: true, request: async (type, payload) => {
    requests.push({ type, payload });
    if (type === 'highlight-change') return { value: payload.remove ? null : { id: payload.input.id, color: payload.input.color, quads: [[0, 10, 30, 10, 0, 0, 30, 0]] }, exists };
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
test('viewer selection is copied without relying on glyph indices or screen pixels', () => {
  const selected = [{ pageIndex: 1, segmentRects: [{ origin: { x: 12, y: 30 }, size: { width: 70, height: 10 } }] }];
  const captured = captureSelection(selected);
  selected[0].segmentRects[0].origin.x = 999;
  assert.deepEqual(captured, [{ pageIndex: 1, rects: [{ origin: { x: 12, y: 30 }, size: { width: 70, height: 10 } }] }]);
  assert.match(markerCursor('#ffff00'), /data:image\/svg\+xml/);
  assert.match(decodeURIComponent(markerCursor('#ffff00')), /fill="#ffff00"/);
});
test('selection across pages is a single undoable transaction', async () => {
  const { editor, requests } = setup();
  await editor.changeHighlights({ token: editor.token, revision: 0, color: '#92e897',
    selections: [{ pageIndex: 0, rects: [] }, { pageIndex: 1, rects: [] }] });
  assert.equal(editor.past.length, 1);
  assert.equal(requests.filter(r => r.type === 'rebuild').length, 1);
  assert.equal(editor.pages[0].highlightChanges[0].value.color, '#92e897');
  assert.equal(editor.pages[1].highlightChanges[0].value.color, '#92e897');
  await editor.undo();
  assert.equal(editor.dirty, false);
  await editor.redo();
  assert.equal(editor.pages[1].highlightChanges.length, 1);
});
test('failure preparing a later page preserves the entire document', async () => {
  const { editor } = setup();
  const original = editor.worker.request;
  editor.worker.request = (type, payload) => {
    if (type === 'highlight-change' && payload.pageIndex === 1) throw Error('Page unavailable');
    return original(type, payload);
  };
  await assert.rejects(editor.changeHighlights({ token: editor.token, revision: 0, color: '#ffff00',
    selections: [{ pageIndex: 0, rects: [] }, { pageIndex: 1, rects: [] }] }), /Page unavailable/);
  assert.equal(editor.dirty, false);
  assert.equal(editor.past.length, 0);
  assert.equal(editor.bytes, editor.source);
});

function toolFixture() {
  const menu = { hidePopover() {}, querySelector: () => ({}) };
  globalThis.document = { querySelector: name => name === '#highlight-delete-menu' ? menu : {} };
  let begin, end, selection = [], queued;
  const cursors = [], calls = [];
  const scope = { onBeginSelection: fn => { begin = fn; return () => {}; },
    onEndSelection: fn => { end = fn; return () => {}; }, clear: () => {},
    getFormattedSelection: () => selection, setMarqueeEnabled: () => {} };
  const interaction = { activate: id => calls.push(id), setCursor: (...args) => cursors.push(args), removeCursor: id => calls.push(id) };
  const editor = { token: 'document-a', revision: 4, canText: true, changeHighlights: async payload => calls.push(payload) };
  const session = { currentId: 'view-a' };
  const tool = new HighlightSurface({ editor: () => editor, session, plugin: name => ({ forDocument: () => name === 'selection' ? scope : interaction }),
    run: action => { queued = action; return Promise.resolve(); }, notify() {}, unavailable: () => false, showError: assert.fail });
  tool.sync();
  return { tool, editor, session, calls, cursors, begin: () => begin(), end: () => end(),
    select: () => { selection = [{ pageIndex: 0, segmentRects: [{ origin: { x: 1, y: 2 }, size: { width: 3, height: 4 } }] }]; },
    commit: async () => queued?.() };
}
test('button activates marker mode; release captures color and applies viewer selection', async () => {
  const f = toolFixture();
  f.tool.toggle();
  assert.equal(f.tool.active, true);
  assert.equal(f.cursors.at(-1)[2], 100);
  f.tool.setColor('#ffabc8');
  f.begin(); f.select(); f.end();
  f.tool.setColor('#86d6ff');
  await f.commit();
  const payload = f.calls.find(call => call.selections);
  assert.equal(payload.color, '#ffabc8');
  assert.equal(payload.revision, 4);
  assert.equal(payload.selections[0].pageIndex, 0);
  assert.equal(f.tool.active, true);
});
test('normal selection does not edit; a new view preserves mode but a new document disables it', () => {
  const f = toolFixture();
  f.begin(); f.select(); f.end();
  assert.equal(f.tool.pending, undefined);
  f.tool.toggle(true);
  f.session.currentId = 'view-b'; f.tool.sync();
  assert.equal(f.tool.active, true);
  f.editor.token = 'document-b'; f.tool.sync();
  assert.equal(f.tool.active, false);
});
test('deactivation or a host lock cancels an in-progress selection', async () => {
  const f = toolFixture();
  f.tool.toggle(true); f.begin(); f.select(); f.tool.suspend(); f.end();
  await f.commit();
  assert.equal(f.calls.some(call => call.selections), false);
  f.begin(); f.tool.toggle(false); f.end();
  assert.equal(f.calls.some(call => call.selections), false);
});
