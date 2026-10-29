// Shared layout rules for the inline editor and the PDF worker.
export const standardFonts = ['Courier', 'Courier-Bold', 'Courier-BoldOblique', 'Courier-Oblique',
  'Helvetica', 'Helvetica-Bold', 'Helvetica-BoldOblique', 'Helvetica-Oblique',
  'Times-Roman', 'Times-Bold', 'Times-BoldItalic', 'Times-Italic'];

export const LAYOUT_PADDING = 2;
const paragraphs = text => text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
// Round outward to PDFium's 1/16-point coordinate precision. Reopening an
// already fitted box must never introduce an extra wrap from rounding down.
const sixteenths = value => Math.ceil(value * 16) / 16;
// The height is exactly the flowed lines: 1.2 already leaves room below the
// last baseline, so padding it again made every block taller than its line
// pitch and made the boxes of consecutive lines overlap.
const boxSize = (lines, size, measure) => ({
  width: sixteenths(Math.max(12, ...lines.map(line => measure(line) + LAYOUT_PADDING * 2))),
  height: sixteenths(Math.max(12, lines.length * size * 1.2)), padding: LAYOUT_PADDING });

// The text's own line breaks and width, with nothing wrapped. Measuring each
// line once keeps reading a page cheap, which laying the text out at an
// unbounded width would not: that re-measures a growing prefix per character.
export function naturalLayout(text, size, measure) {
  const lines = paragraphs(text);
  return { lines, ...boxSize(lines, size, measure) };
}

export function textLayout(text, maxWidth, size, measure) {
  const padding = LAYOUT_PADDING, available = Math.max(1, maxWidth - padding * 2), lines = [];
  for (const paragraph of paragraphs(text)) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      if (!word) continue;
      if (line && measure(line + word) > available + .1) { lines.push(line.trimEnd()); line = ''; }
      for (const character of word) {
        if (!line && /\s/.test(character)) continue;
        if (line && measure(line + character) > available + .1) { lines.push(line); line = ''; }
        line += character;
      }
    }
    lines.push(line.trimEnd());
  }
  return { lines, ...boxSize(lines, size, measure) };
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

function readingOrder(items) {
  const rows = [];
  for (const item of [...items].sort((a, b) => bottom(a.rawPosition) - bottom(b.rawPosition))) {
    const row = rows.at(-1);
    // A descender drops the box below the baseline by about a fifth of the
    // size, the same slack the line merge below already allows.
    if (row && Math.abs(row.baseline - bottom(item.rawPosition)) <= item.size * .22) row.items.push(item);
    else rows.push({ baseline: bottom(item.rawPosition), items: [item] });
  }
  return rows.flatMap(row => row.items.sort((a, b) => a.rawPosition.x - b.rawPosition.x));
}

export function groupNearbyText(items) {
  const lines = [];
  const compatible = (a, b) => a.source === b.source && a.fontKey === b.fontKey && a.color === b.color && Math.abs(a.size - b.size) < .25;
  const union = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.max(right(a), right(b)) - Math.min(a.x, b.x), height: Math.max(bottom(a), bottom(b)) - Math.min(a.y, b.y) });
  for (const item of readingOrder(items)) {
    const p = item.rawPosition;
    const line = lines.find(line => compatible(line, item) && line.contents.length + item.contents.length < 10000 &&
      Math.abs(bottom(line.rawPosition) - bottom(p)) <= item.size * .22 &&
      p.x >= right(line.rawPosition) - 1 && p.x - right(line.rawPosition) <= item.size * .7 && !line.contents.includes('\n') && !item.contents.includes('\n'));
    if (line) {
      const space = p.x - right(line.rawPosition) + slack(item) > item.size * SPACE && !/\s$/.test(line.contents) && !/^\s/.test(item.contents) ? ' ' : '';
      line.contents += space + item.contents; line.members.push(...item.members); line.rawPosition = union(line.rawPosition, p);
    } else lines.push({ ...item, members: [...item.members], rawPosition: { ...p } });
  }
  const groups = [];
  for (const line of lines.sort((a, b) => a.rawPosition.y - b.rawPosition.y || a.rawPosition.x - b.rawPosition.x)) {
    const p = line.rawPosition;
    const group = groups.find(group => compatible(group, line) && group.contents.length + line.contents.length < 10000 &&
      Math.abs(group.rawPosition.x - p.x) <= line.size * .4 && p.y >= bottom(group.rawPosition) - 1 &&
      p.y - bottom(group.rawPosition) <= line.size * .7 &&
      Math.min(right(group.rawPosition), right(p)) - Math.max(group.rawPosition.x, p.x) >= Math.min(group.rawPosition.width, p.width) * .6);
    if (group) { group.contents += '\n' + line.contents; group.members.push(...line.members); group.rawPosition = union(group.rawPosition, p); }
    else groups.push(line);
  }
  return groups;
}
