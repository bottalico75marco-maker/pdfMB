import { PDFDocument, PDFName, PDFString, PDFHexString, StandardFonts, rgb } from './vendor/pdf-lib.js';
import { fieldValueError, isNowDefault } from './form-validation.mjs';

export const FORM_EMAIL_ACTION_VERSION = 2;

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
    const button = ['button', 'image'].includes(f.kind);
    const field = ['text', 'datetime'].includes(f.kind) ? form.createTextField(f.name) : f.kind === 'dropdown' ? form.createDropdown(f.name) : button ? form.createButton(f.name) : form.createCheckBox(f.name);
    const [left, top, right, bottom] = f.rect;
    const color = rgb(...[1, 3, 5].map(i => parseInt(f.color.slice(i, i + 2), 16) / 255));
    if (!fonts.has(f.font)) fonts.set(f.font, await doc.embedFont({ Helvetica: StandardFonts.Helvetica, Times: StandardFonts.TimesRoman, Courier: StandardFonts.Courier }[f.font]));
    const font = fonts.get(f.font);
    if (['text', 'datetime'].includes(f.kind)) {
      field.setMaxLength(f.maxLength); if (f.multiline) field.enableMultiline(); field.setText(f.value);
    }
    if (f.kind === 'dropdown') {
      field.setOptions(f.options); field.disableEditing(); field.disableMultiselect();
      if (f.value) field.select(f.value);
    }
    const appearance = { x: left, y: bottom, width: right - left, height: top - bottom,
      borderWidth: 1, borderColor: rgb(.43, .49, .57), textColor: color, font, fontSize: f.size };
    if (button) field.addToPage(f.kind === 'button' ? f.caption : 'Carica immagine', doc.getPage(index), appearance);
    else field.addToPage(doc.getPage(index), appearance);
    const widget = field.acroField.getWidgets()[0];
    widget.setRectangle({ x: left, y: bottom, width: right - left, height: top - bottom });
    widget.getOrCreateAppearanceCharacteristics().setRotation(f.rotation ?? 0);
    if (f.kind !== 'checkbox') {
      field.setFontSize(f.size); field.updateAppearances(font);
      if (f.kind === 'image' && f.value) {
        const image = f.value.startsWith('data:image/png;') ? await doc.embedPng(f.value) : await doc.embedJpg(f.value);
        field.setImage(image);
      }
    }
    else { f.value ? field.check() : field.uncheck(); field.updateAppearances(); }
    if (f.required) field.enableRequired(); if (f.readOnly) field.enableReadOnly();
    field.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(f.label || f.name));
    const defaultValue = f.kind === 'datetime' && isNowDefault(f.defaultValue) ? f.resolvedDefaultValue ?? f.value : f.defaultValue;
    field.acroField.dict.set(PDFName.of('DV'), f.kind !== 'checkbox' ? PDFHexString.fromText(defaultValue) : PDFName.of(f.defaultValue ? 'Yes' : 'Off'));
    if ((f.kind === 'text' && f.pattern) || f.kind === 'datetime') {
      const rule = { kind: f.kind, pattern: f.pattern, validationMessage: f.validationMessage, format: f.format };
      field.acroField.dict.set(PDFName.of('AA'), doc.context.obj({ V: { S: 'JavaScript', JS: PDFHexString.fromText(
        'var message = (' + fieldValueError.toString() + ')(' + JSON.stringify(rule) + ', event.value); if (message) { app.alert(message); event.rc = false; }') } }));
    }
    if (f.kind === 'button') {
      // A URL file specification uses ASCII bytes, not a Unicode text string.
      // The UTF-16 BOM in PDFHexString.fromText() was interpreted as part of a
      // relative file path by Acrobat, producing a file:///... security prompt.
      const url = 'mailto:' + encodeURIComponent(f.email || '').replace(/%40/g, '@');
      widget.dict.set(PDFName.of('A'), doc.context.obj({ S: 'SubmitForm',
        F: { Type: 'Filespec', FS: 'URL', F: PDFString.of(url) }, Flags: 256 }));
    }
    if (f.kind === 'image') widget.dict.set(PDFName.of('A'), doc.context.obj({ S: 'JavaScript', JS: PDFHexString.fromText('event.target.buttonImportIcon();') }));
    widget.dict.set(PDFName.of('NM'), PDFString.of(f.id));
    widget.dict.set(key, PDFString.of('1'));
    const { value, position, managed, ...data } = f;
    if (f.kind === 'button') data.emailActionVersion = FORM_EMAIL_ACTION_VERSION;
    if (f.kind === 'image') data.imageValue = f.value;
    widget.dict.set(PDFName.of('PDFMBFormData'), PDFHexString.fromText(JSON.stringify(data)));
  }
  const bytes = await doc.save({ updateFieldAppearances: false });
  if (bytes.byteLength > 64 * 1024 * 1024) throw new Error('Il risultato supera 64 MB.');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
