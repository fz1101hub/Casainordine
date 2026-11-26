// Spese detraibili per il 730 (scelta dell'utente del 25 novembre 2026, sera): lib/taxes.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TAX_CATEGORIES, PAYMENT_METHODS, TAX_SOURCES, TAX_LIMITS, PAYMENT_NEEDED, taxRuleKey, normalizeTaxItem, normalizeTaxCode, validTaxCode, toCents,
  itemWarnings, yearSummary, taxYears, taxCandidates, taxCsv,
} from '../lib/taxes.mjs';
import { TRANSLATIONS, translate } from '../lib/i18n.mjs';

const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('la migrazione accetta quello che il modulo produce', () => {
  // Le fonti nuove arrivano con le migrazioni successive (v62: spese sanitarie).
  const sql = read('supabase/migrate_v59_animali_foto_meteo_730.sql') + read('supabase/migrate_v62_scheda_spese_bilanci.sql') + read('supabase/migrate_v64_rate_scadenze.sql');
  for (const m of PAYMENT_METHODS) assert.match(sql, new RegExp(`'${m}'`), m);
  for (const s of TAX_SOURCES) assert.match(sql, new RegExp(`'${s}'`), s);
  for (const c of TAX_CATEGORIES) assert.match(c, /^[a-z][a-z_]{1,29}$/);
  assert.match(sql, /amount_cents between 1 and 100000000/);
  assert.equal(TAX_LIMITS.maxCents, 100000000);
});

test('voce controllata: descrizione, importo in centesimi, anno, codice del fornitore', () => {
  assert.equal(normalizeTaxItem({ description: 'x', amount: '10', tax_year: 2026 }).error, 'taxes.error.description');
  assert.equal(normalizeTaxItem({ description: 'Caldaia', amount: '0', tax_year: 2026 }).error, 'taxes.error.amount');
  assert.equal(normalizeTaxItem({ description: 'Caldaia', amount: '10', tax_year: 1999 }).error, 'taxes.error.year');
  assert.equal(normalizeTaxItem({ description: 'Caldaia', amount: '10', tax_year: 2026, paid_on: '2026-02-30' }).error, 'taxes.error.date');
  const { value } = normalizeTaxItem({ description: ' Caldaia ', amount: '3500.5', tax_year: '2026', category: 'boh', payment_method: 'assegno', supplier_tax_code: ' it 06363391001 ' });
  assert.deepEqual([value.description, value.amount_cents, value.tax_year, value.category, value.payment_method, value.supplier_tax_code], ['Caldaia', 350050, 2026, 'other', null, 'IT06363391001']);
  assert.equal(toCents('0.1') + toCents('0.2'), 30, 'niente errori di arrotondamento');
  assert.equal(normalizeTaxCode('rss-mra 85t10a562s'), 'RSSMRA85T10A562S');
  assert.equal(validTaxCode('06363391001'), true);
  assert.equal(validTaxCode('06363391002'), false, 'cifra di controllo sbagliata');
  assert.equal(validTaxCode('RSSMRA85T10A562S'), true);
  assert.equal(validTaxCode('RSSMRA85T10'), false);
});

test('regole per anno: 50%/36% nel 2025 e 2026, 36%/30% nel 2027, altrimenti «controlla»', () => {
  assert.equal(taxRuleKey('renovation', 2026), 'taxes.rule.renovation.2026');
  assert.equal(taxRuleKey('renovation', 2025), 'taxes.rule.renovation.2026');
  assert.equal(taxRuleKey('energy', 2027), 'taxes.rule.energy.2027');
  assert.equal(taxRuleKey('renovation', 2028), 'taxes.rule.unknown');
  assert.equal(taxRuleKey('furniture', 2027), 'taxes.rule.unknown', 'bonus mobili confermato solo fino al 2026');
  assert.equal(taxRuleKey('veterinary', 2026), 'taxes.rule.veterinary');
  assert.equal(taxRuleKey('other', 2030), 'taxes.rule.other');
  assert.match(translate('it', 'taxes.rule.renovation.2026'), /50%.*36%.*96\.000/);
  assert.match(translate('it', 'taxes.rule.veterinary'), /129,11.*550/);
  for (const lang of LANGS) {
    for (const c of TAX_CATEGORIES) {
      assert.ok(TRANSLATIONS[lang]['taxes.category.' + c], `${lang} ${c}`);
      for (const y of [2025, 2026, 2027, 2030]) assert.ok(TRANSLATIONS[lang][taxRuleKey(c, y)], `${lang} ${c} ${y}`);
    }
    for (const m of PAYMENT_METHODS) assert.ok(TRANSLATIONS[lang]['taxes.payment.' + m], `${lang} ${m}`);
    for (const s of TAX_SOURCES.filter(s => s !== 'manual')) assert.ok(TRANSLATIONS[lang]['taxes.source.' + s], `${lang} ${s}`);
    for (const w of ['transfer', 'traceable', 'taxCode', 'document', 'year']) assert.ok(TRANSLATIONS[lang]['taxes.warning.' + w], `${lang} ${w}`);
  }
});

