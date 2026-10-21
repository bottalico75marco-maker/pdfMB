import test from 'node:test';
import assert from 'node:assert/strict';
import { stampDimensions, stampDate, stampPresets } from '../src/PdfMB.Desktop/Web/stamps.mjs';

test('personal stamp sizes preserve aspect ratio and fit small, tall and rotated pages', () => {
  for (const [w, h] of [[1000, 240], [600, 600], [120, 900]]) for (const page of [{ width: 595, height: 842 }, { width: 100, height: 80 }, { width: 842, height: 595 }]) {
    const result = stampDimensions(w, h, page, 180);
    assert.ok(result.width <= page.width && result.height <= page.height + .0001);
    assert.ok(Math.abs(result.width / result.height - w / h) < .0001);
  }
  assert.throws(() => stampDimensions(0, 10, { width: 100, height: 200 }));
});
test('date stamps use the chosen static date and Italian formatting', () => {
  assert.equal(stampDate('2026-10-21', 'slash'), '21/10/2026');
  assert.equal(stampDate('2026-10-21', 'dash'), '21-10-2026');
  assert.equal(stampDate('2026-10-21', 'long'), '21 ottobre 2026');
  assert.throws(() => stampDate('2026-02-31', 'slash'));
  assert.equal(new Set(stampPresets.map(preset => preset[0])).size, 15);
});
