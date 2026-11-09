// Shared layout rules for the inline editor and the PDF worker.
export const standardFonts = ['Courier', 'Courier-Bold', 'Courier-BoldOblique', 'Courier-Oblique',
  'Helvetica', 'Helvetica-Bold', 'Helvetica-BoldOblique', 'Helvetica-Oblique',
  'Times-Roman', 'Times-Bold', 'Times-BoldItalic', 'Times-Italic'];

export const LAYOUT_PADDING = 2;
// The standard fonts cover Western text, accents and the euro sign. Everything
// else (arrows, Greek, emoji…) cannot be written back and is listed to the user.
export const unsupportedCharacters = text => [...new Set(text.match(/[^\u0020-\u007e\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122\n\r\t]/gu) ?? [])];
const paragraphs = text => text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
// Round strictly outward to PDFium's 1/16-point coordinate precision. A
// rectangle exactly as wide as its text still wraps the last word in PDFium
// (Courier lines are whole multiples of the glyph width, so they hit this),
// and reopening an already fitted box must never introduce an extra wrap.
// Glyph advances are float32 sums: a thousandth absorbs their noise.
const sixteenths = value => Math.floor((value + .001) * 16) / 16 + 1 / 16;
// The height is exactly the flowed lines: 1.2 already leaves room below the
// last baseline, so padding it again made every block taller than its line
// pitch and made the boxes of consecutive lines overlap.
const boxSize = (lines, size, measure, padding = LAYOUT_PADDING) => ({
  width: sixteenths(Math.max(12, ...lines.map(line => measure(line) + padding * 2))),
  height: sixteenths(Math.max(12, lines.length * size * 1.2)), padding });

// The text's own line breaks and width, with nothing wrapped. Measuring each
// line once keeps reading a page cheap, which laying the text out at an
// unbounded width would not: that re-measures a growing prefix per character.
export function naturalLayout(text, size, measure) {
  const lines = paragraphs(text);
  return { lines, ...boxSize(lines, size, measure) };
}

// PDFium flows the saved appearance again inside the annotation rectangle,
// character by character: when a character no longer fits it breaks after the
// last space of the line, and before the character itself when the line holds
// no space. Spaces count toward the width and may start a line. Mirroring that
// here keeps the box exactly as tall as the text the PDF will show; wrapping
// earlier or later than PDFium left the last line clipped, or an empty line.
// Lines come back with the spaces they end with, which take room in the box.
function flowLines(text, available, measure) {
  const lines = [], blank = /\s/;
  for (const paragraph of paragraphs(text)) {
    let line = '', breakAt = 0;
    for (const character of paragraph) {
      if (line && measure(line + character) > available + .1) {
        if (breakAt > 0) { lines.push(line.slice(0, breakAt)); line = line.slice(breakAt); }
        else { lines.push(line); line = ''; }
        breakAt = 0;
        // The carried remainder holds no space: it only fits whole, or breaks before this character.
        if (line && measure(line + character) > available + .1) { lines.push(line); line = ''; }
      }
      line += character;
      if (blank.test(character)) breakAt = line.length;
    }
    lines.push(line);
  }
  return lines;
}

// A FreeText annotation is flowed by PDFium across its whole rectangle, with no
// inset, so it takes no padding: its box is exactly the longest line, and the
// text PDFium draws starts where the editor showed it. Native text is placed
// by this editor itself, one padding inside the box on each side.
export function textLayout(text, maxWidth, size, measure, padding = LAYOUT_PADDING) {
  let lines = flowLines(text, Math.max(1, maxWidth - padding * 2), measure), box = boxSize(lines, size, measure, padding);
  // The lines reproduce themselves inside the box they sized, which is the
  // width PDFium flows them in; the loop only absorbs the 1/16 pt rounding.
  for (let pass = 0; pass < 8; pass++) {
    const settled = flowLines(text, Math.max(1, box.width - padding * 2), measure);
    if (settled.length === lines.length && settled.every((line, index) => line === lines[index])) break;
    lines = settled; box = boxSize(lines, size, measure, padding);
  }
  return { lines: lines.map(line => line.trimEnd()), ...box };
}

