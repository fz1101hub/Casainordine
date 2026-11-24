import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { looksHeic, preparePhoto, HEIC_ACCEPT } from '../lib/image-prepare.js';
import { safeFileName } from '../lib/file-download.js';

test('foto HEIC riconosciute dal tipo o dall\'estensione', () => {
  assert.ok(looksHeic({ type: 'image/heic', name: 'IMG_1.HEIC' }));
  assert.ok(looksHeic({ type: 'image/heif', name: 'x' }));
  assert.ok(looksHeic({ type: '', name: 'IMG_2.heic' }));
  assert.ok(looksHeic({ type: 'application/octet-stream', name: 'IMG_3.HEIF' }));
  assert.ok(!looksHeic({ type: 'image/jpeg', name: 'foto.jpg' }));
  assert.ok(!looksHeic({ type: 'application/pdf', name: 'finto.heic' }));
  assert.ok(!looksHeic(null));
});

test('fuori dal browser la foto resta com\'è', async () => {
  const file = { type: 'image/heic', name: 'IMG.heic', size: 10 };
  assert.deepEqual(await preparePhoto(file), { file, converted: false, resized: false });
});

test('nome del file scaricato pulito', () => {
  assert.equal(safeFileName('Bolletta Enel novembre 2026.pdf'), 'Bolletta Enel novembre 2026.pdf');
  assert.equal(safeFileName('a/b\\c:d*e?.pdf'), 'a b c d e .pdf');
  assert.equal(safeFileName('  '), 'documento');
  assert.equal(safeFileName('x'.repeat(300)).length, 180);
});

test('ogni scelta di foto accetta anche le HEIC dell\'iPhone', () => {
  const missing = [];
  for (const file of readdirSync('app').filter(f => f.endsWith('.jsx'))) {
    const src = readFileSync(`app/${file}`, 'utf8');
    for (const [, accept] of src.matchAll(/type="file"[^>]*?accept="([^"]*)"/g))
      if (/jpe?g/.test(accept) && !accept.includes(HEIC_ACCEPT)) missing.push(`${file}: ${accept}`);
  }
  assert.deepEqual(missing, []);
});

test('le foto si preparano prima di controllarne il tipo', () => {
  for (const [file, before] of [['app/Projects.jsx', 'IMAGE_MIME_TYPES.includes(file.type)'], ['app/Rental.jsx', 'validDocument(file, IMAGE_MIME_TYPES)'],
    ['app/V21Hub.jsx', "['image/jpeg','image/png','image/webp'].includes(file.type)"], ['app/V20Hub.jsx', 'file.size>10485760']]) {
    const src = readFileSync(file, 'utf8');
    const prepared = src.indexOf('preparePhoto(picked');
    assert.ok(prepared > 0 && prepared < src.indexOf(before), `${file}: preparePhoto prima di «${before}»`);
  }
  const reader = readFileSync('lib/document-reader.js', 'utf8');
  assert.equal((reader.match(/file=\(await preparePhoto\(file,\{onProgress\}\)\)\.file;/g) || []).length, 2);
  assert.match(readFileSync('lib/document-upload.mjs', 'utf8'), /preparePhoto\(file\)/);
});
