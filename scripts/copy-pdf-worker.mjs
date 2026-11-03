// Copy the exact pdf.js worker version into public assets during npm install.
// Serving it locally avoids cross-origin worker scripts and bundler quirks.
import {copyFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
mkdirSync(resolve(root,'public'),{recursive:true});
copyFileSync(resolve(root,'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),resolve(root,'public/pdf.worker.min.mjs'));
console.log('PDF.js worker disponibile in /public/pdf.worker.min.mjs');
