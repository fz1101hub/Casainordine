import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { formatNumberInput, parseNumberInput, sameNumber } from '../lib/number-input.mjs';

const money = (raw, lang = 'it', extra = {}) => parseNumberInput(raw, { lang, decimals: 2, ...extra });
const qty = (raw, lang = 'it', extra = {}) => parseNumberInput(raw, { lang, decimals: 3, ...extra });

test('importi scritti come si scrivono nelle sei lingue', () => {
  const cases = [
    ['12,50', '12.5'], ['12.50', '12.5'], ['12,5', '12.5'], ['12', '12'], ['0,99', '0.99'], [',5', '0.5'],
    ['1.234,56', '1234.56'], ['1,234.56', '1234.56'], ['1 234,56', '1234.56'], ['1 234,56', '1234.56'],
    ['1 234,56', '1234.56'], ["1'234.56", '1234.56'], ['1’234.56', '1234.56'], ['1.234.567', '1234567'],
    ['1.500', '1500'], ['1,500', '1500'], ['€ 12,50', '12.5'], ['12,50 €', '12.5'], ['12,50€', '12.5'], ['EUR 7', '7'],
    ['12,', '12'], ['007,10', '7.1'], ['+3', '3']
  ];
  for (const lang of ['it', 'en', 'es', 'fr', 'de', 'pt']) {
    for (const [raw, value] of cases) assert.deepEqual(money(raw, lang), { value, error: null }, `${lang} «${raw}»`);
  }
});

test('Chrome leggeva «12,50» come 1250: qui resta 12,50', () => {
  assert.equal(Number(money('12,50').value), 12.5);
  assert.equal(Number(money('84,50', 'en').value), 84.5);
});

test('testi che non sono importi: il modulo non parte', () => {
  for (const raw of ['abc', '12a', '1,2,3', '1.23.4', '12,50,00', '1..2', '12.345,6.7', '--3', '1e5', '0x10', 'Infinity'])
    assert.equal(money(raw).error, 'invalid', raw);
  assert.equal(money('12,345').value, '12345'); // tre cifre dopo un solo separatore: migliaia
  assert.equal(money('0,505').error, 'decimals');
  assert.equal(money('12,3456').error, 'decimals');
  assert.equal(money('1234567890123456').error, 'invalid');
});

test('campo vuoto, minimo, massimo e numeri negativi', () => {
  assert.deepEqual(money(''), { value: '', error: null });
  assert.deepEqual(money('   '), { value: '', error: null });
  assert.equal(money('0', 'it', { min: '0.01' }).error, 'min');
  assert.equal(money('0,01', 'it', { min: '0.01' }).error, null);
  assert.equal(money('-5', 'it', { min: 0 }).error, 'min');
  assert.equal(money('−5', 'it', { min: -100 }).value, '-5');
  assert.equal(money('-0', 'it', { min: 0 }).value, '0');
  assert.equal(money('1.000.001', 'it', { max: 1000000 }).error, 'max');
});

test('quantità: «1,500» è 1,5 in italiano e 1500 in inglese', () => {
  assert.equal(qty('1,500', 'it').value, '1.5');
  assert.equal(qty('1.500', 'it').value, '1500');
  assert.equal(qty('1,500', 'en').value, '1500');
  assert.equal(qty('1.500', 'en').value, '1.5');
  assert.equal(qty('1234,567', 'de').value, '1234.567');
  assert.equal(qty('0,25', 'fr').value, '0.25');
  assert.equal(qty('2,0005', 'it').error, 'decimals');
});

test('il numero si mostra come lo scrive chi usa la lingua', () => {
  assert.equal(formatNumberInput('12.5', 'it'), '12,50');
  assert.equal(formatNumberInput(12.5, 'en'), '12.50');
  assert.equal(formatNumberInput('1234.5', 'de'), '1234,50');
  assert.equal(formatNumberInput('1234.5', 'fr'), '1234,50');
  assert.equal(formatNumberInput('1.5', 'pt', 3), '1,5');
  assert.equal(formatNumberInput('', 'it'), '');
  assert.equal(formatNumberInput(null, 'it'), '');
  for (const lang of ['it', 'en', 'es', 'fr', 'de', 'pt']) {
    for (const value of ['0.01', '12.5', '1234.56', '999999.99']) {
      const shown = formatNumberInput(value, lang);
      assert.equal(Number(money(shown, lang).value), Number(value), `${lang}: ${value} → «${shown}» → di nuovo ${value}`);
    }
  }
  assert.ok(sameNumber('12.50', 12.5) && sameNumber('', null) && !sameNumber('', '0') && !sameNumber('1', '2'));
});

test('nessun importo o quantità con <input type="number"> nelle schermate', () => {
  const found = [];
  for (const file of readdirSync('app').filter(f => f.endsWith('.jsx'))) {
    const src = readFileSync(`app/${file}`, 'utf8');
    for (const [tag] of src.matchAll(/<input\b(?:[^/]|\/(?!>))*\/>/g)) {
      if (/type="number"/.test(tag) && !/step="1"/.test(tag) && /step=/.test(tag)) found.push(`${file}: ${tag.slice(0, 120)}`);
    }
  }
  assert.deepEqual(found, []);
});

test('budget della famiglia: 0,10 + 0,20 non supera un budget di 0,30', async () => {
  const { spentByCategory, overBudgetCents } = await import('../lib/house-core.mjs');
  const spent = spentByCategory([{ category: 'Spesa', amount: '0.10' }, { category: 'Spesa', amount: 0.2 }, { category: 'Casa', amount: '19.99' }, { category: 'Casa', amount: 'x' }]);
  assert.deepEqual(spent, { Spesa: 0.3, Casa: 19.99 });
  assert.equal(0.1 + 0.2 > 0.3, true); // il problema di prima
  assert.equal(overBudgetCents(spent.Spesa, '0.30'), 0);
  assert.equal(overBudgetCents(0.31, '0.30'), 1);
  assert.equal(overBudgetCents(5, undefined), 0);
  assert.equal(overBudgetCents(5, ''), 0);
});
