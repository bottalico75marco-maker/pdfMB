import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { init } from '@embedpdf/pdfium';
import { createTextTools } from '../src/PdfMB.Desktop/Web/text-engine.mjs';
import { createWorkbenchTools } from '../src/PdfMB.Desktop/Web/workbench-engine.mjs';
import { createUnifiedTextTools } from '../src/PdfMB.Desktop/Web/unified-text-engine.mjs';
import { groupNearbyText, textLayout } from '../src/PdfMB.Desktop/Web/text-layout.mjs';

const api = await init({ wasmBinary: await readFile(new URL('../node_modules/@embedpdf/pdfium/dist/pdfium.wasm', import.meta.url)) });
api.PDFiumExt_Init();
const texts = createTextTools(api), objects = createWorkbenchTools(api, texts), unified = createUnifiedTextTools(api, texts, objects);
function fixture(rotation = 0) {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 400, 400);
  function insert(value, x, y, font = 'Helvetica', color = [0, 0, 0]) {
    const object = api.FPDFPageObj_NewTextObj(doc, font, 12), p = api.pdfium.wasmExports.malloc((value.length + 1) * 2);
    try {
      for (let i = 0; i <= value.length; i++) api.pdfium.HEAPU16[p / 2 + i] = value.charCodeAt(i) || 0;
      assert.ok(api.FPDFText_SetText(object, p));
    } finally { api.pdfium.wasmExports.free(p); }
    api.FPDFPageObj_Transform(object, 1, 0, 0, 1, x, y); api.FPDFPageObj_SetFillColor(object, ...color, 255); api.FPDFPage_InsertObject(page, object);
  }
  insert('Buon', 20, 340); insert('giorno', 53, 340); insert('Seconda riga', 20, 325);
  insert('Colonna separata', 230, 340); insert('Titolo', 20, 375, 'Helvetica-Bold');
  assert.ok(api.FPDFPage_GenerateContent(page)); api.FPDFPage_SetRotation(page, rotation);
  return { doc, page, close() { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(doc); } };
}
function reopen(doc, verify) {
  const writer = api.PDFiumExt_OpenFileWriter(); let p = 0;
  try {
    assert.ok(api.FPDF_SaveAsCopy(doc, writer, 2)); const n = api.PDFiumExt_GetFileWriterSize(writer);
    p = api.pdfium.wasmExports.malloc(n); api.PDFiumExt_GetFileWriterData(writer, p, n);
    const saved = api.FPDF_LoadMemDocument(p, n, ''), page = api.FPDF_LoadPage(saved, 0);
    try { verify(saved, page); } finally { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(saved); }
  } finally { if (p) api.pdfium.wasmExports.free(p); api.PDFiumExt_CloseFileWriter(writer); }
}

test('nearby native fragments become one block, while columns and different styles stay separate on every page rotation', () => {
  for (let rotation = 0; rotation < 4; rotation++) {
    const f = fixture(rotation);
    try {
      api.FPDFPage_SetCropBox(f.page, 10, 10, 390, 390);
      const groups = unified.groups(f.doc, f.page);
      assert.equal(groups.length, 3, JSON.stringify(groups.map(g => g.contents)));
      const paragraph = groups.find(g => g.contents.startsWith('Buon'));
      assert.equal(paragraph.contents, 'Buon giorno\nSeconda riga'); assert.equal(paragraph.members.length, 3);
      assert.equal(groups.find(g => g.contents === 'Titolo').font, 5, 'Bold style is recognized');
      assert.equal(unified.groups(f.doc, f.page, { canContent: false }).length, 0, 'Original text respects content permissions');
      assert.equal(api.FPDFPage_CountObjects(f.page), 5, 'Reading groups does not mutate the PDF');
      unified.change(f.doc, f.page, { ...paragraph, contents: 'Caffè €', size: 12, color: '#112233' });
      reopen(f.doc, (doc, page) => {
        const native = objects.objects(page, true);
        assert.equal(native.length, 3); assert.ok(native.some(o => o.text.trimEnd() === 'Caffè €' && o.color === '#112233'));
        assert.ok(!native.some(o => /Buon|giorno|Seconda/.test(o.text)), 'Original members actually removed');
        assert.equal(api.FPDFPage_GetAnnotCount(page), 0, 'Original text remains native searchable PDF text');
        assert.equal(api.FPDFPage_GetRotation(page), rotation);
        const edited = unified.groups(doc, page).find(g => g.contents === 'Caffè €'); assert.ok(edited.position.width * edited.position.height < paragraph.position.width * paragraph.position.height);
      });
    } finally { f.close(); }
  }
});