test('cosa controllare: bonifico parlante, pagamento tracciabile, codice, documento, anno', () => {
  const base = { tax_year: 2026, paid_on: '2026-04-10', document_id: 'd', supplier_tax_code: '06363391001' };
  assert.deepEqual(itemWarnings({ ...base, category: 'renovation', payment_method: 'tax_transfer' }), []);
  assert.deepEqual(itemWarnings({ ...base, category: 'renovation', payment_method: 'traceable', supplier_tax_code: '', document_id: null, paid_on: '2025-12-30' }), ['transfer', 'taxCode', 'document', 'year']);
  assert.deepEqual(itemWarnings({ ...base, category: 'veterinary', payment_method: 'cash' }), ['traceable']);
  assert.deepEqual(itemWarnings({ ...base, category: 'medical', payment_method: null }), ['traceable']);
  assert.deepEqual(itemWarnings({ ...base, category: 'rent', payment_method: 'cash' }), []);
  assert.equal(PAYMENT_NEEDED.energy, 'tax_transfer');
});

test('riepilogo dell\'anno e anni da mostrare', () => {
  const items = [
    { tax_year: 2026, category: 'renovation', amount_cents: 350000, payment_method: 'tax_transfer', supplier_tax_code: '06363391001', document_id: 'd', paid_on: '2026-04-10' },
    { tax_year: 2026, category: 'renovation', amount_cents: 1000, payment_method: 'cash', paid_on: '2026-05-01' },
    { tax_year: 2026, category: 'veterinary', amount_cents: 6550, payment_method: 'traceable', document_id: 'd', paid_on: '2026-03-01' },
    { tax_year: 2024, category: 'medical', amount_cents: 100 },
  ];
  assert.deepEqual(yearSummary(items, 2026), [
    { category: 'renovation', total_cents: 351000, count: 2, warnings: 1 }, { category: 'veterinary', total_cents: 6550, count: 1, warnings: 0 }]);
  assert.deepEqual(taxYears(items, '2026-11-25'), [2026, 2025, 2024]);
  assert.equal(translate('it', 'taxes.items', { count: 1 }), '1 voce');
});

test('spese da cui partire: anno del pagamento, una volta sola, tipo proposto', () => {
  const sources = {
    bills: [{ id: 'b1', title: 'Fattura luce', supplier: 'Enel', amount: 80.5, paid_at: '2026-03-02T10:00:00Z' }, { id: 'b2', title: 'Non pagata', amount: 10, paid_at: null }, { id: 'b3', title: 'Altro anno', amount: 5, paid_at: '2025-12-31T23:00:00Z' }],
    billDocuments: [{ id: 'doc-b1', bill_id: 'b1' }],
    expenses: [{ id: 'e1', title: 'Tende', amount: 120, incurred_on: '2026-06-01' }],
    projects: [{ id: 'p1', title: 'Bagno' }], projectExpenses: [{ id: 'x1', project_id: 'p1', description: 'Idraulico', amount: 1500, paid_on: '2026-05-10', document_id: 'doc-x1' }],
    pets: [{ id: 'fido', name: 'Fido' }], petLog: [{ id: 'l1', pet_id: 'fido', title: 'Vaccino', cost_cents: 6500, done_on: '2026-03-01', document_id: null }],
  };
  const list = taxCandidates(sources, 2026, [{ source: 'home_expense', source_id: 'e1' }]);
  assert.deepEqual(list.map(c => [c.source, c.source_id, c.amount_cents, c.category]), [
    ['project_expense', 'x1', 150000, 'renovation'], ['bill', 'b1', 8050, 'other'], ['pet_log', 'l1', 6500, 'veterinary']]);
  assert.equal(list.find(c => c.source === 'bill').document_id, 'doc-b1', 'la bolletta porta il suo documento');
  assert.equal(list.find(c => c.source === 'project_expense').description, 'Bagno · Idraulico');
  assert.equal(list.find(c => c.source === 'pet_log').description, 'Fido · Vaccino');
});

test('CSV per il commercialista: Excel in italiano, niente formule, solo l\'anno scelto', () => {
  const t = (key, params) => translate('it', key, params);
  const csv = taxCsv([
    { tax_year: 2026, paid_on: '2026-04-10', category: 'renovation', description: 'Caldaia; nuova', amount_cents: 350050, payment_method: 'tax_transfer', supplier: '=SOMMA(A1)', supplier_tax_code: '06363391001', document_name: 'fattura.pdf', notes: '' },
    { tax_year: 2025, paid_on: '2025-01-01', category: 'other', description: 'Vecchia', amount_cents: 100 },
  ], 2026, t);
  assert.ok(csv.startsWith('﻿Data;Categoria;Descrizione;Importo (€)'));
  const line = csv.split('\r\n')[1];
  assert.match(line, /^2026-04-10;Lavori sulla casa \(bonus ristrutturazione\);"Caldaia; nuova";3500,50;Bonifico «parlante» per detrazioni;"'=SOMMA\(A1\)";06363391001;fattura\.pdf;$/);
  assert.ok(!csv.includes('Vecchia'));
});

test('la schermata: sezione nel gruppo Soldi, testi caricati all\'apertura, avviso che non è consulenza fiscale', () => {
  assert.match(read('lib/menu-groups.mjs'), /'fraud', 'taxes'\]/);
  assert.match(read('app/page.jsx'), /tab==='taxes'&&<Taxes /);
  const source = read('app/Taxes.jsx');
  assert.match(source, /useSection\('taxes'\)/);
  assert.match(source, /tr\('taxes\.disclaimer'\)/);
  assert.match(source, /error\.code === '23505' \? tr\('taxes\.error\.already'\)/);
  assert.match(translate('it', 'taxes.disclaimer'), /Non è una consulenza fiscale/);
});
