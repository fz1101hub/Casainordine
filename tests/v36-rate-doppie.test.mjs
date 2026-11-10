import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRatePlanText, rateItemsWithKeys } from '../lib/rate-plan.mjs';

test('Piano rate: due rate con stessa data e importo si salvano entrambe, e una nuova importazione non le duplica',()=>{
  const plan=parseRatePlanText('Rata 1 ordinaria 31/01/2027 € 150,00\nRata 1 straordinaria 31/01/2027 € 150,00\nRata 2 ordinaria 30/04/2027 € 150,00');
  assert.equal(plan.rows.length,3);
  assert.equal(new Set(plan.rows.map(r=>r.title)).size,3,'titoli distinti: '+plan.rows.map(r=>r.title).join(', '));
  const items=rateItemsWithKeys(plan.rows,'Condominio Via Roma');
  assert.equal(new Set(items.map(i=>i.external_id)).size,3);
  assert.equal(items[0].external_id,'rate:condominio via roma:2027-01-31:150.00','la prima rata mantiene la chiave di sempre');
  assert.equal(items[1].external_id,'rate:condominio via roma:2027-01-31:150.00:2');
  const again=rateItemsWithKeys(parseRatePlanText('Rata 1 ordinaria 31/01/2027 € 150,00\nRata 1 straordinaria 31/01/2027 € 150,00\nRata 2 ordinaria 30/04/2027 € 150,00').rows,'Condominio Via Roma');
  assert.deepEqual(again.map(i=>i.external_id),items.map(i=>i.external_id));
});
test('Piano rate: il salvataggio non rifiuta più le rate con stessa data e importo',()=>{
  const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
  const fn=page.slice(page.indexOf('async function saveRatePlan(){'),page.indexOf('async function saveRatePlan(){')+1500);
  assert.match(fn,/r\.title\.trim\(\)\.toLowerCase\(\)\}:\$\{r\.due_date\}:\$\{Number\(r\.amount\)\}/,'doppioni solo se identiche anche nel titolo');
  assert.match(fn,/const items=rateItemsWithKeys\(selected,supplier\);/);
});
