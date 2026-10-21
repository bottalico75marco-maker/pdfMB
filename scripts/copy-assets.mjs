import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'src/PdfMB.Desktop/Web/vendor');
await mkdir(target, { recursive: true });
const snippet = path.join(root, 'node_modules/@embedpdf/snippet');
for (const name of await readdir(path.join(snippet, 'dist'))) {
  // Keep the hashed dynamic imports (including the inline Worker engine).
  if (name.endsWith('.js')) await copyFile(path.join(snippet, 'dist', name), path.join(target, name));
}
await copyFile(path.join(root, 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm'), path.join(target, 'pdfium.wasm'));
await copyFile(path.join(root, 'node_modules/@embedpdf/pdfium/dist/index.browser.js'), path.join(target, 'pdfium-api.js'));
await copyFile(path.join(root, 'node_modules/pdf-lib/dist/pdf-lib.esm.min.js'), path.join(target, 'pdf-lib.js'));
const notices = ['Third-party package inventory and the license/notice files distributed by their authors.'];
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
for (const [relative, pkg] of Object.entries(lock.packages)) {
  if (!relative || pkg.dev) continue;
  const folder = path.join(root, relative);
  notices.push(`\n--- ${relative} ${pkg.version} (${pkg.license ?? 'see package'}) ---`);
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isFile() && /^(LICEN[CS]E|NOTICE|COPYING)/i.test(entry.name))
      notices.push(`\n${entry.name}\n${await readFile(path.join(folder, entry.name), 'utf8')}`);
  }
}
await writeFile(path.join(target, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n'));
console.log('Viewer, Worker, WASM e licenze copiati in Web/vendor.');
