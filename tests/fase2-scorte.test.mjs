// Fase 2 · 3.3 — scorte domestiche: quantità, soglie, − e +, proposta per la lista della spesa senza aggiunte silenziose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STOCK_UNITS, STOCK_LIMITS, normalizeStockItem, stockStatus, stepFor, adjustQuantity, shoppingProposal, sortStock, titleKey } from '../lib/stock.mjs';
import { MESSAGE_KEYS } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Controllo della scorta: nome, unità nota, quantità e soglie nei limiti', () => {
  assert.deepEqual(normalizeStockItem({ name: ' Caffè  macinato ', unit: 'pack', quantity: '2', threshold: '1', usual_buy: '3', location: ' Dispensa ' }).value,
    { name: 'Caffè macinato', unit: 'pack', quantity: 2, threshold: 1, usual_buy: 3, location: 'Dispensa' });
  assert.equal(normalizeStockItem({ name: 'Riso', unit: 'quintali', quantity: '1,5' }).value.unit, 'pcs');
  assert.equal(normalizeStockItem({ name: 'Riso', unit: 'kg', quantity: '1,5' }).value.quantity, 1.5);
  for (const [input, error] of [
    [{ name: 'R' }, 'stock.error.name'],
    [{ name: 'Riso', quantity: -1 }, 'stock.error.quantity'],
    [{ name: 'Riso', quantity: '' }, 'stock.error.quantity'],
    [{ name: 'Riso', quantity: 1, threshold: 100001 }, 'stock.error.threshold'],
    [{ name: 'Riso', quantity: 1, threshold: 0, usual_buy: 0 }, 'stock.error.buy'],
  ]) assert.equal(normalizeStockItem(input).error, error, JSON.stringify(input));
});

test('Stato, passo di − e + e quantità mai sotto zero', () => {
  assert.equal(stockStatus({ quantity: 0, threshold: 1 }), 'out');
  assert.equal(stockStatus({ quantity: 1, threshold: 1 }), 'low');
  assert.equal(stockStatus({ quantity: 2, threshold: 1 }), 'ok');
  assert.deepEqual(['pcs', 'pack', 'roll', 'kg', 'l', 'g', 'ml'].map(stepFor), [1, 1, 1, 0.5, 0.5, 100, 100]);
  assert.equal(adjustQuantity(0.5, -1), 0);
  assert.equal(adjustQuantity(1.1, 0.2), 1.3);
  assert.equal(adjustQuantity(STOCK_LIMITS.maxQuantity, 1), STOCK_LIMITS.maxQuantity);
});

test('Proposta per la spesa: prima le finite, segnate quelle già in lista', () => {
  const items = [
    { id: 'a', name: 'Carta igienica', quantity: 3, threshold: 4 },
    { id: 'b', name: 'Caffè', quantity: 0, threshold: 1 },
    { id: 'c', name: 'Olio', quantity: 2, threshold: 1 },
    { id: 'd', name: 'Detersivo', quantity: 1, threshold: 1 },
  ];
  const proposal = shoppingProposal(items, ['  CARTA  igienica ', 'Pane']);
  assert.deepEqual(proposal.map(p => [p.item.id, p.status, p.inList]), [['b', 'out', false], ['a', 'low', true], ['d', 'low', false]]);
  assert.deepEqual(sortStock(items).map(i => i.id), ['b', 'a', 'd', 'c']);
  assert.equal(titleKey('Caffè  Macinato'), titleKey('caffe macinato'));
});

test('Niente aggiunte silenziose: in lista va solo quello che si sceglie', () => {
  const ui = read('app/Stock.jsx');
  // L'unico inserimento nella lista della spesa è dentro addToShopping, chiamata solo dai pulsanti.
  assert.equal(ui.match(/from\('home_shopping'\)\.insert/g).length, 1);
  assert.match(ui, /async function addToShopping\(entries\)/);
  assert.deepEqual([...ui.matchAll(/addToShopping\(/g)].length, 3, 'definizione e due pulsanti');
  assert.match(ui, /onClick=\{\(\) => addToShopping\(\[\{ item \}\]\)\}/);
  assert.match(ui, /onClick=\{\(\) => addToShopping\(toBuy\)\}/);
  assert.match(ui, /!shopping\.some\(title => titleKey\(title\) === titleKey\(entry\.item\.name\)\)/, 'un prodotto già in lista non si duplica');
  // − e + passano dalla funzione atomica del database.
  assert.match(ui, /client\.rpc\('v46_adjust_stock', \{ p_item: item\.id, p_delta: delta \}\)/);
});

test('Migrazione v46: accesso per casa, − e + atomici con i permessi di chi li usa, limiti uguali all’app', () => {
  const sql = read('supabase/migrate_v46_scorte.sql');
  assert.match(sql, new RegExp(`unit in \\(${STOCK_UNITS.map(u => `'${u}'`).join(',')}\\)`));
  assert.match(sql, /using \(public\.v19_can_read\(user_id, home_id\)\)/);
  assert.match(sql, /grant update \(name, unit, quantity, threshold, usual_buy, location\) on public\.home_stock_items to authenticated;/);
  assert.match(sql, /function public\.v46_adjust_stock\(p_item uuid, p_delta numeric\) returns numeric\nlanguage plpgsql security invoker/);
  assert.match(sql, /set quantity = least\(100000, greatest\(0, quantity \+ p_delta\)\)/);
  assert.match(sql, new RegExp(`>= ${STOCK_LIMITS.perSpace} then`));
  assert.match(read('README.md'), /migrate_v46_scorte\.sql/);
});

test('Collegamenti e testi', () => {
  const page = read('app/page.jsx');
  assert.match(page, /\{id:'stock',icon:Package\}/);
  assert.match(page, /const Stock=lazy\(\(\)=>import\('\.\/Stock'\)\);/);
  for (const unit of STOCK_UNITS) assert.ok(MESSAGE_KEYS.includes('stock.unit.' + unit) && MESSAGE_KEYS.includes('stock.unitOne.' + unit), unit);
  for (const key of ['nav.stock', 'stock.help', 'stock.proposalHelp', 'stock.proposalHelpPersonal', 'stock.addAll', 'stock.inList', 'stock.migration', 'stock.status.out', 'stock.status.low'])
    assert.ok(MESSAGE_KEYS.includes(key), key);
});
