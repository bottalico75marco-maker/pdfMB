export const stampPresets = [
  ['approved', 'APPROVATO', '#459b4b'], ['asis', 'COME È', '#d95643'], ['confidential', 'CONFIDENZIALE', '#d95643'],
  ['departmental', 'DIPARTIMENTALE', '#277ea4'], ['draft', 'BRUTTA COPIA', '#d95643'], ['experimental', 'ESPERIMENTO', '#277ea4'],
  ['expired', 'SCADUTO', '#d95643'], ['final', 'FINALE', '#d95643'], ['comment', 'PER COMMENTO', '#459b4b'],
  ['public', 'PER IL PUBBLICO RILASCIATO', '#459b4b'], ['rejected', 'NON APPROVATO', '#d95643'],
  ['private', 'NON PER RILASCIO PUBBLICO', '#d95643'], ['sold', 'VENDUTA', '#277ea4'], ['secret', 'SEGRETISSIMO', '#d95643'],
  ['date', 'Data', '#333333']
];
export function stampDimensions(width, height, page, requestedWidth = 180) {
  if (![width, height, page.width, page.height, requestedWidth].every(value => Number.isFinite(value) && value > 0)) throw new Error('Dimensioni del timbro non valide.');
  const w = Math.min(requestedWidth, page.width, page.height * width / height);
  return { width: w, height: w * height / width };
}
export function stampDate(value, format) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Scegliere una data.');
  const [year, month, day] = value.split('-').map(Number), date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('Data non valida.');
  if (format === 'long') return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  return [String(day).padStart(2, '0'), String(month).padStart(2, '0'), year].join(format === 'dash' ? '-' : '/');
}
export function presetImage(id, date, format) {
  const preset = stampPresets.find(item => item[0] === id);
  if (!preset) throw new Error('Timbro non disponibile.');
  const label = id === 'date' ? stampDate(date, format) : preset[1];
  const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 240;
  const ctx = canvas.getContext('2d'); ctx.strokeStyle = ctx.fillStyle = preset[2]; ctx.lineWidth = 22;
  ctx.beginPath(); ctx.roundRect(16, 16, 968, 208, 24); ctx.stroke();
  const words = label.length > 22 ? label.split(' ') : [label];
  const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : words;
  let font = lines.length > 1 ? 75 : 120;
  do { ctx.font = `bold ${font}px "Times New Roman", serif`; if (Math.max(...lines.map(line => ctx.measureText(line).width)) <= 910) break; font--; } while (font > 20);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, 500, 120 + (i - (lines.length - 1) / 2) * 86));
  return { label, canvas, image: { width: canvas.width, height: canvas.height, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer } };
}
export async function readStampPng(file) {
  if (!file || file.size > 8 * 1024 * 1024) throw new Error('Scegliere un PNG fino a 8 MB.');
  const buffer = await file.arrayBuffer(), bytes = new Uint8Array(buffer), signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((b, i) => bytes[i] === b) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('Scegliere un file PNG valido.');
  const view = new DataView(buffer), width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 8 * 1024 * 1024) throw new Error('Il PNG deve avere al massimo 4096 pixel per lato e 8 milioni di pixel.');
  const bitmap = await createImageBitmap(new Blob([buffer], { type: 'image/png' }));
  try {
    const scale = Math.min(1, 1200 / Math.max(width, height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { name: file.name.replace(/\.png$/i, '').slice(0, 80), base64: canvas.toDataURL('image/png').split(',')[1] };
  } finally { bitmap.close(); }
}
export async function personalImage(item) {
  const bytes = Uint8Array.from(atob(item.base64), char => char.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  try {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
    return { label: item.name, canvas, image: { width: canvas.width, height: canvas.height, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer } };
  } finally { bitmap.close(); }
}
