// Copia nelle risorse pubbliche, durante npm install, i file che il browser carica a parte:
// - il worker di PDF.js (versione esatta, stessa origine dell'app);
// - worker, motore e dati delle lingue di Tesseract per l'OCR. Senza questi file Tesseract li
//   scarica da cdn.jsdelivr.net a ogni importazione: indirizzo IP e orario finiscono a terzi
//   e codice esterno gira con accesso alle bozze salvate sul dispositivo.
import {copyFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const copy=(from,to)=>{mkdirSync(dirname(resolve(root,to)),{recursive:true});copyFileSync(resolve(root,from),resolve(root,to));};

copy('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','public/pdf.worker.min.mjs');
copy('node_modules/tesseract.js/dist/worker.min.js','public/ocr/worker.min.js');
// OEM 1 (solo LSTM): Tesseract sceglie da solo la variante adatta al browser.
for(const core of ['tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js','tesseract-core-relaxedsimd-lstm.wasm.js'])
  copy(`node_modules/tesseract.js-core/${core}`,`public/ocr/core/${core}`);
for(const lang of ['ita','eng'])
  copy(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,`public/ocr/lang/${lang}.traineddata.gz`);
console.log('PDF.js e OCR disponibili in /public (pdf.worker.min.mjs, ocr/)');