test('managed boxes are compacted to their contents and nearby compatible boxes edit as one annotation', () => {
  const f = fixture();
  try {
    const make = (contents, x) => ({ id: `pdfmb-${crypto.randomUUID()}`, contents, font: 4, size: 12, color: '#000000', position: { x, y: 220, width: 160, height: 90 } });
    const first = make('Uno', 20), fit = unified.compact(f.doc, f.page, first);
    assert.ok(fit.position.width < 35 && fit.position.height < 25);
    const second = make('Due', 20 + fit.position.width + 2);
    texts.apply(f.page, [first, second].map(input => ({ id: input.id, value: texts.prepare(f.page, input) })));
    const group = unified.groups(f.doc, f.page).find(g => g.source === 'annotation');
    assert.equal(group.contents, 'Uno Due'); assert.equal(group.members.length, 2);
    unified.change(f.doc, f.page, { ...group, contents: 'Unita' });
    reopen(f.doc, (doc, page) => {
      const group = unified.groups(doc, page).find(group => group.source === 'annotation');
      assert.ok(group.position.height < 25, 'Reopening the compact box must preserve one-line bounds');
      const notes = texts.notes(page); assert.equal(notes.length, 1); assert.equal(notes[0].contents, 'Unita');
      assert.ok(notes[0].position.width < 45 && notes[0].position.height < 25);
      const image = texts.render(page); assert.ok(image.pixels.byteLength > 0);
    });
  } finally { f.close(); }
});

test('wrapping retains long words, Unicode and explicit lines without overflowing the requested width', () => {
  const measure = text => [...text].length * 6;
  const result = textLayout('Caffè lunghissimaparola\n€ fine', 70, 12, measure);
  assert.ok(result.lines.every(line => measure(line) <= 66));
  assert.equal(result.lines.join('').replaceAll(' ', ''), 'Caffèlunghissimaparola€fine');
  const item = (id, x, color = '#000000') => ({ id, members: [id], source: 'annotation', fontKey: '4', size: 12, color, contents: id, rawPosition: { x, y: 0, width: 20, height: 12 } });
  assert.equal(groupNearbyText([item('a', 0), item('b', 22, '#ff0000')]).length, 2, 'Managed boxes of different colours are never merged');
  const native = (id, x, color = '#000000', font = 4) => ({ ...item(id, x, color), source: 'content', font, fontKey: String(font) });
  const joined = groupNearbyText([native('aa', 0), native('b', 22, '#ff0000', 5), native('ccc', 44)]);
  assert.equal(joined.length, 1, 'Native text of one line joins across colours and weights');
  assert.equal(joined[0].font, 4); assert.equal(joined[0].color, '#000000'); assert.equal(joined[0].mixed, true, 'The block takes the dominant style and says it is mixed');
});

test('compacted FreeText keeps a short sentence on one line in the saved PDF appearance', () => {
  const f = fixture();
  try {
    const input = { id: `pdfmb-${crypto.randomUUID()}`, contents: 'Nuovo testo', font: 4, size: 16, color: '#000000', position: { x: 20, y: 220, width: 200, height: 70 } };
    const fitted = unified.compact(f.doc, f.page, input);
    texts.apply(f.page, [{ id: input.id, value: texts.prepare(f.page, fitted) }]);
    reopen(f.doc, (doc, page) => {
      const group = unified.groups(doc, page).find(group => group.source === 'annotation');
      assert.ok(group.position.height < 25 && group.position.width > 75, 'Compact sentence retains one-line bounds after reopening');
      const image = texts.render(page), data = new Uint8Array(image.pixels), scale = image.width / 400;
      const ys = [];
      for (let y = Math.ceil(220 * scale); y < Math.floor(280 * scale); y++) for (let x = Math.ceil(20 * scale); x < Math.floor(200 * scale); x++) {
        const i = (y * image.width + x) * 4;
        if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) ys.push(y / scale);
      }
      assert.ok(ys.length > 0 && Math.max(...ys) - Math.min(...ys) < 17, 'Compact appearance must not wrap or clip the short sentence');
    });
  } finally { f.close(); }
});