// A gap this wide, as a fraction of the size, is a space the fragments left
// for the grouping to put back. Measured across a real document, gaps inside a
// word reach .19 of the size — narrow glyphs such as I, l, f and the full stop
// carry wide side bearings — while gaps across a space start at .29. The old
// .12 sat inside the first range, so words came back as "I nferm iere".
const SPACE = .25;
const right = p => p.x + p.width, bottom = p => p.y + p.height;
// Fragments of one line have to be visited left to right, because a line grows
// by appending whatever sits to the right of it. Ordering them by the top of
// their bounding box does not do that: round capitals overshoot the cap height,
// and ascenders stand a tenth of the size above x-height letters. A fragment
// then arrived from the left of what had been collected, was refused, and
// started a block of its own, which is how single words broke into several.
// Grouping by baseline first and ordering each line by x keeps them together.
// A managed box spans its glyphs plus one padding on each side, so the gap
// between two of them falls short of the distance between their glyphs by that
// much. Native text is measured on the glyphs themselves and needs no slack.
const slack = item => item.source === 'annotation' ? LAYOUT_PADDING * 2 : 0;
// Native text carries its true baseline (the text matrix origin). The ink box
// does not: a dash floats five points above it, a descender hangs five below,
// round letters overshoot, so glyph-by-glyph PDFs (Word, Chromium) fell apart
// into one block per letter shape. Managed boxes end at their text's bottom.
const baseline = item => item.baseline ?? bottom(item.rawPosition);
// Glyph boxes of kerned pairs overlap by a fraction of the size, never by a word.
const OVERLAP = .15;

function readingOrder(items) {
  const rows = [];
  for (const item of [...items].sort((a, b) => baseline(a) - baseline(b))) {
    const row = rows.at(-1);
    if (row && Math.abs(row.baseline - baseline(item)) <= item.size * .22) row.items.push(item);
    else rows.push({ baseline: baseline(item), items: [item] });
  }
  return rows.flatMap(row => row.items.sort((a, b) => a.rawPosition.x - b.rawPosition.x));
}

