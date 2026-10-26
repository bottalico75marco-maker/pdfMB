const sizes = { A4: [210, 297], A5: [148, 210], A3: [297, 420] };
export function paperSize({ format = 'A4', landscape = false } = {}) {
  if (!Object.hasOwn(sizes, format) || typeof landscape !== 'boolean') throw new Error('Scegliere il formato A4, A5 o A3 e un orientamento valido.');
  const [widthMm, heightMm] = landscape ? [...sizes[format]].reverse() : sizes[format];
  return { width: widthMm * 72 / 25.4, height: heightMm * 72 / 25.4 };
}