// Regression fixture for the inline editor's geometry: one paragraph the source
// already wrapped, and three single lines at one line of leading that must stay
// separate blocks because their colours differ.
function stackFixture() {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 400, 300);
  function insert(value, x, y, color = [0, 0, 0]) {
    const object = api.FPDFPageObj_NewTextObj(doc, 'Helvetica', 12), p = api.pdfium.wasmExports.malloc((value.length + 1) * 2);
    try {
      for (let i = 0; i <= value.length; i++) api.pdfium.HEAPU16[p / 2 + i] = value.charCodeAt(i) || 0;
      assert.ok(api.FPDFText_SetText(object, p));
    } finally { api.pdfium.wasmExports.free(p); }
    api.FPDFPageObj_Transform(object, 1, 0, 0, 1, x, y); api.FPDFPageObj_SetFillColor(object, ...color, 255); api.FPDFPage_InsertObject(page, object);
  }
  const paragraph = ['Il canone di locazione annuo', 'e corrisposto in rate mensili', 'anticipate entro il giorno cinque'];
  paragraph.forEach((line, index) => insert(line, 30, 250 - index * 14.4));
  insert('Riga rossa', 30, 160, [255, 0, 0]);
  insert('Riga nera', 30, 145.6);
  insert('Riga blu', 30, 131.2, [0, 0, 255]);
  assert.ok(api.FPDFPage_GenerateContent(page));
  return { doc, page, paragraph, close() { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(doc); } };
}

test('selecting a native paragraph never re-wraps it, because its block is measured with the advance widths a commit uses', () => {
  const f = stackFixture();
  try {
    const paragraph = unified.groups(f.doc, f.page).find(group => group.contents.startsWith('Il canone'));
    assert.deepEqual(paragraph.contents.split('\n'), f.paragraph, 'The source lines are grouped as they are');
    // The inline editor lays the block out at the width of its own box, so a
    // box narrower than its longest line silently pushed the last word down.
    const reopened = unified.compact(f.doc, f.page, { ...paragraph, layoutWidth: paragraph.position.width });
    assert.deepEqual(reopened.layout.lines, f.paragraph, 'Reopening a paragraph must not move a single word');
    assert.ok(Math.abs(reopened.position.width - paragraph.position.width) < .1 &&
      Math.abs(reopened.position.height - paragraph.position.height) < .1, 'An untouched paragraph keeps its box');
  } finally { f.close(); }
});

test('blocks of consecutive lines do not overlap, so a click selects the line it lands on', () => {
  const f = stackFixture();
  try {
    const groups = unified.groups(f.doc, f.page);
    // Native lines of different colours now form one block, edited in the dominant style.
    assert.equal(groups.length, 2, JSON.stringify(groups.map(g => g.contents)));
    const coloured = groups.find(g => g.contents === 'Riga rossa\nRiga nera\nRiga blu');
    assert.ok(coloured?.mixed, 'Three colours in one block are reported as mixed');
    const right = p => p.x + p.width, bottom = p => p.y + p.height;
    for (const a of groups) for (const b of groups) {
      if (a === b) continue;
      const shared = Math.max(0, Math.min(right(a.position), right(b.position)) - Math.max(a.position.x, b.position.x)) *
        Math.max(0, Math.min(bottom(a.position), bottom(b.position)) - Math.max(a.position.y, b.position.y));
      // One 1/16 pt of outward rounding per edge is the only slack allowed: the
      // boxes used to stand 4 pt into their neighbour and stole its clicks.
      assert.ok(shared <= a.position.width / 8, `${a.contents} overlaps ${b.contents} by ${shared.toFixed(2)} pt²`);
    }
    assert.ok(Math.abs(coloured.position.height - 3 * 12 * 1.2) < 2.5, `Three lines of leading: ${coloured.position.height}`);
  } finally { f.close(); }
});

