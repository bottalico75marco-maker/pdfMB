// Native AcroForms. Managed fields have document-wide unique names and one widget.
export function createFormTools(api, text) {
  const alloc = n => { const p = api.pdfium.wasmExports.malloc(n); if (!p) throw new Error('Memoria insufficiente.'); return p; };
  const free = p => api.pdfium.wasmExports.free(p);
  const check = (ok, message = 'Impossibile elaborare il modulo PDF.') => { if (!ok) throw new Error(message); };
  function read(fn) {
    const n = fn(0, 0); if (n < 2) return ''; check(n <= 40000, 'Valore del campo troppo lungo.');
    const p = alloc(n); try { check(fn(p, n)); return new TextDecoder('utf-16le').decode(api.pdfium.HEAPU8.slice(p, p + n - 2)); } finally { free(p); }
  }
  const string = (a, key) => read((p, n) => api.FPDFAnnot_GetStringValue(a, key, p, n));
  function environment(doc, page, fn) {
    const info = api.PDFiumExt_OpenFormFillInfo(); check(info); let form = 0;
    try {
      form = api.PDFiumExt_InitFormFillEnvironment(doc, info); check(form);
      api.FORM_OnAfterLoadPage(page, form);
      try { return fn(form); } finally { api.FORM_OnBeforeClosePage(page, form); }
    } finally { if (form) api.PDFiumExt_ExitFormFillEnvironment(form); api.PDFiumExt_CloseFormFillInfo(info); }
  }
  function list(doc, page, all = false) {
    if (!api.FPDF_GetFormType(doc)) return [];
    return environment(doc, page, form => {
      const fields = [], p = alloc(16);
      try {
        for (let i = 0; i < api.FPDFPage_GetAnnotCount(page); i++) {
          const a = api.FPDFPage_GetAnnot(page, i); check(a);
          try {
            if (api.FPDFAnnot_GetSubtype(a) !== 20) continue;
            const managed = string(a, 'PDFMBForm') === '1';
            const name = read((p, n) => api.FPDFAnnot_GetFormFieldName(form, a, p, n));
            if (!managed) { if (all) fields.push({ name, managed: false }); continue; }
            const data = JSON.parse(string(a, 'PDFMBFormData'));
            check(api.FPDFAnnot_GetRect(a, p));
            const rect = [...api.pdfium.HEAPF32.slice(p / 4, p / 4 + 4)];
            const type = api.FPDFAnnot_GetFormFieldType(form, a);
            check(type === 6 || type === 2 || type === 4, 'Tipo di campo PDF MB non supportato.');
            const value = type === 2 ? !!api.FPDFAnnot_IsChecked(form, a) : read((p, n) => api.FPDFAnnot_GetFormFieldValue(form, a, p, n));
            const flags = api.FPDFAnnot_GetFormFieldFlags(form, a);
            const options = type === 4 ? Array.from({ length: api.FPDFAnnot_GetOptionCount(form, a) }, (_, index) =>
              read((p, n) => api.FPDFAnnot_GetOptionLabel(form, a, index, p, n))) : undefined;
            fields.push({ ...data, ...(options ? { options } : {}), id: string(a, 'NM'), name, kind: type === 2 ? 'checkbox' : type === 4 ? 'dropdown' : 'text', value, rect,
              required: !!(flags & 2), readOnly: !!(flags & 1), multiline: !!(flags & 4096), position: text.screenRect(page, rect), managed: true });
          } finally { api.FPDFPage_CloseAnnot(a); }
        }
        return fields;
      } finally { free(p); }
    });
  }
  function validate(f) {
    check(f && /^pdfmb-f-[0-9a-f-]{36}$/.test(f.id), 'Identificativo campo non valido.');
    check(['text', 'checkbox', 'dropdown'].includes(f.kind), 'Tipo di campo non valido.');
    check(typeof f.name === 'string' && /^[A-Za-z_][A-Za-z0-9_-]{0,79}$/.test(f.name), 'Nome: usare lettere, numeri, _ e -, iniziando con una lettera.');
    check(typeof f.label === 'string' && f.label.length <= 160, 'Descrizione troppo lunga.');
    check(f.kind === 'checkbox' ? typeof f.value === 'boolean' && typeof f.defaultValue === 'boolean' :
      typeof f.value === 'string' && typeof f.defaultValue === 'string', 'Valore del campo non valido.');
    if (f.kind === 'text') {
      check(Number.isInteger(f.maxLength) && f.maxLength >= 1 && f.maxLength <= 10000, 'Lunghezza massima: da 1 a 10.000.');
      for (const value of [f.value, f.defaultValue]) {
        check(value.length <= f.maxLength, 'Il testo supera la lunghezza massima del campo.');
        check(!/[^\u0020-\u007e\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122\n]/u.test(value), 'Usare caratteri occidentali, accenti ed euro.');
        check(f.multiline || !value.includes('\n'), 'Attivare il campo multilinea per andare a capo.');
      }
    }
    if (f.kind === 'dropdown') {
      check(Array.isArray(f.options) && f.options.length >= 1 && f.options.length <= 200, 'Inserire da 1 a 200 opzioni.');
      check(f.options.every(v => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 160 &&
        !/[^\u0020-\u007e\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]/u.test(v)),
      'Ogni opzione deve contenere da 1 a 160 caratteri occidentali, su una riga.');
      check(new Set(f.options).size === f.options.length, 'Le opzioni devono essere univoche.');
      check([f.value, f.defaultValue].every(v => v === '' || f.options.includes(v)), 'Scegliere un valore presente nelle opzioni.');
    }
    check(Number.isFinite(f.size) && f.size >= 6 && f.size <= 72, 'Dimensione carattere: da 6 a 72 pt.');
    check(['Helvetica', 'Times', 'Courier'].includes(f.font), 'Font non valido.');
    check([0, 90, 180, 270].includes(f.rotation ?? 0), 'Rotazione campo non valida.');
    check(/^#[0-9a-f]{6}$/i.test(f.color), 'Colore non valido.');
    check(Array.isArray(f.rect) && f.rect.length === 4 && f.rect.every(Number.isFinite) && f.rect[2] > f.rect[0] && f.rect[1] > f.rect[3], 'Dimensioni del campo non valide.');
  }
  function prepare(page, input) {
    const p = input.position, g = text.geometry(page);
    check(p && [p.x, p.y, p.width, p.height].every(Number.isFinite) && p.x >= 0 && p.y >= 0 && p.width >= 12 && p.height >= 12 && p.x + p.width <= g.width + .1 && p.y + p.height <= g.height + .1,
      'Il campo deve stare nella pagina e misurare almeno 12 × 12 pt.');
    const a = text.point(page, p.x, p.y), b = text.point(page, p.x + p.width, p.y + p.height);
    const f = { ...input, rotation: input.rotation ?? g.rotation * 90,
      rect: [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[0], b[0]), Math.min(a[1], b[1])] };
    delete f.position; delete f.managed; validate(f); return f;
  }
  function documentFields(doc, all = false) {
    if (!api.FPDF_GetFormType(doc)) return Array.from({ length: api.FPDF_GetPageCount(doc) }, () => []);
    const result = [];
    for (let i = 0; i < api.FPDF_GetPageCount(doc); i++) {
      const p = api.FPDF_LoadPage(doc, i); check(p);
      try { result.push(list(doc, p, all)); } finally { api.FPDF_ClosePage(p); }
    }
    return result;
  }
  return { list, prepare, validate, documentFields };
}
