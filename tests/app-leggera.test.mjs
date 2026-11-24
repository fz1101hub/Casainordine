import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as realtime from '../lib/browser-stubs/realtime.mjs';
import * as functions from '../lib/browser-stubs/functions.mjs';
import * as iceberg from '../lib/browser-stubs/iceberg.mjs';

const root = new URL('../', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const importedNames = (source, pkg) => [...source.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${pkg.replace('/', '\\/')}["']`, 'g'))]
  .flatMap(m => m[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean));

test('i sostituti esportano tutto ciò che supabase-js e storage-js importano', () => {
  const supabase = read('node_modules/@supabase/supabase-js/dist/index.mjs');
  const storage = read('node_modules/@supabase/storage-js/dist/index.mjs');
  const need = { realtime: importedNames(supabase, '@supabase/realtime-js'), functions: importedNames(supabase, '@supabase/functions-js'), iceberg: importedNames(storage, 'iceberg-js') };
  assert.ok(need.realtime.includes('RealtimeClient') && need.functions.includes('FunctionsClient') && need.iceberg.includes('IcebergRestCatalog'));
  for (const name of need.realtime) assert.ok(name in realtime, `realtime: ${name}`);
  for (const name of need.functions) assert.ok(name in functions, `functions: ${name}`);
  for (const name of need.iceberg) assert.ok(name in iceberg, `iceberg: ${name}`);
  // Metodi del client realtime che supabase-js chiama da solo (creazione e cambio di token).
  const used = [...new Set([...supabase.matchAll(/this\.realtime\.([a-zA-Z]+)/g)].map(m => m[1]))];
  for (const method of used) assert.equal(typeof realtime.RealtimeClient.prototype[method], 'function', `RealtimeClient.${method}`);
});

test('i sostituti si comportano senza rompere l’accesso', async () => {
  const client = new realtime.RealtimeClient('wss://x/realtime/v1', { params: { apikey: 'k' } });
  await client.setAuth('token'); await client.setAuth();
  assert.deepEqual(client.getChannels(), []);
  assert.throws(() => client.channel('x'), /Realtime non è attivo/);
  const fn = new functions.FunctionsClient('https://x/functions/v1');
  assert.match((await fn.invoke('f')).error.message, /Edge Functions non attive/);
  assert.ok(new functions.FunctionsHttpError('x') instanceof functions.FunctionsError);
  assert.throws(() => new iceberg.IcebergRestCatalog({}), /analytics/);
});

test('next.config: i sostituti valgono solo per il browser', async () => {
  const config = (await import('../next.config.mjs')).default;
  const alias = config.turbopack?.resolveAlias || {};
  assert.deepEqual(Object.keys(alias).sort(), ['@supabase/functions-js', '@supabase/realtime-js', 'iceberg-js']);
  for (const [pkg, target] of Object.entries(alias)) {
    assert.deepEqual(Object.keys(target), ['browser'], `${pkg}: solo browser, il server usa la libreria vera`);
    assert.ok(statSync(join(root, target.browser)).isFile(), target.browser);
  }
});

test('l’app non usa Realtime, Edge Functions né bucket analytics', () => {
  const files = [];
  (function walk(dir) { for (const f of readdirSync(join(root, dir))) { const p = join(dir, f); if (statSync(join(root, p)).isDirectory()) { if (!/i18n-dicts|browser-stubs/.test(p)) walk(p); } else if (/\.(jsx?|mjs)$/.test(f)) files.push(p); } })('app');
  (function walk(dir) { for (const f of readdirSync(join(root, dir))) { const p = join(dir, f); if (statSync(join(root, p)).isDirectory()) { if (!/i18n-dicts|browser-stubs/.test(p)) walk(p); } else if (/\.(jsx?|mjs)$/.test(f)) files.push(p); } })('lib');
  const found = files.filter(f => /\.channel\(|removeChannel|removeAllChannels|\.functions\.invoke|storage\.analytics|\.realtime\b/.test(read(f)));
  assert.deepEqual(found, []);
});

test('la Home non scarica all’avvio CSV, piani rate, lettura documenti e controlli antifrode', () => {
  const page = read('app/page.jsx');
  for (const mod of ['csv', 'bank-csv', 'rate-plan', 'document-import', 'v20-core']) {
    assert.doesNotMatch(page, new RegExp(`^import [^;]*from '\\.\\./lib/${mod}\\.mjs';`, 'm'), `${mod} importato all'avvio`);
    // import() dinamico, da solo o dentro Promise.all (CSV ed estratti conto insieme).
    assert.match(page, new RegExp(`(?:await |Promise\\.all\\(\\[[^\\]]*)import\\('\\.\\./lib/${mod}\\.mjs'\\)`), `${mod} caricato quando serve`);
  }
  assert.match(page, /import \{ billTitle \} from '\.\.\/lib\/bill-title\.mjs';/);
  assert.match(read('lib/document-import.mjs'), /export \{ billTitle \} from '\.\/bill-title\.mjs';/);
});