test('a single line nobody sized grows to fit, and wraps only at the edge of the page', () => {
  const f = stackFixture();
  try {
    const base = { id: `pdfmb-${crypto.randomUUID()}`, font: 4, size: 12, color: '#000000',
      position: { x: 20, y: 200, width: 40, height: 20 }, layoutWidth: 1e6 };
    const grown = unified.compact(f.doc, f.page, { ...base, contents: 'Una frase che non va spezzata' });
    assert.equal(grown.layout.lines.length, 1, 'An unconstrained line stays on one line');
    assert.ok(grown.position.width > 140 && grown.position.x + grown.position.width <= 400.1);
    // The same request must still be held inside the page rather than overflow.
    const clamped = unified.compact(f.doc, f.page, { ...base, contents: 'parola '.repeat(80).trim() });
    assert.ok(clamped.layout.lines.length > 1, 'The page edge is the last resort for wrapping');
    assert.ok(clamped.position.x + clamped.position.width <= 400.1 && clamped.position.height <= 300.1);
    // A width the user did choose by drawing or resizing still wraps there.
    const drawn = unified.compact(f.doc, f.page, { ...base, contents: 'Una frase che non va spezzata', layoutWidth: 90 });
    assert.ok(drawn.layout.lines.length > 1 && drawn.position.width <= 90.1, 'A drawn box keeps the width it was given');
  } finally { f.close(); }
});

// Real documents often emit a word one glyph run at a time. Place the letters
// at their true advances, so each run carries the bounding box PDFium measures:
// ascenders, x-height letters and round capitals all reach different heights.
function shatteredFixture(pieces, font = 'Helvetica', size = 10) {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 400, 200);
  const handle = api.FPDFText_LoadStandardFont(doc, font), w = api.pdfium.wasmExports.malloc(4);
  const advance = text => [...text].reduce((sum, ch) => {
    assert.ok(api.FPDFFont_GetGlyphWidth(handle, ch.codePointAt(0), size, w));
    return sum + api.pdfium.HEAPF32[w / 4];
  }, 0);
  let x = 40;
  for (const piece of pieces) {
    if (piece.trim()) {
      const object = api.FPDFPageObj_NewTextObj(doc, font, size), p = api.pdfium.wasmExports.malloc((piece.length + 1) * 2);
      try {
        for (let i = 0; i <= piece.length; i++) api.pdfium.HEAPU16[p / 2 + i] = piece.charCodeAt(i) || 0;
        assert.ok(api.FPDFText_SetText(object, p));
      } finally { api.pdfium.wasmExports.free(p); }
      api.FPDFPageObj_Transform(object, 1, 0, 0, 1, x, 120); api.FPDFPage_InsertObject(page, object);
    }
    x += advance(piece);
  }
  api.pdfium.wasmExports.free(w); api.FPDFFont_Close(handle);
  assert.ok(api.FPDFPage_GenerateContent(page));
  return { doc, page, close() { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(doc); } };
}

test('a word split across glyph runs comes back whole, whatever height each run reaches', () => {
  // I and f are ascenders, n m e r sit at x-height, O and C overshoot the cap
  // height: ordering the runs by the top of their box scrambled the line and
  // every run that arrived from the left opened a block of its own.
  for (const pieces of [['I', 'n', 'f', 'er', 'm', 'iere'], ['B', 'OTT', 'AL', 'ICO'], ['f', '.', 'vi', 'r', 'tu', 'ci', 'o']]) {
    const f = shatteredFixture(pieces);
    try {
      const groups = unified.groups(f.doc, f.page);
      assert.equal(groups.length, 1, `${pieces.join('|')} must be one block, got ${JSON.stringify(groups.map(g => g.contents))}`);
      assert.equal(groups[0].contents, pieces.join(''));
      assert.equal(groups[0].members.length, pieces.length, 'Every run belongs to the block');
    } finally { f.close(); }
  }
});

