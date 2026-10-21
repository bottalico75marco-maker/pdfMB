import { PDFDocument, PDFName, PDFString, PDFHexString, StandardFonts, rgb } from './vendor/pdf-lib.js';

// Keep the canonical field tree in sync with page widgets. PDFium page import
// alone does not detach/rebuild that tree when managed pages are replaced.
export async function rewriteFormDocument(buffer, pages = null) {
  const doc = await PDFDocument.load(buffer, { updateMetadata: false });
  const form = doc.getForm();
  const key = PDFName.of('PDFMBForm');
  const managed = form.getFields().filter(f => f.acroField.getWidgets().some(w => w.dict.lookup(key)?.decodeText?.() === '1'));
  if (!managed.length && !pages?.some(p => p.length)) return buffer;
  if (form.hasXFA()) throw new Error('I moduli XFA non sono supportati.');
  for (const field of managed) {
    // pdf-lib 1.17.1 removeField() tries to detach the appearance reference.
    // Explicitly detach the actual widget refs before deleting the field tree.
    for (const widget of field.acroField.getWidgets()) {
      const ref = doc.context.getObjectRef(widget.dict);
      if (ref) for (const page of doc.getPages()) page.node.removeAnnot(ref);
    }
    form.removeField(field);
  }
  const names = new Set(form.getFields().map(f => f.getName())), ids = new Set();
  if ((pages?.flat().length ?? 0) > 1000) throw new Error('Limite di 1.000 campi per documento.');
  const fonts = new Map();
  for (let index = 0; index < (pages?.length ?? 0); index++) for (const f of pages[index]) {
    if (names.has(f.name) || ids.has(f.id)) throw new Error(`Nome o identificativo del campo ${f.name} già usato.`);
    names.add(f.name); ids.add(f.id);
    const field = f.kind === 'text' ? form.createTextField(f.name) : f.kind === 'dropdown' ? form.createDropdown(f.name) : form.createCheckBox(f.name);
    const [left, top, right, bottom] = f.rect;
    const color = rgb(...[1, 3, 5].map(i => parseInt(f.color.slice(i, i + 2), 16) / 255));
    if (!fonts.has(f.font)) fonts.set(f.font, await doc.embedFont({ Helvetica: StandardFonts.Helvetica, Times: StandardFonts.TimesRoman, Courier: StandardFonts.Courier }[f.font]));
    const font = fonts.get(f.font);
    if (f.kind === 'text') {
      field.setMaxLength(f.maxLength); if (f.multiline) field.enableMultiline(); field.setText(f.value);
    }
    if (f.kind === 'dropdown') {
      field.setOptions(f.options); field.disableEditing(); field.disableMultiselect();
      if (f.value) field.select(f.value);
    }
    field.addToPage(doc.getPage(index), { x: left, y: bottom, width: right - left, height: top - bottom,
      borderWidth: 1, borderColor: rgb(.43, .49, .57), textColor: color, font });
    const widget = field.acroField.getWidgets()[0];
    widget.setRectangle({ x: left, y: bottom, width: right - left, height: top - bottom });
    widget.getOrCreateAppearanceCharacteristics().setRotation(f.rotation ?? 0);
    if (f.kind !== 'checkbox') { field.setFontSize(f.size); field.updateAppearances(font); }
    else { f.value ? field.check() : field.uncheck(); field.updateAppearances(); }
    if (f.required) field.enableRequired(); if (f.readOnly) field.enableReadOnly();
    field.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(f.label || f.name));
    field.acroField.dict.set(PDFName.of('DV'), f.kind !== 'checkbox' ? PDFHexString.fromText(f.defaultValue) : PDFName.of(f.defaultValue ? 'Yes' : 'Off'));
    widget.dict.set(PDFName.of('NM'), PDFString.of(f.id));
    widget.dict.set(key, PDFString.of('1'));
    const { value, position, managed, ...data } = f;
    widget.dict.set(PDFName.of('PDFMBFormData'), PDFHexString.fromText(JSON.stringify(data)));
  }
  const bytes = await doc.save({ updateFieldAppearances: false });
  if (bytes.byteLength > 64 * 1024 * 1024) throw new Error('Il risultato supera 64 MB.');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
