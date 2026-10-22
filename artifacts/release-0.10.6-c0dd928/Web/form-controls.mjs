import { uploadedFormImage, formatPickedDate, formattedDateToIso } from './form-validation.mjs';

// Shared by the form preview and the normal document viewer.
export function appendFormControl(box, field, options) {
  const { value, scale = 1, rotation = 0, position = field.position, editable = true } = options;
  const input = document.createElement(['button', 'image'].includes(field.kind) ? 'button' : field.kind === 'dropdown' ? 'select' : field.kind === 'text' && field.multiline ? 'textarea' : 'input');
  input.dataset.field = field.id; input.setAttribute('aria-label', field.label || field.name); input.title = field.label || field.name;
  input.disabled = !!field.readOnly || !editable;
  input.setAttribute('aria-required', String(!!field.required));
  if (field.kind === 'button') {
    input.type = 'button'; input.textContent = field.caption; input.onclick = () => options.onEmail();
  } else if (field.kind === 'image') {
    input.type = 'button'; input.className = 'form-image-upload';
    if (value) { const image = document.createElement('img'); image.src = value; image.alt = field.label || field.name; input.append(image); }
    else input.textContent = 'Carica immagine…';
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/png,image/jpeg'; picker.hidden = true;
    picker.onchange = () => { const file = picker.files[0]; if (file) options.onUpload(() => uploadedFormImage(file)); };
    input.onclick = () => picker.click(); box.append(picker);
    if (value && !input.disabled) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'form-image-remove'; remove.textContent = '×'; remove.title = 'Rimuovi immagine'; remove.setAttribute('aria-label', 'Rimuovi immagine');
      remove.onclick = () => options.onUpload(async () => ''); box.append(remove);
    }
  } else if (field.kind === 'checkbox') { input.type = 'checkbox'; input.checked = value; }
  else if (field.kind === 'dropdown') { input.append(new Option('—', ''), ...field.options.map(v => new Option(v, v))); input.value = value; }
  else { input.value = value; input.maxLength = field.maxLength; if (field.kind === 'datetime') input.placeholder = field.format; }
  if (field.kind === 'datetime') {
    const picker = document.createElement('input'); picker.type = field.format.includes('HH') ? field.format.includes('aaaa') ? 'datetime-local' : 'time' : 'date';
    picker.className = 'form-date-picker'; picker.setAttribute('aria-label', `Seleziona ${field.label || field.name}`); picker.title = 'Seleziona data e ora'; picker.disabled = input.disabled;
    picker.value = formattedDateToIso(field.format, value);
    if (field.format.includes('ss')) picker.step = '1';
    picker.onchange = () => { if (picker.value) options.onDate(formatPickedDate(field.format, picker.value)); };
    input.style.paddingRight = '32px'; box.append(picker);
  }
  Object.assign(input.style, { fontFamily: { Helvetica: 'Arial', Times: 'Times New Roman', Courier: 'Courier New' }[field.font], fontSize: `${field.size * scale}px`, color: field.color });
  const angle = ((rotation * 90 - (field.rotation ?? 0)) % 360 + 360) % 360;
  if (angle && field.kind !== 'checkbox') Object.assign(input.style, { position: 'absolute', left: '50%', top: '50%',
    width: `${(angle % 180 ? position.height : position.width) * scale}px`, height: `${(angle % 180 ? position.width : position.height) * scale}px`, transform: `translate(-50%, -50%) rotate(${angle}deg)` });
  input.addEventListener('input', () => {
    const next = field.kind === 'checkbox' ? input.checked : input.value;
    if (options.onValue(next, input) === false) { if (field.kind === 'checkbox') input.checked = value; else input.value = value; }
  });
  input.addEventListener('change', () => options.onCommit());
  input.addEventListener('keydown', event => options.onKeyDown?.(event, input));
  box.append(input);
  return input;
}
