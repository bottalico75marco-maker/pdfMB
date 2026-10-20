// Optional end-to-end smoke test. npm ci && npm run assets && npx playwright install chromium
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
    if (message.kind === 'response') { const task = pending.get(message.id); pending.delete(message.id); message.ok ? task?.resolve(message.payload) : task?.reject(Error(message.error)); }
  } };
  window.__request = (type, payload = {}) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID(); pending.set(id, { resolve, reject });
    listeners.forEach(fn => fn({ data: { version: 1, kind: 'request', id, type, payload } }));
  });
});
const request = (type, payload) => page.evaluate(({ type, payload }) => __request(type, payload), { type, payload });
try {
  await page.goto(origin + '/index.html');
  await page.waitForFunction(() => __messages.some(m => m.type === 'viewer.ready'), { timeout: 30000 });
  await request('editor.lock'); await request('document.open', { name: 'smoke.pdf', base64 }); await request('editor.unlock');
  await request('editor.lock'); await request('editor.tools', { mode: 'note' }); await request('editor.unlock');
  await page.locator('#tools-contents').fill('Nota UI');
  let box = await page.locator('#tools-canvas').boundingBox(); await page.mouse.click(box.x + box.width * .8, box.y + box.height * .5);
  await page.locator('#tools-apply').click(); await page.waitForFunction(() => document.querySelector('#tools-status').textContent.includes('Modifica applicata'));
  console.log('Nota adesiva nel browser: OK');
  await page.locator('#tools-mode').selectOption('objects'); await page.locator('#tools-items').selectOption('0');
  await page.locator('#tools-contents').fill('PUBLIC'); await page.locator('#tools-apply').click();
  await page.waitForFunction(() => [...document.querySelector('#tools-items').options].some(o => o.textContent.includes('PUBLIC')));
  console.log('Modifica testo esistente: OK');
  await page.locator('#tools-mode').selectOption('capture'); await page.locator('#tools-apply').click();
  await page.waitForFunction(() => __messages.some(m => m.type === 'host.capture'));
  const captured = await page.evaluate(() => __messages.find(m => m.type === 'host.capture').payload);
  assert.ok(captured.base64.startsWith('iVBOR')); console.log('Cattura PNG: OK');
  await page.locator('#tools-mode').selectOption('redact'); box = await page.locator('#tools-canvas').boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5); await page.mouse.up();
  await page.locator('#tools-apply').click(); await page.waitForFunction(() => document.querySelector('#tools-status').textContent.includes('Modifica applicata'));
  console.log('Oscuramento e aggiornamento viewer: OK');
  await page.locator('[data-tools-close]').click();
  await request('editor.lock'); const print = await request('output.print'); await request('editor.unlock');
  assert.equal(print.pages.length, 1); assert.ok(print.pages[0].base64.startsWith('iVBOR'));
  console.log('Generazione pagine di stampa: OK');
  await request('editor.lock'); const undo = await request('editor.undo'); const redo = await request('editor.redo'); await request('editor.unlock');
  assert.ok(undo.canRedo); assert.ok(redo.canUndo); console.log('Cronologia comune: OK');
  assert.deepEqual(errors, []);
  await mkdir(new URL('../artifacts/test/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/browser.png', import.meta.url)) });
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