test('a space between runs is restored once, and never invented inside a word', () => {
  const spaced = shatteredFixture(['BOTTALICO', ' ', 'MARCO']);
  try {
    const groups = unified.groups(spaced.doc, spaced.page);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].contents, 'BOTTALICO MARCO', 'The gap a space left behind is read back as one space');
  } finally { spaced.close(); }
  // The same letters with no space must not acquire one, however wide the side
  // bearings of I, l, f or the full stop make the gap between their boxes.
  for (const word of ['Infermiere', 'f.virtucio', 'Illustrissimo', 'affidabilità']) {
    const f = shatteredFixture([...word]);
    try {
      const groups = unified.groups(f.doc, f.page);
      assert.equal(groups.length, 1, word);
      assert.equal(groups[0].contents, word, `${word} must not gain a space`);
    } finally { f.close(); }
  }
});

// The saved appearance is flowed again by PDFium inside the annotation
// rectangle. The box must hold exactly the lines PDFium produces: one line
// fewer clipped the text, one more left a blank band under it, and a box
// wider than the one drawn ignored the width the user chose.
test('FreeText boxes hold exactly the lines PDFium lays out and never exceed the requested width', () => {
  const words = 'il la di che e a un per con non una su le si da come anche più ma dei del nel alla sono casella testo documento pagina modifica salvataggio verifica riga parola lunghissima supercalifragilistichespiralidoso PDF MB editor Windows locale stampa oscuramento modulo campo data firma è perché così 12.345,67 (nota) fine.'.split(' ');
  let seed = 11; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = list => list[Math.floor(random() * list.length)];
  let checked = 0;
  for (let n = 0; n < 120; n++) {
    let contents = Array.from({ length: 1 + Math.floor(random() * 30) }, () => pick(words)).join(' ');
    if (random() < .2) contents = contents.replace(/ /g, (space, index) => index % 7 === 3 ? '\n' : space);
    const size = pick([6, 8, 9.96, 10, 11.04, 12, 14, 16, 18, 24, 36]), font = Math.floor(random() * 12), width = 30 + Math.floor(random() * 400);
    const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 600, 5000);
    try {
      const input = { id: `pdfmb-${crypto.randomUUID()}`, contents, font, size, color: '#000000', position: { x: 10, y: 10, width, height: 60 }, layoutWidth: width };
      const fitted = unified.compact(doc, page, input);
      texts.apply(page, [{ id: input.id, value: texts.prepare(page, fitted) }]);
      const annot = api.FPDFPage_GetAnnot(page, 0), length = api.FPDFAnnot_GetAP(annot, 0, 0, 0), ptr = api.pdfium.wasmExports.malloc(length);
      api.FPDFAnnot_GetAP(annot, 0, ptr, length);
      const stream = new TextDecoder('utf-16le').decode(api.pdfium.HEAPU8.slice(ptr, ptr + length - 2));
      api.pdfium.wasmExports.free(ptr); api.FPDFPage_CloseAnnot(annot);
      const shown = (stream.match(/[)] Tj/g) ?? []).length;
      assert.equal(shown, fitted.layout.lines.length, `font ${font} ${size}pt in ${width}pt: ${JSON.stringify(contents)}`);
      assert.ok(fitted.position.width <= Math.max(12, width) + .25, `box ${fitted.position.width} exceeds requested ${width}`);
      checked++;
    } finally { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(doc); }
  }
  assert.ok(checked >= 100);
});

test('a box whose text reaches the bottom or right edge is moved inside the page instead of being rejected', () => {
  const f = fixture();
  try {
    const input = { id: `pdfmb-${crypto.randomUUID()}`, contents: 'riga uno\nriga due\nriga tre', font: 4, size: 12, color: '#000000', position: { x: 50, y: 390, width: 60, height: 40 }, layoutWidth: 1e6 };
    const fitted = unified.compact(f.doc, f.page, input);
    assert.ok(fitted.position.y + fitted.position.height <= 400 + .01, 'bottom edge');
    assert.equal(fitted.layout.lines.length, 3);
    texts.apply(f.page, [{ id: input.id, value: texts.prepare(f.page, fitted) }]);
    const wide = { ...input, id: `pdfmb-${crypto.randomUUID()}`, contents: 'una riga lunga che arriva fino al bordo destro e oltre', position: { x: 300, y: 20, width: 60, height: 20 } };
    const fittedWide = unified.compact(f.doc, f.page, wide);
    assert.ok(fittedWide.position.x + fittedWide.position.width <= 400 + .01, 'right edge');
    assert.ok(fittedWide.layout.lines.length > 1, 'wraps at the page edge');
    texts.apply(f.page, [{ id: wide.id, value: texts.prepare(f.page, fittedWide) }]);
    assert.equal(texts.notes(f.page).length, 2);
  } finally { f.close(); }
});

