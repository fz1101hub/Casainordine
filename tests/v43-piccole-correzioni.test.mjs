// Secondo audit: piccole correzioni L1 (data dei rimborsi), M1 (Outlook) e A2 (pagina di prova).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectBillingInconsistencies } from '../lib/v21-core.mjs';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('L1: un rimborso atteso per oggi non è in ritardo; da domani sì', () => {
  const refunds = [{ status: 'expected', expected_on: '2026-11-11', label: 'Conguaglio', bill_id: 'b1' }];
  const late = today => detectBillingInconsistencies({ refunds, today }).filter(x => x.code === 'refund_late').length;
  assert.equal(late('2026-11-11'), 0);
  assert.equal(late('2026-11-12'), 1);
  assert.equal(late('2026-11-10'), 0);
  assert.equal(detectBillingInconsistencies({ refunds: [{ ...refunds[0], status: 'received' }], today: '2026-12-01' }).length, 0);
});

test('L1: senza data esplicita vale la data italiana, non quella UTC', () => {
  const core = source('lib/v21-core.mjs');
  assert.match(core, /today=todayRome\(\)/);
  assert.doesNotMatch(core, /new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
});

test('M1: le intestazioni di un messaggio Outlook si scaricano al massimo una volta', () => {
  const ms = source('lib/mail-microsoft.mjs');
  assert.equal(ms.split('$select=internetMessageHeaders').length - 1, 1);
  assert.match(ms, /const paymentSenderAuth=async\(\)=>reportedAuthentication\(await messageHeaders\(\)/);
  assert.match(ms, /senderAuth=reportedAuthentication\(await messageHeaders\(\),sender,'outlook'\)/);
});

test('A2: intestazione della pagina di prova dentro un <header>', () => {
  const page = source('app/TestDrive.jsx');
  const open = page.indexOf('<header>'), top = page.indexOf('className="testdrive-top"'),
    banner = page.indexOf('className="testdrive-banner"'), close = page.indexOf('</header>'), nav = page.indexOf('<nav className="testdrive-navigation"');
  assert.ok(open > 0 && open < top && top < banner && banner < close && close < nav, [open, top, banner, close, nav].join(','));
});
