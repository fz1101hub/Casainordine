import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('OCR: worker, motore e lingue serviti dall’app, nessun CDN',()=>{
  const reader=source('lib/document-reader.js');
  assert.match(reader,/workerPath:'\/ocr\/worker\.min\.js',corePath:'\/ocr\/core',langPath:'\/ocr\/lang',workerBlobURL:false/);
  const script=source('scripts/copy-pdf-worker.mjs');
  for(const file of ['public/ocr/worker.min.js','public/ocr/core/${core}','public/ocr/lang/${lang}.traineddata.gz'])assert.ok(script.includes(file),file);
  const pkg=JSON.parse(source('package.json'));
  assert.equal(pkg.dependencies['@tesseract.js-data/ita'],'1.0.0');
  assert.equal(pkg.dependencies['@tesseract.js-data/eng'],'1.0.0');
  if(existsSync(new URL('../node_modules/@tesseract.js-data/ita/4.0.0_best_int/ita.traineddata.gz',import.meta.url)))
    assert.ok(existsSync(new URL('../public/ocr/lang/ita.traineddata.gz',import.meta.url)),'postinstall ha copiato i dati');
});
test('Caratteri: ospitati dall’app, niente Google Fonts',()=>{
  assert.doesNotMatch(source('app/globals.css'),/fonts\.googleapis\.com|@import url\(/);
  const layout=source('app/layout.jsx');
  for(const font of ['dm-sans','plus-jakarta-sans'])for(const w of [400,500,600,700,800])assert.ok(layout.includes(`import '@fontsource/${font}/${w}.css';`),`${font} ${w}`);
  assert.ok(layout.indexOf('@fontsource')<layout.indexOf("import './globals.css'"));
});