// spaceBetween(line, item) may answer true/false from the text layer, or null when unknown.
export function groupNearbyText(items, { spaceBetween } = {}) {
  const lines = [];
  // Native text of one paragraph joins across bold lead-ins, code spans and
  // colours: a block is edited as a whole, in the style most of its text has.
  // Only the size must agree closely enough to belong to the same run of text.
  // Managed boxes keep one style each and merge only with identical ones.
  const compatible = (a, b) => a.source === b.source && (a.source === 'content'
    ? Math.abs(a.size - b.size) <= Math.max(.25, .2 * Math.max(a.size, b.size))
    : a.fontKey === b.fontKey && a.color === b.color && Math.abs(a.size - b.size) < .25);
  const styleKey = item => `${item.font}|${item.fontKey}|${item.size}|${item.color}`;
  const tally = (target, item) => { const key = styleKey(item); const entry = target.styles.get(key) ?? { weight: 0, font: item.font, fontKey: item.fontKey, size: item.size, color: item.color }; entry.weight += Math.max(1, item.contents.trim().length); target.styles.set(key, entry); };
  const union = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.max(right(a), right(b)) - Math.min(a.x, b.x), height: Math.max(bottom(a), bottom(b)) - Math.min(a.y, b.y) });
  for (const item of readingOrder(items)) {
    const p = item.rawPosition;
    const line = lines.find(line => compatible(line, item) && line.contents.length + item.contents.length < 10000 &&
      Math.abs(baseline(line) - baseline(item)) <= item.size * .22 &&
      // An inline code span or a wide justified space keeps a line together:
      // the gap may reach the size itself. Column gutters are wider than that.
      p.x >= right(line.rawPosition) - item.size * OVERLAP && p.x - right(line.rawPosition) <= Math.max(line.size, item.size) * 1.05 && !line.contents.includes('\n') && !item.contents.includes('\n'));
    if (line) {
      // Native text asks the page's text layer whether a space separates the
      // two fragments; the ink gap alone read every narrow monospace glyph as
      // a word break ("funziona. md") while missing none of the real ones.
      const known = spaceBetween?.(line, item);
      const gap = p.x - right(line.rawPosition) + slack(item);
      const separated = known ?? gap > item.size * SPACE;
      const space = separated && !/\s$/.test(line.contents) && !/^\s/.test(item.contents) ? ' ' : '';
      line.contents += space + item.contents; line.members.push(...item.members); line.rawPosition = union(line.rawPosition, p); tally(line, item);
    } else { const line = { ...item, baseline: baseline(item), members: [...item.members], rawPosition: { ...p }, styles: new Map() }; tally(line, item); lines.push(line); }
  }
  const groups = [];
  for (const line of lines.sort((a, b) => a.rawPosition.y - b.rawPosition.y || a.rawPosition.x - b.rawPosition.x)) {
    const p = line.rawPosition;
    // A fragment left on the same line as the group's last one (a lead-in in
    // another weight followed by a code span, for instance) continues that
    // line, so the paragraph does not split into two interleaved blocks.
    const tail = groups.find(group => compatible(group, line) && group.contents.length + line.contents.length < 10000 &&
      Math.abs(group.lastBaseline - baseline(line)) <= line.size * .22 && p.x >= group.lastRight - line.size * OVERLAP && p.x - group.lastRight <= line.size * 1.5);
    if (tail) {
      const known = spaceBetween?.(tail.lastLine, line);
      const separated = known ?? p.x - tail.lastRight > line.size * SPACE;
      tail.contents += (separated && !/\s$/.test(tail.contents) && !/^\s/.test(line.contents) ? ' ' : '') + line.contents;
      tail.members.push(...line.members); tail.rawPosition = union(tail.rawPosition, p); tail.lastRight = right(p);
      tail.lastLine = { ...tail.lastLine, rawPosition: union(tail.lastLine.rawPosition, p) };
      for (const entry of line.styles.values()) { const own = tail.styles.get(styleKey(entry)); if (own) own.weight += entry.weight; else tail.styles.set(styleKey(entry), { ...entry }); }
      continue;
    }
    const group = groups.find(group => compatible(group, line) && group.contents.length + line.contents.length < 10000 &&
      // A native paragraph's first line may start after a lead-in and its last
      // line end early: lines stack when they overlap, not only when flush left.
      (group.source === 'content' || Math.abs(group.rawPosition.x - p.x) <= line.size * .4) && p.y >= bottom(group.rawPosition) - 1 &&
      p.y - bottom(group.rawPosition) <= line.size * .7 &&
      Math.min(right(group.rawPosition), right(p)) - Math.max(group.rawPosition.x, p.x) >= Math.min(group.rawPosition.width, p.width) * .6);
    if (group) {
      group.contents += '\n' + line.contents; group.members.push(...line.members); group.rawPosition = union(group.rawPosition, p);
      group.lastBaseline = baseline(line); group.lastRight = right(p); group.lastLine = line;
      for (const entry of line.styles.values()) { const own = group.styles.get(styleKey(entry)); if (own) own.weight += entry.weight; else group.styles.set(styleKey(entry), { ...entry }); }
    } else groups.push(Object.assign(line, { lastBaseline: baseline(line), lastRight: right(p), lastLine: line }));
  }
  // The block takes the style most of its text has; `mixed` tells the editor to say so.
  return groups.map(({ styles, lastBaseline, lastRight, lastLine, ...group }) => {
    const dominant = [...styles.values()].sort((a, b) => b.weight - a.weight)[0];
    return { ...group, font: dominant.font, fontKey: dominant.fontKey, size: dominant.size, color: dominant.color, mixed: styles.size > 1 };
  });
}
