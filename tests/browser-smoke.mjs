// Optional end-to-end smoke test. npm ci && npm run assets && npx playwright install chromium
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { init } from '@embedpdf/pdfium';

const root = path.resolve(fileURLToPath(new URL('../src/PdfMB.Desktop/Web/', import.meta.url)));
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + name);
    if (!target.startsWith(root + path.sep) && target !== root) { response.writeHead(403).end(); return; }
    const data = await readFile(target); response.setHeader('Content-Type', mime[path.extname(target)] ?? 'application/octet-stream'); response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const api = await init({ wasmBinary: await readFile(new URL('../node_modules/@embedpdf/pdfium/dist/pdfium.wasm', import.meta.url)) }); api.PDFiumExt_Init();
const doc = api.FPDF_CreateNewDocument(), pdfPage = api.FPDFPage_New(doc, 0, 240, 200);
for (const [text, y] of [['SECRET', 140], ['VISIBLE', 40]]) {
  const object = api.FPDFPageObj_NewTextObj(doc, 'Helvetica', 16), p = api.pdfium.wasmExports.malloc((text.length + 1) * 2);
  api.pdfium.HEAPU16.set([...text].map(c => c.charCodeAt(0)).concat(0), p / 2); assert.ok(api.FPDFText_SetText(object, p)); api.pdfium.wasmExports.free(p);
  api.FPDFPageObj_Transform(object, 1, 0, 0, 1, 20, y); api.FPDFPage_InsertObject(pdfPage, object);
}
assert.ok(api.FPDFPage_GenerateContent(pdfPage));
const secondPage = api.FPDFPage_New(doc, 1, 240, 200);
assert.ok(api.FPDFPage_GenerateContent(secondPage)); api.FPDF_ClosePage(secondPage);
const writer = api.PDFiumExt_OpenFileWriter(); assert.ok(api.FPDF_SaveAsCopy(doc, writer, 2));
const length = api.PDFiumExt_GetFileWriterSize(writer), p = api.pdfium.wasmExports.malloc(length);
api.PDFiumExt_GetFileWriterData(writer, p, length);
const base64 = Buffer.from(api.pdfium.HEAPU8.slice(p, p + length)).toString('base64');
api.pdfium.wasmExports.free(p); api.PDFiumExt_CloseFileWriter(writer); api.FPDF_ClosePage(pdfPage); api.FPDF_CloseDocument(doc);
const browser = await chromium.launch({ ...(process.env.PDFMB_CHROMIUM_PATH ? { executablePath: process.env.PDFMB_CHROMIUM_PATH } : {}), headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
await page.addInitScript(() => {
  const listeners = [], pending = new Map(); window.__messages = []; window.chrome ??= {};
  window.chrome.webview = { addEventListener: (_, listener) => listeners.push(listener), postMessage: message => {
    window.__messages.push(message);
    if (message.type === 'host.stampImport') {
      const item = { ...message.payload, id: 'personal-test' };
      Promise.resolve().then(() => window.__request('stamps.set', { items: [item], selectedId: item.id }));
    }
    if (message.kind === 'response') { const task = pending.get(message.id); pending.delete(message.id); message.ok ? task?.resolve(message.payload) : task?.reject(Error(message.error)); }
  } };
  window.chrome.webview.postMessageWithAdditionalObjects = (message, files) => {
    window.__messages.push(message); window.__droppedFiles = files;
  };
  window.__request = (type, payload = {}) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID(); pending.set(id, { resolve, reject });
    listeners.forEach(fn => fn({ data: { version: 1, kind: 'request', id, type, payload } }));
  });
});
const request = (type, payload) => page.evaluate(({ type, payload }) => __request(type, payload), { type, payload });
async function pageBox() {
  await page.locator('#viewer img').first().waitFor();
  const images = await page.locator('#viewer img').all();
  const boxes = await Promise.all(images.map(image => image.boundingBox()));
  const viewport = page.viewportSize();
  const visibleArea = b => Math.max(0, Math.min(viewport.width, b.x + b.width) - Math.max(0, b.x)) *
    Math.max(0, Math.min(viewport.height, b.y + b.height) - Math.max(0, b.y));
  const index = boxes.map((box, index) => ({ box, index })).filter(item => item.box)
    .sort((a, b) => visibleArea(b.box) - visibleArea(a.box))[0]?.index;
  const box = await images[index].evaluate(image => new Promise(resolve => {
    let previous = '', stable = 0;
    const sample = () => {
      if (!image.isConnected) { resolve(null); return; }
      const rect = image.getBoundingClientRect(), snapshot = JSON.stringify(rect.toJSON());
      stable = image.complete && snapshot === previous ? stable + 1 : 0; previous = snapshot;
      if (stable >= 10) resolve({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      else requestAnimationFrame(sample);
    };
    sample();
  }));
  if (!box) return pageBox();
  assert.ok(box?.width > 100, 'Live PDF page is visible');
  return box;
}
try {
  await page.goto(origin + '/index.html');
  await page.waitForFunction(() => __messages.some(m => m.type === 'viewer.ready'), { timeout: 30000 });
  await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['%PDF-1.7'], 'trascinato.PDF', { type: 'application/pdf' }));
    document.querySelector('#welcome').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  assert.equal(await page.evaluate(() => window.__droppedFiles[0].name), 'trascinato.PDF');
  assert.equal(await page.evaluate(() => __messages.filter(m => m.type === 'host.drop').length), 1);
  console.log('PDF trascinato: invio del File nativo all’host e nessuna navigazione: OK');
  await request('editor.lock'); await request('document.open', { name: 'smoke.pdf', base64 }); await request('editor.unlock');
  await request('editor.lock'); await request('editor.highlight'); await request('editor.unlock');
  let box = await pageBox();
  await page.mouse.move(box.x + box.width * .08, box.y + box.height * .26); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .37, box.y + box.height * .26, { steps: 10 }); await page.mouse.up();
  await page.waitForFunction(() => __messages.some(m => m.type === 'editor.state' && m.payload.revision === 1 && !m.payload.busy));
  box = await pageBox();
  await page.mouse.click(box.x + box.width * .15, box.y + box.height * .26, { button: 'right' });
  await page.locator('#highlight-delete-menu').waitFor({ state: 'visible' });
  await page.locator('[data-highlight-remove]').click();
  await page.waitForFunction(() => __messages.some(m => m.type === 'editor.state' && m.payload.revision === 2 && !m.payload.busy));
  console.log('Evidenziazione e rimozione con tasto destro sulla pagina: OK');
  await request('editor.lock'); await request('editor.tools', { mode: 'note' }); await request('editor.unlock');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#viewer').evaluate(el => getComputedStyle(el).visibility), 'visible');
  await page.locator('#tools-contents').fill('Nota UI');
  box = await pageBox(); await page.mouse.click(box.x + box.width * .8, box.y + box.height * .5);
  await page.locator('#tools-apply').click(); await page.waitForFunction(() => document.querySelector('#tools-status').textContent.includes('Modifica applicata'));
  console.log('Nota adesiva nel browser: OK');
  box = await pageBox(); await page.mouse.click(box.x + box.width * .85, box.y + box.height * .56);
  await page.waitForFunction(() => document.querySelector('#tools-contents').value === 'Nota UI');
  await page.locator('#tools-next').click();
  await page.waitForFunction(() => document.querySelector('#tools-title').textContent.includes('pagina 2 / 2'));
  await page.locator('#tools-contents').fill('Seconda pagina');
  box = await pageBox(); await page.mouse.click(box.x + box.width * .6, box.y + box.height * .4);
  await page.locator('#tools-apply').click();
  await page.waitForFunction(() => [...document.querySelector('#tools-items').options].some(o => o.textContent.includes('Seconda pagina')));
  box = await pageBox(); await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5); await page.mouse.wheel(0, -2000);
  await page.waitForFunction(() => document.querySelector('#tools-title').textContent.includes('pagina 1 / 2'));
  console.log('Selezione nota sulla pagina, navigazione e scorrimento nel viewer: OK');
  for (const mode of ['square', 'circle', 'line', 'ink']) {
    await page.locator('#tools-mode').selectOption(mode); box = await pageBox();
    assert.equal(await page.locator('#tools-contents').isVisible(), false);
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .6); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .7, box.y + box.height * .75, { steps: 8 }); await page.mouse.up();
    assert.ok(await page.locator('#tools-canvas').isVisible());
    if (['square', 'circle'].includes(mode)) {
      const dirty = await page.evaluate(() => __messages.filter(m => m.type === 'editor.state').at(-1).payload);
      assert.equal(dirty.dirty, true); assert.equal(dirty.busy, false);
      // Simulate native Salva directly after drawing, without Applica.
      await request('editor.lock'); const saved = await request('document.export');
      await mkdir(new URL('../artifacts/test/', import.meta.url), { recursive: true });
      const target = new URL(`../artifacts/test/saved-${mode}.pdf`, import.meta.url);
      await writeFile(target, Buffer.from(saved.base64, 'base64'));
      await request('document.markSaved', { token: saved.token, revision: saved.revision, name: 'smoke.pdf' });
      await request('document.close');
      await request('document.open', { name: 'smoke.pdf', base64: (await readFile(target)).toString('base64') });
      await request('editor.unlock');
      await request('editor.lock'); await request('editor.tools', { mode }); await request('editor.unlock');
      assert.equal(await page.locator('#tools-items option').count(), 2, 'Shape reopened from saved file');
      assert.equal(await page.locator('#tools-contents').isVisible(), false);
    } else {
      await page.locator('#tools-apply').click();
      await page.waitForFunction(() => document.querySelector('#tools-status').textContent.includes('Modifica applicata'));
    }
  }
  console.log('Rettangolo/ellisse: nessun campo note, Salva senza Applica, riapertura dal file: OK');
  console.log('Forme e penna sul PDF dopo ripetuti aggiornamenti del viewer: OK');
  await mkdir(new URL('../artifacts/test/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/tools-on-page.png', import.meta.url)) });
  await page.locator('#tools-mode').selectOption('objects');
  assert.equal(await page.locator('#tools-mode option[value="capture"]').count(), 0);
  await page.locator('#tools-items').selectOption('1');
  assert.equal(await page.locator('#tools-contents').inputValue(), 'VISIBLE');
  box = await pageBox(); await page.mouse.click(box.x + box.width * .15, box.y + box.height * .26);
  await page.waitForFunction(() => document.querySelector('#tools-items').value === '0' && document.querySelector('#tools-contents').value === 'SECRET');
  await page.locator('#tools-items').selectOption('1');
  box = await pageBox(); await page.mouse.click(box.x + box.width * .15, box.y + box.height * .26);
  await page.waitForFunction(() => document.querySelector('#tools-items').value === '0');
  console.log('Selezione degli oggetti dal menu e dal PDF sincronizzata: OK');
  const previewRevision = await page.evaluate(() => __messages.filter(m => m.type === 'editor.state').at(-1).payload.revision);
  await page.locator('#tools-font').selectOption('Courier'); await page.locator('#tools-size').fill('24');
  await page.waitForFunction(() => document.querySelector('#tools-canvas').dataset.livePreview === 'true');
  assert.equal(await page.evaluate(() => __messages.filter(m => m.type === 'editor.state').at(-1).payload.revision), previewRevision);
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/live-font-preview.png', import.meta.url)) });
  await page.locator('#tools-reset-preview').click();
  assert.equal(await page.locator('#tools-font').inputValue(), 'Helvetica');
  assert.equal(await page.locator('#tools-size').inputValue(), '16');
  assert.equal(await page.locator('#tools-canvas').getAttribute('data-live-preview'), null);
  console.log('Font e dimensione: anteprima live sul PDF, ripristino e cronologia invariata: OK');
  await page.locator('#tools-contents').fill('PUBLIC'); await page.locator('#tools-apply').click();
  await page.waitForFunction(() => [...document.querySelector('#tools-items').options].some(o => o.textContent.includes('PUBLIC')));
  console.log('Modifica testo esistente: OK');
  await page.locator('#tools-mode').selectOption('stamp');
  await page.locator('[popovertarget="stamp-palette"]').click();
  assert.equal(await page.locator('#stamp-presets button').count(), 15);
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/stamp-palette.png', import.meta.url)) });
  await page.locator('#stamp-presets button').filter({ hasText: 'APPROVATO' }).first().click();
  box = await pageBox(); await page.mouse.click(box.x + box.width * .1, box.y + box.height * .4);
  await page.locator('#tools-apply').click();
  await page.waitForFunction(() => [...document.querySelector('#tools-items').options].some(option => option.textContent.includes('APPROVATO')));
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#00aa00'; ctx.fillRect(100, 0, 100, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#tools-stamp-upload').setInputFiles({ name: 'Personale.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') });
  await page.waitForFunction(() => document.querySelector('#tools-stamp').value === 'personal-test');
  await page.locator('#tools-stamp-width').fill('30');
  box = await pageBox(); await page.mouse.click(box.x + box.width * .05, box.y + box.height * .6);
  await page.locator('#tools-apply').click();
  await page.waitForFunction(() => [...document.querySelector('#tools-items').options].some(option => option.textContent.includes('Personale')));
  console.log('Timbri statici, import PNG trasparente e dimensioni proporzionate: OK');
  await page.locator('#tools-mode').selectOption('redact'); box = await pageBox();
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5); await page.mouse.up();
  await page.locator('#tools-apply').click(); await page.waitForFunction(() => document.querySelector('#tools-status').textContent.includes('Modifica applicata'));
  console.log('Oscuramento e aggiornamento viewer: OK');
  await page.locator('[data-tools-close]').click();
  await request('editor.lock'); const print = await request('output.print'); await request('editor.unlock');
  assert.equal(print.pages.length, 2); assert.ok(print.pages[0].base64.startsWith('iVBOR'));
  console.log('Generazione pagine di stampa: OK');
  await request('editor.lock'); const undo = await request('editor.undo'); const redo = await request('editor.redo'); await request('editor.unlock');
  assert.ok(undo.canRedo); assert.ok(redo.canUndo); console.log('Cronologia comune: OK');
  assert.deepEqual(errors, []);
  await mkdir(new URL('../artifacts/test/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/browser.png', import.meta.url)) });
} catch (error) {
  await mkdir(new URL('../artifacts/test/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/browser-failure.png', import.meta.url)) });
  console.error('Errori pagina:', errors);
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
