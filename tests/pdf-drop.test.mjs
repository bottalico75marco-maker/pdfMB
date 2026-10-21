import test from 'node:test';
import assert from 'node:assert/strict';
import { installPdfDrop } from '../src/PdfMB.Desktop/Web/pdf-drop.mjs';

test('file drops deliver one PDF object, reject other inputs and block while busy', () => {
  const target = new EventTarget(), opened = [], errors = [];
  let busy = false;
  const dispose = installPdfDrop({ target, unavailable: () => busy, open: file => opened.push(file), showError: error => errors.push(error.message) });
  const send = (files, type = 'drop', types = ['Files']) => {
    const event = new Event(type, { cancelable: true });
    event.dataTransfer = { files, types }; target.dispatchEvent(event); return event;
  };
  const pdf = { name: 'un documento.PDF' };
  assert.equal(send([pdf]).defaultPrevented, true); assert.equal(opened[0], pdf);
  send([{ name: 'image.png' }]); send([pdf, pdf]);
  assert.equal(errors.length, 2); assert.equal(opened.length, 1);
  busy = true;
  assert.equal(send([pdf], 'dragover').dataTransfer.dropEffect, 'none');
  send([pdf]); assert.equal(opened.length, 1);
  assert.equal(send([], 'drop', ['text/plain']).defaultPrevented, false);
  dispose(); busy = false; send([pdf]); assert.equal(opened.length, 1);
});
