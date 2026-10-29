import { PDFDocument, PDFName, PDFHexString } from 'pdf-lib';
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
const errors = [], dialogs = []; page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); return dialog.accept(); });
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
  // Keep the actual nodes: nth locators can retarget or wait for an index
  // that disappears when a PDF replacement swaps the rendered image list.
  const images = await page.locator('#viewer img').elementHandles();
  const boxes = await Promise.all(images.map(image => image.boundingBox()));
  const viewport = page.viewportSize();
  const visibleArea = b => Math.max(0, Math.min(viewport.width, b.x + b.width) - Math.max(0, b.x)) *
    Math.max(0, Math.min(viewport.height, b.y + b.height) - Math.max(0, b.y));
  const index = boxes.map((box, index) => ({ box, index })).filter(item => item.box)
    .sort((a, b) => visibleArea(b.box) - visibleArea(a.box))[0]?.index;
  const box = index === undefined ? null : await images[index].evaluate(image => new Promise(resolve => {
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
  await Promise.all(images.map(image => image.dispose()));
  if (!box) return pageBox();
  assert.ok(box?.width > 100, 'Live PDF page is visible');
  return box;
}
try {
  await page.goto(origin + '/index.html');
  await page.waitForFunction(() => __messages.some(m => m.type === 'viewer.ready'), { timeout: 30000 });
  await page.locator('#welcome .welcome-logo').evaluate(image => image.decode());
  await mkdir(new URL('../artifacts/test/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/welcome-logo.png', import.meta.url)) });
  assert.equal(await page.locator('#text-toolbar button, #tools-toolbar button, .dialog-actions button, .welcome-actions button').evaluateAll(buttons =>
    buttons.every(button => button.querySelector('svg') && button.getAttribute('aria-label') && button.title && !button.textContent.trim())), true, 'All application command bars and buttons use accessible icons');
  await page.locator('#new-document').click();
  assert.ok(await page.evaluate(() => __messages.some(m => m.type === 'host.new')));
  await request('editor.lock');
  const created = await request('document.create', { format: 'A5', landscape: true });
  assert.ok(created.state.dirty); assert.equal(created.state.canUndo, false);
  const newPdf = await PDFDocument.load(Buffer.from(created.base64, 'base64'));
  assert.equal(newPdf.getPageCount(), 1); assert.ok(Math.abs(newPdf.getPage(0).getWidth() * 25.4 / 72 - 210) < .01);
  await request('document.markSaved', { token: created.state.token, revision: created.state.revision, name: 'nuovo.pdf' });
  const options = await request('editor.blankOptions'); assert.equal(options.pageCount, 1);
  await request('editor.insertBlank', { token: created.state.token, format: 'A3', landscape: false, position: 1 });
  const expanded = await request('document.export');
  const expandedPdf = await PDFDocument.load(Buffer.from(expanded.base64, 'base64'));
  assert.equal(expandedPdf.getPageCount(), 2); assert.ok(Math.abs(expandedPdf.getPage(0).getHeight() * 25.4 / 72 - 420) < .01);
  const beforeBlank = await request('editor.undo'); assert.equal(beforeBlank.dirty, false);
  await request('editor.redo'); await request('editor.unlock');
  assert.equal(await page.getByRole('button', { name: 'Documento', exact: true }).count(), 0, 'The empty embedded document menu is removed');
  await request('editor.toggle');
  await page.locator('.page-tile').first().click({ button: 'right' });
  await page.locator('[data-operation="insert-blank"]').click();
  assert.ok(await page.evaluate(() => __messages.some(m => m.type === 'host.insertBlank')));
  await page.locator('#panel-close').click();
  console.log('Nuovo A5 orizzontale, inserimento A3, Undo/Redo, comando pagina vuota e rimozione menu vuoto: OK');
  await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['%PDF-1.7'], 'trascinato.PDF', { type: 'application/pdf' }));
    document.querySelector('#welcome').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  assert.equal(await page.evaluate(() => window.__droppedFiles[0].name), 'trascinato.PDF');
  assert.equal(await page.evaluate(() => __messages.filter(m => m.type === 'host.drop').length), 1);
  console.log('PDF trascinato: invio del File nativo all’host e nessuna navigazione: OK');
  await request('editor.lock'); let markdownDoc = await request('document.open', { name: 'smoke.pdf', base64 });
  markdownDoc = await request('editor.insertBlank', { token: markdownDoc.token, format: 'A4', landscape: false, position: 3 }); await request('editor.unlock');
  await request('editor.lock'); await request('markdown.open', { token: markdownDoc.token, path: 'smoke.pdf.md' }); await request('editor.unlock');
  assert.equal(await page.locator('#markdown-ocr').isDisabled(), true, 'OCR disabled without Ollama/model');
  assert.ok(await page.locator('#markdown-ocr svg').count(), 'Dedicated OCR icon');
  await request('markdown.availability', { available: true, message: 'Test model ready', models: ['vision:test', 'text:local'] });
  assert.equal(await page.locator('#markdown-ocr').isEnabled(), true);
  assert.deepEqual(await page.locator('#markdown-models option').evaluateAll(options => options.map(option => option.value)), ['vision:test', 'text:local']);
  await request('markdown.availability', { available: false, message: 'Model missing' });
  assert.equal(await page.locator('#markdown-ocr').isDisabled(), true);
  const pdfBounds = await page.locator('#viewer-shell').boundingBox(), mdBounds = await page.locator('#markdown-panel').boundingBox();
  assert.ok(pdfBounds.width > 300 && mdBounds.x >= pdfBounds.x + pdfBounds.width - 2, 'PDF and Markdown side by side');
  const extractedMarkdown = await request('markdown.page', { token: markdownDoc.token, revision: markdownDoc.revision, pageIndex: 0 });
  assert.match(extractedMarkdown.markdown, /SECRET/);
  await request('markdown.begin', { pdfRevision: markdownDoc.revision });
  assert.equal(await page.locator('#markdown-source').getAttribute('readonly'), '');
  const generationEvents = await page.evaluate(() => __messages.filter(m => m.type?.startsWith('host.')).length);
  await page.locator('#markdown-source').focus();
  await page.keyboard.press('Control+o'); await page.keyboard.press('Control+s'); await page.keyboard.press('Control+p');
  await page.locator('#markdown-cancel').focus();
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+y');
  await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['%PDF-1.7'], 'during-ocr.pdf', { type: 'application/pdf' }));
    document.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  assert.equal(await page.evaluate(() => __messages.filter(m => m.type?.startsWith('host.')).length), generationEvents, 'Conversion blocks document shortcuts and file drops');
  assert.equal((await request('markdown.page', { token: markdownDoc.token, revision: markdownDoc.revision, pageIndex: 0 })).hasText, true, 'Undo/redo cannot change PDF revision during conversion');
  await page.locator('#markdown-cancel').click();
  assert.ok(await page.evaluate(() => __messages.some(m => m.type === 'host.markdownCancel')));
  await request('markdown.append', { page: 1, pageCount: 2, markdown: '# Testo\n\nPrima pagina' });
  await request('markdown.image', { index: 0, description: 'Descrizione già ricevuta' });
  const partialMarkdown = (await request('markdown.export')).text;
  await assert.rejects(() => request('markdown.image', { index: 1, description: 'è'.repeat(4 * 1024 * 1024) }), /8 MB/);
  assert.equal((await request('markdown.export')).text, partialMarkdown, 'Oversize image response preserves earlier OCR');
  await request('markdown.append', { page: 2, pageCount: 2, markdown: 'Seconda pagina' });
  await request('markdown.finish', { message: 'Done' });
  await page.locator('#markdown-source').fill('<!-- pdfmb-page:1 -->\n# Correzione\n\n<script>alert(1)</script>\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n<!-- pdfmb-page:2 -->\nSeconda pagina');
  await page.waitForFunction(() => document.querySelector('#markdown-preview h1')?.textContent === 'Correzione');
  assert.equal(await page.locator('#markdown-preview script').count(), 0, 'Raw HTML stays inert');
  assert.equal(await page.locator('#markdown-preview td').count(), 2, 'Live table preview');
  await page.locator('#markdown-source').press('Control+s');
  assert.ok(await page.evaluate(() => __messages.some(m => m.type === 'host.markdownSave')));
  const correctedMarkdown = await request('markdown.export'); assert.equal(correctedMarkdown.dirty, true);
  await assert.rejects(() => request('markdown.saved', { revision: correctedMarkdown.revision - 1, path: 'smoke.pdf.md' }), /cambiato/);
  await request('markdown.saved', { revision: correctedMarkdown.revision, path: 'smoke.pdf.md' });
  assert.equal((await request('markdown.export')).dirty, false);
  // Scrolling the viewer reports its page more than once as the layout settles,
  // so wait for the comparison to reach the chosen page rather than for one
  // particular message to be the latest.
  const comparedPage = expected => page.waitForFunction(wanted =>
    __messages.filter(m => m.type === 'viewer.state').some(m => m.payload.page === wanted), expected);
  await page.locator('#markdown-page').selectOption('2');
  await comparedPage(2);
  await page.evaluate(() => { window.__messages = __messages.filter(m => m.type !== 'viewer.state'); });
  await page.locator('#markdown-page').selectOption('1');
  await comparedPage(1);
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/markdown-comparison.png', import.meta.url)) });
  await page.locator('#markdown-close').click();
  await request('editor.lock'); await request('markdown.open', { token: markdownDoc.token, text: '', path: 'smoke.pdf.md' }); await request('editor.unlock');
  assert.equal((await request('markdown.export')).text, correctedMarkdown.text, 'Reopening comparison preserves existing edits');
  await page.locator('#markdown-source').fill(correctedMarkdown.text + '\nModifica da conservare');
  await page.locator('#markdown-close').click();
  await request('editor.lock'); await request('markdown.open', { token: markdownDoc.token, text: '', path: 'smoke.pdf.md' }); await request('editor.unlock');
  assert.equal((await request('markdown.export')).dirty, true, 'Hiding comparison preserves unsaved changes');
  await request('editor.lock'); await request('document.open', { name: 'smoke.pdf', base64 }); await request('editor.unlock');
  assert.equal((await request('markdown.export')).text, '', 'Changing document clears Markdown session');
  await page.evaluate(() => { window.__messages = []; });
  console.log('Markdown: extraction, side-by-side editing, live preview, OCR availability, cancellation, local shortcuts and page comparison: OK');
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
  await page.locator('#tools-dx').fill('5');
  await page.waitForFunction(() => document.querySelector('#tools-canvas').dataset.livePreview === 'true');
  assert.equal(await page.evaluate(() => __messages.filter(m => m.type === 'editor.state').at(-1).payload.revision), previewRevision);
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/live-font-preview.png', import.meta.url)) });
  await page.locator('#tools-reset-preview').click();
  assert.equal(await page.locator('#tools-dx').inputValue(), '0');
  assert.equal(await page.locator('#tools-canvas').getAttribute('data-live-preview'), null);
  console.log('Trasformazione oggetti: anteprima live, ripristino e cronologia invariata: OK');
  await request('editor.lock'); await request('editor.text'); await request('editor.unlock');
  await page.locator('.text-box-hit[data-note="content-0"]').first().waitFor();
  await page.locator('.text-box-hit[data-note="content-0"]').first().click();
  await page.waitForFunction(() => document.querySelector('.text-inline-input')?.readOnly === false);
  await page.locator('.text-inline-input').fill('PUBLIC');
  assert.equal(await page.evaluate(() => __messages.filter(m => m.type === 'editor.state').at(-1).payload.revision), previewRevision, 'Typing remains a draft until committed');
  await page.locator('.text-inline-input').press('Control+Enter');
  await page.waitForFunction(() => document.querySelector('#text-status').textContent.startsWith('Testo applicato'));
  await request('editor.lock'); const unifiedSaved = await request('document.export'); await request('editor.unlock');
  const mdAfterText = await request('markdown.page', { token: unifiedSaved.token, revision: unifiedSaved.revision, pageIndex: 0 });
  assert.match(mdAfterText.markdown, /PUBLIC/); assert.doesNotMatch(mdAfterText.markdown, /SECRET/);
  const plane = await page.locator('.text-page-plane').first().boundingBox();
  await page.mouse.click(plane.x + plane.width * .5, plane.y + plane.height * .45);
  await page.locator('.text-inline-input').fill('Nuovo testo');
  const fittedBox = await page.locator('.text-box-selected').evaluate(element => ({ width: parseFloat(element.style.width), height: parseFloat(element.style.height) }));
  assert.ok(fittedBox.width < 150 && fittedBox.height < 30, 'New box shrinks around its text');
  await page.locator('.text-inline-input').press('Control+Enter');
  await page.waitForFunction(() => document.querySelector('#text-status').textContent.startsWith('Testo applicato'));
  // The inline editor must take every edit at the first attempt. Each step
  // below reproduces a way it used to drop one: the applied block losing the
  // selection, a click arriving while an edit was being applied, and Delete
  // handed the promise of the edit already in flight.
  const blockLabels = () => page.locator('.text-box-hit').evaluateAll(hits => hits.map(hit => hit.getAttribute('aria-label').replace('Casella: ', '')));
  const blockBox = label => page.locator(`.text-box-hit[aria-label="Casella: ${label}"]`);
  const chosenBlock = label => page.waitForFunction(expected => document.querySelector('#text-existing').selectedOptions[0]?.textContent === expected, label, { timeout: 30000 });
  const applyingNow = () => page.waitForFunction(() => __messages.filter(m => m.type === 'editor.state').at(-1).payload.busy === true);
  const typeInto = async value => {
    await page.waitForFunction(() => document.querySelector('.text-inline-input')?.readOnly === false);
    await page.locator('.text-inline-input').fill(value);
  };
  await blockBox('VISIBLE').click();
  await typeInto('VISIBILE');
  await page.locator('.text-inline-input').press('Control+Enter');
  await chosenBlock('VISIBILE');
  assert.ok(!(await blockLabels()).includes('VISIBILE'), 'The applied block is still the selected one, ready for the next edit');
  await page.locator('.text-box-selected').dblclick();
  await typeInto('VISIBILE DUE');
  await page.locator('.text-inline-input').press('Control+Enter');
  await applyingNow();
  await blockBox('PUBLIC').click();
  await chosenBlock('PUBLIC');
  assert.ok((await blockLabels()).includes('VISIBILE DUE'), 'The edit under way when the click arrived was applied too');
  await page.locator('.text-box-selected').dblclick();
  await typeInto('DA ELIMINARE');
  const beforeDelete = dialogs.length;
  await page.locator('#text-larger').click();
  await page.locator('#text-larger').press('Control+Enter');
  await applyingNow();
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => document.querySelector('#text-status').textContent.startsWith('Casella eliminata'), { timeout: 30000 });
  assert.ok(dialogs.slice(beforeDelete).some(dialog => dialog.type === 'confirm' && /Eliminare la casella/.test(dialog.message)), 'Delete is carried out, not answered by the edit in flight');
  assert.ok(!(await blockLabels()).includes('DA ELIMINARE'), 'The block the user had selected is the one removed');
  console.log('Editor testo: modifica applicata al primo tentativo, selezione conservata, clic e Elimina durante l’applicazione: OK');
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/unified-text.png', import.meta.url)) });
  await request('editor.lock'); await request('editor.undo'); await request('editor.redo');
  await request('editor.text'); await request('editor.tools', { mode: 'stamp' }); await request('editor.unlock');
  console.log('Testo unificato: modifica originale, inserimento con clic, casella compatta, salvataggio nativo e Annulla/Ripeti: OK');
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
  // Dedicated authoring UI, pending drafts and fill values use the same save path.
  await request('editor.lock'); await request('document.open', { name: 'modulo.pdf', base64 });
  await request('editor.forms'); await request('editor.unlock');
  assert.equal(await page.locator('#workspace').isVisible(), false);
  assert.equal(await page.locator('#form-toolbar').isVisible(), true);
  assert.equal(await page.locator('#form-toolbar button').evaluateAll(nodes => nodes.every(n => !!n.getAttribute('aria-label') && !n.textContent.trim())), true);
  async function formDrag(x, y, w, h) {
    const b = await page.locator('#form-sheet').boundingBox();
    await page.mouse.move(b.x + b.width * x, b.y + b.height * y); await page.mouse.down();
    await page.mouse.move(b.x + b.width * (x + w), b.y + b.height * (y + h), { steps: 6 }); await page.mouse.up();
  }
  await page.locator('#form-text').click(); await formDrag(.1, .15, .55, .15);
  await page.locator('#form-name').fill('nome'); await page.locator('#form-defaultValue').fill('Iniziale €');
  const applyStarted = performance.now();
  await page.locator('#form-apply').click();
  await page.waitForFunction(() => __messages.at(-2)?.type === 'editor.state' && !__messages.at(-2)?.payload.busy);
  const applyElapsed = performance.now() - applyStarted;
  assert.ok(applyElapsed < 2500, `Form Apply must not wait for hidden viewer layout (${Math.round(applyElapsed)} ms)`);
  console.log(`Aggiornamento campo modulo: ${Math.round(applyElapsed)} ms`);
  await page.locator('#form-checkbox').click();
  let sheet = await page.locator('#form-sheet').boundingBox();
  await page.mouse.click(sheet.x + sheet.width * .1, sheet.y + sheet.height * .5);
  assert.equal(await page.locator('#form-width').inputValue(), '16');
  assert.equal(await page.locator('#form-height').inputValue(), '16');
  // A fresh, uncommitted checkbox can immediately be enlarged with its handle.
  const resize = await page.locator('.form-resize').boundingBox();
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2); await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 14, resize.y + resize.height / 2 + 14, { steps: 5 }); await page.mouse.up();
  assert.ok(Number(await page.locator('#form-width').inputValue()) > 20);
  await page.locator('#form-name').fill('consenso'); await page.locator('#form-defaultChecked').check();
  // Save commits the checkbox still in preview, without pressing Apply.
  await request('editor.lock'); let formSaved = await request('document.export'); await request('editor.unlock');
  let formPdf = await PDFDocument.load(Buffer.from(formSaved.base64, 'base64'));
  assert.equal(formPdf.getForm().getFields().length, 2); assert.ok(formPdf.getForm().getCheckBox('consenso').isChecked());
  await page.locator('#form-dropdown').click(); await formDrag(.1, .75, .6, .14);
  await page.locator('#form-name').fill('destinazione');
  await page.locator('#form-options').fill('Italia\nCittà €\nEstero');
  await page.locator('#form-defaultOption').selectOption('Italia');
  // Selecting another field commits the draft instead of ignoring the click.
  await page.locator('[aria-label="Campo testo: nome"]').click();
  await page.waitForFunction(() => !document.querySelector('#form-workspace').inert);
  assert.equal(await page.locator('#form-name').inputValue(), 'nome');
  // Page navigation and returning to the viewer retain the current page.
  await page.locator('#form-next').click(); await page.waitForFunction(() => document.querySelector('#form-page').textContent === '2 / 2' && !document.querySelector('#form-workspace').inert);
  await page.locator('#form-previous').click(); await page.waitForFunction(() => document.querySelector('#form-page').textContent === '1 / 2' && !document.querySelector('#form-workspace').inert);
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/form-design.png', import.meta.url)) });
  await page.locator('#form-preview').click();
  assert.equal(await page.locator('#form-fields select').inputValue(), 'Italia');
  assert.deepEqual(await page.locator('#form-fields select option').evaluateAll(nodes => nodes.map(n => n.value)), ['', 'Italia', 'Città €', 'Estero']);
  await page.locator('#form-fields select').selectOption('Città €');
  await page.waitForFunction(() => !document.querySelector('#form-workspace').inert);
  const nameInput = page.locator('#form-fields input:not([type="checkbox"])');
  await nameInput.fill('Valore Tab'); await page.keyboard.press('Tab');
  await page.waitForFunction(() => !document.querySelector('#form-workspace').inert);
  assert.equal(await page.locator('#form-fields input[type="checkbox"]').evaluate(input => input === document.activeElement), true, 'Tab retains focus on the next field after committing');
  await nameInput.fill('Città €');
  // Focus is still in the input: editor.lock must acquire the last keystrokes.
  await request('editor.lock'); formSaved = await request('document.export'); await request('editor.unlock');
  formPdf = await PDFDocument.load(Buffer.from(formSaved.base64, 'base64'));
  assert.equal(formPdf.getForm().getTextField('nome').getText(), 'Città €');
  assert.deepEqual(formPdf.getForm().getDropdown('destinazione').getSelected(), ['Città €']);
  assert.equal(formPdf.getForm().getDropdown('destinazione').isMultiselect(), false);
  await page.locator('#form-fields input[type="checkbox"]').uncheck();
  await page.waitForFunction(() => !document.querySelector('#form-workspace').inert);
  await request('editor.lock'); formSaved = await request('document.export'); await request('editor.unlock');
  assert.equal((await PDFDocument.load(Buffer.from(formSaved.base64, 'base64'))).getForm().getCheckBox('consenso').isChecked(), false);
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/form-fill.png', import.meta.url)) });
  await page.locator('#form-exit').click(); await page.locator('#form-workspace').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#workspace').isVisible(), true);
  // Reopening restores the fields, values and editability.
  await request('editor.lock'); await request('document.open', { name: 'riaperto.pdf', base64: formSaved.base64 });
  await request('editor.forms'); await request('editor.unlock');
  assert.equal(await page.locator('.form-widget').count(), 3);
  await page.locator('#form-preview').click(); assert.equal(await nameInput.inputValue(), 'Città €');
  assert.equal(await page.locator('#form-fields select').inputValue(), 'Città €');
  await page.locator('#form-exit').click(); await page.locator('#form-workspace').waitFor({ state: 'hidden' });
  // Insert a copy of the first form page: names and IDs must remain independent.
  await request('editor.lock'); const currentForm = await request('document.export');
  const incoming = await request('editor.prepareInsert', { token: currentForm.token, name: 'copia.pdf', base64: currentForm.base64 });
  await request('editor.insert', { token: currentForm.token, importToken: incoming.importToken, pageIndexes: [0], position: 3 });
  const insertedForm = await request('document.export');
  const insertedPdf = await PDFDocument.load(Buffer.from(insertedForm.base64, 'base64'));
  assert.deepEqual(insertedPdf.getForm().getFields().map(f => f.getName()).sort(), ['consenso', 'consenso_2', 'destinazione', 'destinazione_2', 'nome', 'nome_2']);
  assert.equal(insertedPdf.getForm().getTextField('nome_2').getText(), 'Città €');
  assert.deepEqual(insertedPdf.getForm().getDropdown('destinazione_2').getSelected(), ['Città €']);
  await request('editor.undo'); const undoneForm = await request('document.export');
  assert.equal((await PDFDocument.load(Buffer.from(undoneForm.base64, 'base64'))).getForm().getFields().length, 3);
  await request('editor.redo'); await request('editor.unlock');
  console.log('Moduli: reattività, checkbox standard ridimensionabile, dropdown, salvataggio, compilazione e riapertura: OK');
  await request('editor.lock'); await request('document.open', { name: 'nuovi-campi.pdf', base64 });
  await request('editor.forms'); await request('editor.unlock');
  const imageBuffer = Buffer.from(await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 60; canvas.height = 40; const c = canvas.getContext('2d'); c.fillStyle = '#1685d0'; c.fillRect(0, 0, 60, 40); return canvas.toDataURL().split(',')[1]; }), 'base64');
  await page.locator('#form-datetime').click(); await formDrag(.1, .1, .7, .12);
  await page.locator('#form-format').selectOption('HH:mm'); await page.locator('#form-dateDefault').fill('NOW()');
  await page.locator('#form-apply').click();
  await request('editor.lock'); const timeDefault = await request('document.export'); await request('editor.unlock');
  assert.match((await PDFDocument.load(Buffer.from(timeDefault.base64, 'base64'))).getForm().getTextField('data_ora_1').getText(), /^\d{2}:\d{2}$/);
  assert.equal(await page.locator('#form-dateDefault').inputValue(), 'NOW()');
  await page.locator('#form-format').selectOption('gg/mm/aaaa HH:mm'); await page.locator('#form-apply').click();
  await page.locator('#form-text').click(); await formDrag(.1, .3, .7, .12);
  await page.locator('#form-name').fill('codice'); await page.locator('#form-pattern').fill('[A-Z]{2}[0-9]{6}');
  await page.locator('#form-validationMessage').fill('Codice non valido'); await page.locator('#form-required').check(); await page.locator('#form-apply').click();
  await page.locator('#form-image').click(); await formDrag(.1, .55, .35, .3);
  const chooseDesignImage = page.waitForEvent('filechooser'); await page.locator('.form-design-upload').click();
  await (await chooseDesignImage).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: imageBuffer });
  await page.locator('#form-imagePreview').waitFor({ state: 'visible' });
  await page.locator('#form-imageRemove').click(); await page.locator('#form-imagePreview').waitFor({ state: 'hidden' });
  await page.locator('#form-imageUpload').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: imageBuffer });
  await page.locator('#form-imagePreview').waitFor({ state: 'visible' }); await page.locator('#form-apply').click();
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/form-design-upload-now.png', import.meta.url)) });
  await page.locator('#form-button').click(); await formDrag(.55, .55, .35, .15);
  await page.locator('#form-email').fill('test@example.com'); await page.locator('#form-apply').click();
  await page.locator('#form-preview').click();
  const dateInput = page.getByRole('textbox', { name: 'data_ora_1', exact: true });
  assert.match(await dateInput.inputValue(), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  await page.locator('.form-image-upload img').waitFor();
  await dateInput.fill('31/02/2024 25:00'); await assert.rejects(request('editor.lock'), /Data o ora/);
  if (await page.locator('#dismiss-error').isVisible()) await page.locator('#dismiss-error').click(); await dateInput.fill('28/02/2024 12:30');
  await request('editor.lock'); await request('editor.unlock');
  await page.getByRole('button', { name: 'pulsante_1', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#error-text').textContent.includes('obbligatorio'));
  await page.locator('#dismiss-error').click();
  const codeInput = page.getByRole('textbox', { name: 'codice', exact: true });
  await codeInput.fill('BAD'); await assert.rejects(request('editor.lock'), /Codice non valido/);
  await codeInput.press('Tab');
  await page.waitForFunction(() => document.querySelector('#fatal').hidden === false);
  assert.ok(dialogs.some(dialog => dialog.type === 'alert' && dialog.message === 'Codice non valido'), 'Invalid regex value shows an alert when leaving the field');
  if (await page.locator('#dismiss-error').isVisible()) await page.locator('#dismiss-error').click(); await codeInput.fill('AB123456');
  await request('editor.lock'); await request('editor.unlock');
  await page.locator('#form-fields input[type="file"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: imageBuffer });
  await page.locator('.form-image-upload img').waitFor();
  await page.getByRole('button', { name: 'Rimuovi immagine', exact: true }).click();
  await page.locator('.form-image-upload img').waitFor({ state: 'detached' });
  await page.locator('#form-undo').click(); await page.locator('.form-image-upload img').waitFor();
  await page.getByRole('button', { name: 'pulsante_1', exact: true }).click();
  await page.waitForFunction(() => __messages.some(m => m.type === 'host.formEmail'));
  const emailRequest = await page.evaluate(() => __messages.filter(m => m.type === 'host.formEmail').at(-1).payload);
  assert.equal(await page.evaluate(() => { const index = __messages.findLastIndex(m => m.type === 'host.formEmail'); return __messages.slice(0, index).filter(m => m.type === 'editor.state').at(-1).payload.busy; }), false, 'Native host email event is emitted after the editing transaction is idle');
  await request('editor.lock'); const attachment = await request('document.email', emailRequest);
  assert.equal(attachment.email, 'test@example.com');
  const emailPdf = await PDFDocument.load(Buffer.from(attachment.base64, 'base64'));
  assert.equal(emailPdf.getForm().getTextField('codice').getText(), 'AB123456');
  assert.equal(emailPdf.getForm().getTextField('data_ora_1').getText(), '28/02/2024 12:30');
  const protectedState = await request('document.protect', { password: 'Prova-2026-è' });
  assert.equal(protectedState.passwordProtected, true);
  assert.equal(await page.locator('#form-protect').getAttribute('data-icon'), 'unprotect');
  assert.equal(await page.locator('#form-protect').getAttribute('aria-label'), 'Rimuovi password');
  const protectedForm = await request('document.export');
  await assert.rejects(PDFDocument.load(Buffer.from(protectedForm.base64, 'base64')), /encrypted/);
  await request('document.markSaved', { token: protectedForm.token, revision: protectedForm.revision, name: 'protetto.pdf' });
  await assert.rejects(request('document.open', { name: 'protetto.pdf', base64: protectedForm.base64, password: 'errata' }), /PASSWORD/);
  await request('document.open', { name: 'protetto.pdf', base64: protectedForm.base64, password: 'Prova-2026-è' });
  await request('editor.forms'); await request('editor.unlock'); await page.locator('#form-preview').click();
  assert.equal(await page.locator('#form-protect').getAttribute('data-icon'), 'unprotect', 'Reopened protected file retains the removal command');
  const beforeProtectClick = await page.evaluate(() => __messages.filter(m => m.type === 'host.protect').length);
  await page.getByRole('button', { name: 'Rimuovi password', exact: true }).click();
  assert.equal(await page.evaluate(() => __messages.filter(m => m.type === 'host.protect').length), beforeProtectClick + 1);
  await page.locator('.form-image-upload img').waitFor(); assert.equal(await codeInput.inputValue(), 'AB123456');
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/forms-new-fields.png', import.meta.url)) });
  await request('editor.lock'); const stillProtected = await request('document.export');
  await assert.rejects(PDFDocument.load(Buffer.from(stillProtected.base64, 'base64')), /encrypted/);
  const unprotectedState = await request('document.protect', { password: '' });
  assert.equal(unprotectedState.passwordProtected, false);
  assert.equal(await page.locator('#form-protect').getAttribute('data-icon'), 'protect');
  assert.equal(await page.locator('#form-protect').getAttribute('aria-label'), 'Proteggi con password');
  const unprotected = await request('document.export');
  assert.equal((await PDFDocument.load(Buffer.from(unprotected.base64, 'base64'))).getForm().getFields().length, 4);
  await request('editor.unlock');
  // Reproduce the 0.10.0/0.10.1 destination: Unicode text used as a file spec.
  // Reopening and saving alone must repair it, preserving the completed form.
  const legacyEmailPdf = await PDFDocument.load(Buffer.from(unprotected.base64, 'base64'));
  const legacyWidget = legacyEmailPdf.getForm().getButton('pulsante_1').acroField.getWidgets()[0];
  legacyWidget.dict.set(PDFName.of('A'), legacyEmailPdf.context.obj({ S: 'SubmitForm', F: PDFHexString.fromText('mailto:test@example.com'), Flags: 256 }));
  const legacyMetadata = JSON.parse(legacyWidget.dict.lookup(PDFName.of('PDFMBFormData')).decodeText());
  delete legacyMetadata.emailActionVersion;
  legacyWidget.dict.set(PDFName.of('PDFMBFormData'), PDFHexString.fromText(JSON.stringify(legacyMetadata)));
  const legacyCode = legacyEmailPdf.getForm().getTextField('codice');
  const legacyScript = legacyCode.acroField.dict.lookup(PDFName.of('AA')).lookup(PDFName.of('V'));
  legacyScript.set(PDFName.of('JS'), PDFHexString.fromText(legacyScript.lookup(PDFName.of('JS')).decodeText().replace('catch (error)', 'catch')));
  const legacyCodeWidget = legacyCode.acroField.getWidgets()[0];
  const legacyCodeMetadata = JSON.parse(legacyCodeWidget.dict.lookup(PDFName.of('PDFMBFormData')).decodeText());
  delete legacyCodeMetadata.validationVersion;
  legacyCodeWidget.dict.set(PDFName.of('PDFMBFormData'), PDFHexString.fromText(JSON.stringify(legacyCodeMetadata)));
  await request('editor.lock');
  const repairState = await request('document.open', { name: 'email-precedente.pdf', base64: Buffer.from(await legacyEmailPdf.save({ updateFieldAppearances: false })).toString('base64') });
  assert.equal(repairState.dirty, true); assert.equal(repairState.canUndo, false);
  const repaired = await request('document.export');
  const repairedPdf = await PDFDocument.load(Buffer.from(repaired.base64, 'base64'));
  const repairedAction = repairedPdf.getForm().getButton('pulsante_1').acroField.getWidgets()[0].dict.lookup(PDFName.of('A'));
  assert.equal(repairedAction.lookup(PDFName.of('F')).lookup(PDFName.of('FS')).toString(), '/URL');
  assert.deepEqual([...repairedAction.lookup(PDFName.of('F')).lookup(PDFName.of('F')).asBytes()], [...Buffer.from('mailto:test@example.com', 'ascii')]);
  assert.equal(repairedPdf.getForm().getTextField('codice').getText(), 'AB123456');
  assert.ok(repairedPdf.getForm().getTextField('codice').acroField.dict.lookup(PDFName.of('AA')).lookup(PDFName.of('V')).lookup(PDFName.of('JS')).decodeText().includes('catch (error)'));
  assert.equal(repairedPdf.getForm().getTextField('data_ora_1').getText(), '28/02/2024 12:30');
  const repairPending = await request('editor.unlock'); assert.equal(repairPending.dirty, true);
  await request('editor.lock');
  const repairedSaved = await request('document.markSaved', { token: repaired.token, revision: repaired.revision, name: 'email-corretto.pdf' });
  assert.equal(repairedSaved.dirty, false);
  const reopenedRepair = await request('document.open', { name: 'email-corretto.pdf', base64: repaired.base64 });
  assert.equal(reopenedRepair.dirty, false);
  await request('editor.unlock');
  console.log('Azione email: URL mailto ASCII esplicito; riparazione di PDF precedenti al semplice Salva, valori conservati: OK');
  const readerDate = page.locator('.pdfmb-form-reader').getByRole('textbox', { name: 'data_ora_1', exact: true });
  const readerEmail = page.locator('.pdfmb-form-reader').getByRole('button', { name: 'pulsante_1', exact: true });
  await readerEmail.waitFor({ state: 'visible', timeout: 5000 });
  assert.equal(await readerDate.isEditable(), true, 'Date/time is editable in the normal document view');
  assert.equal(await readerDate.inputValue(), '28/02/2024 12:30');
  await readerDate.fill('29/02/2024 18:45');
  await request('editor.lock'); const filledInReader = await request('document.export'); await request('editor.unlock');
  assert.equal((await PDFDocument.load(Buffer.from(filledInReader.base64, 'base64'))).getForm().getTextField('data_ora_1').getText(), '29/02/2024 18:45');
  await readerDate.waitFor({ state: 'visible' }); assert.equal(await readerDate.inputValue(), '29/02/2024 18:45');
  const readerPicker = page.locator('.pdfmb-form-reader').getByLabel('Seleziona data_ora_1', { exact: true });
  assert.equal(await readerPicker.inputValue(), '2024-02-29T18:45');
  const beforePicker = (await page.evaluate(() => __messages.filter(m => m.type === 'editor.state').at(-1).payload)).revision;
  await readerPicker.fill('2025-06-18T10:15');
  await page.waitForFunction(revision => { const state = __messages.filter(m => m.type === 'editor.state').at(-1)?.payload; return state && !state.busy && state.revision > revision; }, beforePicker);
  await readerDate.waitFor({ state: 'visible' }); assert.equal(await readerDate.inputValue(), '18/06/2025 10:15');
  const beforeReaderEmail = await page.evaluate(() => __messages.filter(m => m.type === 'host.formEmail').length);
  await readerEmail.click();
  await page.waitForFunction(count => __messages.filter(m => m.type === 'host.formEmail').length > count, beforeReaderEmail);
  const normalEmail = await page.evaluate(() => __messages.filter(m => m.type === 'host.formEmail').at(-1).payload);
  await request('editor.lock'); const normalAttachment = await request('document.email', normalEmail); await request('editor.unlock');
  assert.equal((await PDFDocument.load(Buffer.from(normalAttachment.base64, 'base64'))).getForm().getTextField('data_ora_1').getText(), '18/06/2025 10:15');
  await readerEmail.waitFor({ state: 'visible' });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/normal-view-form.png', import.meta.url)) });
  await request('editor.lock'); await request('document.open', { name: 'modulo-vista-normale.pdf', base64: normalAttachment.base64 }); await request('editor.unlock');
  await readerEmail.waitFor({ state: 'visible' }); assert.equal(await readerDate.inputValue(), '18/06/2025 10:15');
  console.log('Vista normale: pulsante email visibile e funzionante, data/ora modificabile da testo e selettore, salvataggio e riapertura: OK');
  await request('editor.lock'); await request('document.open', { name: 'immagine-statica.pdf', base64 });
  await request('editor.tools', { mode: 'image' }); await request('editor.unlock');
  box = await pageBox();
  await page.mouse.move(box.x + box.width * .1, box.y + box.height * .35); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .85, { steps: 6 }); await page.mouse.up();
  await assert.rejects(request('editor.lock'), /Completare l’immagine/, 'An empty upload box cannot be silently saved as a static image');
  box = await pageBox();
  const chooseStaticImage = page.waitForEvent('filechooser');
  await page.mouse.click(box.x + box.width * .3, box.y + box.height * .5);
  await (await chooseStaticImage).setFiles({ name: 'static.png', mimeType: 'image/png', buffer: imageBuffer });
  await page.waitForFunction(() => document.querySelector('#tools-image-name').textContent === 'static.png' && __messages.filter(m => m.type === 'editor.state').at(-1).payload.busy === false);
  assert.equal(await page.locator('#tools-image-controls').isVisible(), true);
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/static-image-preview.png', import.meta.url)) });
  // Native Save commits the loaded image without requiring Apply.
  await request('editor.lock'); const staticPdf = await request('document.export');
  const savedStatic = await PDFDocument.load(Buffer.from(staticPdf.base64, 'base64'));
  assert.equal(savedStatic.getForm().getFields().length, 0);
  assert.equal(savedStatic.getPage(0).node.Annots()?.size() ?? 0, 0, 'Static image has no widget or clickable annotation');
  const countStaticImages = saved => {
    const bytes = Buffer.from(saved.base64, 'base64'), pointer = api.pdfium.wasmExports.malloc(bytes.length);
    api.pdfium.HEAPU8.set(bytes, pointer); const doc = api.FPDF_LoadMemDocument(pointer, bytes.length, ''); assert.ok(doc);
    const p = api.FPDF_LoadPage(doc, 0);
    try { return Array.from({ length: api.FPDFPage_CountObjects(p) }, (_, i) => api.FPDFPageObj_GetType(api.FPDFPage_GetObject(p, i))).filter(type => type === 3).length; }
    finally { api.FPDF_ClosePage(p); api.FPDF_CloseDocument(doc); api.pdfium.wasmExports.free(pointer); }
  };
  assert.equal(countStaticImages(staticPdf), 1);
  await request('editor.undo'); assert.equal(countStaticImages(await request('document.export')), 0);
  await request('editor.redo'); assert.equal(countStaticImages(await request('document.export')), 1);
  await request('document.open', { name: 'riaperto-statico.pdf', base64: staticPdf.base64 }); await request('editor.unlock');
  console.log('Strumenti Immagine: clic e upload, anteprima, Salva senza Applica, immagine statica senza widget, Annulla/Ripeti e riapertura: OK');
  console.log('Regex, calendario/formati, immagine upload persistente, email con PDF compilato, password e riapertura protetta: OK');
  // A page containing only widgets reproduces the blank-thumbnail regression.
  const thumbnailPdf = await PDFDocument.create(), thumbnailPage = thumbnailPdf.addPage([300, 400]);
  const thumbnailForm = thumbnailPdf.getForm();
  for (const [name, value, x] of [['codice', 'AB123456', 20], ['data', '22/10/2026 05:03', 160]]) {
    const field = thumbnailForm.createTextField(name); field.setText(value);
    field.addToPage(thumbnailPage, { x, y: 330, width: 120, height: 24 }); field.setFontSize(10);
  }
  thumbnailForm.createButton('email').addToPage('Invia PDF', thumbnailPage, { x: 100, y: 250, width: 110, height: 30 });
  await request('editor.lock');
  await request('document.open', { name: 'solo-campi.pdf', base64: Buffer.from(await thumbnailPdf.save()).toString('base64') });
  await request('editor.unlock');
  async function assertFormThumbnail(selector) {
    const regions = [[24, 48, 110, 17], [164, 48, 110, 17], [104, 124, 102, 22]];
    const images = page.locator(selector);
    let counts;
    for (let attempt = 0; attempt < 50 && !counts; attempt++) {
      counts = await images.evaluateAll((images, regions) => {
        const image = images.find(image => {
          const rect = image.getBoundingClientRect();
          return rect.width >= 100 && rect.width <= 180 && rect.height > 0 && image.complete && image.naturalWidth;
        });
        if (!image) return null;
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        return regions.map(([x, y, width, height]) => {
          const data = context.getImageData(Math.round(x * canvas.width / 300), Math.round(y * canvas.height / 400),
            Math.max(1, Math.round(width * canvas.width / 300)), Math.max(1, Math.round(height * canvas.height / 400))).data;
          let dark = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i + 3] && Math.min(data[i], data[i + 1], data[i + 2]) < 180) dark++;
          return dark;
        });
      }, regions);
      if (!counts) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(counts?.every(count => count > 5), `Thumbnail includes text, date/time and button caption: ${counts}`);
  }
  await assertFormThumbnail('#viewer img');
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/form-thumbnails.png', import.meta.url)) });
  await request('editor.toggle');
  await assertFormThumbnail('.page-tile img');
  await page.locator('#panel-close').click();
  console.log('Miniature laterali e Gestisci pagine: testo, data/ora e pulsante presenti anche su pagina senza contenuti statici: OK');
  assert.deepEqual(errors, []);
  await mkdir(new URL('../artifacts/test/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/browser.png', import.meta.url)) });
} catch (error) {
  await mkdir(new URL('../artifacts/test/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/test/browser-failure.png', import.meta.url)) });
  console.error('Errori pagina:', errors);
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
