export const FORM_FORMATS = [
  'gg/mm/aaaa', 'gg-mm-aaaa', 'aaaa-mm-gg', 'mm/gg/aaaa',
  'HH:mm', 'HH:mm:ss', 'gg/mm/aaaa HH:mm', 'gg/mm/aaaa HH:mm:ss', 'aaaa-mm-gg HH:mm'
];

// Also embedded in the PDF validation action; keep this function self-contained.
export function fieldValueError(f, value, required) {
  if (required && f.kind !== 'button' && f.required && (value === '' || value === false)) return 'Compilare il campo obbligatorio.';
  if (f.kind === 'text' && f.pattern && value !== '') {
    try { var regexMatch = new RegExp('^(?:' + f.pattern + ')$').exec(value); if (!regexMatch || regexMatch[0] !== value) return f.validationMessage || 'Il valore non rispetta la regex del campo.'; }
    catch { return 'Espressione regolare non valida.'; }
  }
  if (f.kind === 'datetime' && value !== '') {
    var format = f.format, tokens = format.match(/aaaa|gg|mm|HH|ss/g);
    var expression = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/aaaa|gg|mm|HH|ss/g, function (token) { return token === 'aaaa' ? '(\\d{4})' : '(\\d{2})'; });
    var match = new RegExp('^' + expression + '$').exec(value);
    if (!match) return 'Usare il formato ' + format + '.';
    var day = 1, month = 1, year = 2000, hour = 0, minute = 0, second = 0, inTime = false;
    for (var i = 0; i < tokens.length; i++) {
      var n = Number(match[i + 1]), token = tokens[i];
      if (token === 'HH') { hour = n; inTime = true; }
      else if (token === 'mm' && inTime) minute = n;
      else if (token === 'mm') month = n;
      else if (token === 'gg') day = n;
      else if (token === 'aaaa') year = n;
      else second = n;
    }
    var days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return 'Data o ora non valida.';
  }
  return '';
}

export function formatPickedDate(format, iso) {
  const [date, time = '00:00:00'] = iso.includes('T') ? iso.split('T') : iso.includes(':') ? ['', iso] : [iso];
  const [year, month, day] = date.split('-'), [hour, minute, second = '00'] = time.split(':');
  let inTime = false;
  return format.replace(/aaaa|gg|mm|HH|ss/g, token => {
    if (token === 'HH') { inTime = true; return hour; }
    return token === 'aaaa' ? year : token === 'gg' ? day : token === 'mm' ? inTime ? minute : month : second;
  });
}

export function validateFieldRule(f) {
  if (f.kind === 'datetime' && !FORM_FORMATS.includes(f.format)) throw new Error('Formato data e ora non valido.');
  if (f.kind === 'text') {
    if (typeof (f.pattern ?? '') !== 'string' || (f.pattern?.length ?? 0) > 512) throw new Error('Regex: massimo 512 caratteri.');
    if (typeof (f.validationMessage ?? '') !== 'string' || (f.validationMessage?.length ?? 0) > 160) throw new Error('Messaggio di validazione: massimo 160 caratteri.');
    try { if (f.pattern) new RegExp('^(?:' + f.pattern + ')$'); } catch { throw new Error('Espressione regolare non valida.'); }
  }
  if (f.kind === 'button') {
    if (typeof f.caption !== 'string' || !f.caption.trim() || f.caption.length > 80) throw new Error('Etichetta pulsante: da 1 a 80 caratteri.');
    if (typeof f.email !== 'string' || f.email.length > 254 || (f.email && !/^[^\s@<>?,;:]+@[^\s@<>?,;:]+\.[^\s@<>?,;:]+$/.test(f.email))) throw new Error('Destinatario email non valido.');
  }
  if (f.kind === 'image') {
    for (const value of [f.value, f.defaultValue]) if (value && (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 1400000)) throw new Error('Immagine non valida o superiore a 1 MB.');
  }
  for (const value of [f.value, f.defaultValue]) {
    const error = fieldValueError(f, value);
    if (error) throw new Error(error);
  }
}

export async function uploadedFormImage(file) {
  if (!file || !['image/png', 'image/jpeg'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Scegliere un PNG o JPEG fino a 8 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Impossibile leggere l’immagine. Scegliere un PNG o JPEG valido.'); }
  try {
    if (bitmap.width * bitmap.height > 16000000) throw new Error('Immagine troppo grande: massimo 16 milioni di pixel.');
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const value = canvas.toDataURL(file.type, .85);
    if (value.length > 1400000) throw new Error('Immagine troppo dettagliata: ridurla sotto 1 MB.');
    return value;
  } finally { bitmap.close(); }
}