// The native default-appearance getter only knows /Helv; the other eleven
// standard fonts came back as -1 and the box could never be edited again.
test('every standard font of an applied box is read back, so the box stays editable after reopening', () => {
  for (let font = 0; font < 12; font++) {
    const f = fixture();
    try {
      const id = `pdfmb-${crypto.randomUUID()}`;
      texts.apply(f.page, [{ id, value: texts.prepare(f.page, { id, contents: 'dfadfa', font, size: 24, color: '#102030', position: { x: 20, y: 20, width: 120, height: 30 } }) }]);
      reopen(f.doc, (doc, page) => {
        const note = texts.notes(page)[0];
        assert.equal(note.font, font); assert.equal(note.size, 24); assert.equal(note.color, '#102030');
        const group = unified.groups(doc, page).find(group => group.source === 'annotation');
        unified.change(doc, page, { ...group, contents: 'dfadfa due', position: { ...group.position, width: 60 }, layoutWidth: 60 });
        assert.equal(texts.notes(page)[0].font, font, 'editing keeps the font');
      });
    } finally { f.close(); }
  }
});

// PDFs written glyph by glyph (Word, Chromium) place every letter in its own
// object. Ink boxes differ per letter shape, so rows and lines must follow the
// text origin, and the page's text layer must decide where the spaces are.
test('glyph-by-glyph native text groups into one line with the spaces of the text layer only', () => {
  const doc = api.FPDF_CreateNewDocument(), page = api.FPDFPage_New(doc, 0, 500, 200);
  function glyph(value, x, y, font, size) {
    const object = api.FPDFPageObj_NewTextObj(doc, font, size), p = api.pdfium.wasmExports.malloc((value.length + 1) * 2);
    try { for (let i = 0; i <= value.length; i++) api.pdfium.HEAPU16[p / 2 + i] = value.charCodeAt(i) || 0; assert.ok(api.FPDFText_SetText(object, p)); }
    finally { api.pdfium.wasmExports.free(p); }
    api.FPDFPageObj_Transform(object, 1, 0, 0, 1, x, y); api.FPDFPageObj_SetFillColor(object, 0, 51, 89, 255); api.FPDFPage_InsertObject(page, object);
  }
  try {
    // Title: ascenders, a descender, round letters, an em dash and real space glyphs, 24 pt bold.
    const title = 'Manuale — operativo'; let x = 40;
    const widths = { M: 20, a: 13.3, n: 14.7, u: 14.7, l: 6.7, e: 13.3, ' ': 6.7, '—': 24, o: 14.7, p: 14.7, r: 9.3, t: 8, i: 6.7, v: 13.3 };
    for (const ch of title) { glyph(ch, x, 150, 'Helvetica-Bold', 24); x += widths[ch]; }
    // Monospace path, one glyph per object, no space glyphs anywhere.
    x = 40; for (const ch of 'docs/a.md') { glyph(ch, x, 100, 'Courier', 9); x += 5.4; }
    assert.ok(api.FPDFPage_GenerateContent(page));
    const groups = unified.groups(doc, page);
    assert.deepEqual(groups.map(g => g.contents).sort(), ['Manuale — operativo', 'docs/a.md']);
    assert.equal(groups.find(g => g.contents.startsWith('Manuale')).members.length, title.replace(/ /g, '').length, 'every letter object is a member; space glyphs carry no ink and are not');
  } finally { api.FPDF_ClosePage(page); api.FPDF_CloseDocument(doc); }
});
