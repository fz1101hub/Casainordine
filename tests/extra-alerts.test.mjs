import test from 'node:test';import assert from 'node:assert/strict';
import {pendingContractEvents,pendingMaintenanceEvents,pendingMeterEvents,advanceMeterDate,quietTimeRome,pushAllowed,processExtraAlerts} from '../lib/extra-alerts.mjs';
test('contratto: avviso alla data programmata',()=>{const c={id:'x',supplier:'Fornitore',service:'Luce',renewal_on:'2026-12-02',alert_days:30};assert.equal(pendingContractEvents(c,'2026-11-02').length,1);assert.equal(pendingContractEvents(c,'2026-11-03').length,0)});
test('manutenzione -3 giorni e garanzia -30 giorni',()=>{const a={id:'a',name:'Caldaia',next_service_on:'2026-11-05',warranty_until:'2026-12-02'};assert.equal(pendingMaintenanceEvents(a,'2026-11-02').length,2)});
test('orario silenzioso incluso attraversamento mezzanotte, fuso Roma',()=>{const instant=new Date('2026-11-02T22:30:00Z');assert.equal(quietTimeRome({quiet_from:'22:00:00',quiet_until:'07:00:00'},instant),true);assert.equal(quietTimeRome({quiet_from:'01:00:00',quiet_until:'07:00:00'},instant),false)});
test('preferenze notifiche indipendenti',()=>{assert.equal(pushAllowed({push_contracts:false},'contract'),false);assert.equal(pushAllowed({push_bills:true},'bill'),true)});

test('promemoria contatore 3 giorni prima',()=>{assert.equal(pendingMeterEvents({id:'m',meter_name:'Gas',next_due_on:'2026-11-05'},'2026-11-02').length,1)});
// Prima la prova accettava il 28 marzo: il giorno si perdeva dopo febbraio (v55, tests/date-ora-legale.test.mjs).
test('scadenze ricorrenti contatore',()=>{assert.equal(advanceMeterDate('2026-01-31',1,'2026-03-01'),'2026-03-31')});

// Prima della v55 la colonna due_day non c'è: le autoletture si leggono e si spostano come prima,
// senza fermare gli altri avvisi (contratti, manutenzioni).
test('autoletture senza la colonna due_day: si legge come prima e la data si sposta', async () => {
  const updates = [];
  const admin = { from(table) {
    const ops = [];
    const builder = new Proxy({}, { get(_, name) {
      if (name === 'then') {
        const columns = ops.find(o => o[0] === 'select')?.[1] || '';
        let result = { data: [], error: null };
        if (table === 'meter_reminders' && ops.some(o => o[0] === 'update')) { updates.push(ops.find(o => o[0] === 'update')[1]); }
        else if (table === 'meter_reminders' && columns.includes('due_day')) result = { data: null, error: { code: '42703', message: 'column meter_reminders.due_day does not exist' } };
        else if (table === 'meter_reminders') result = { data: [{ id: 'm1', user_id: 'u1', home_id: null, meter_name: 'Gas', next_due_on: '2026-10-31', repeat_months: 1 }], error: null };
        return (ok, ko) => Promise.resolve(result).then(ok, ko);
      }
      return (...args) => { ops.push([name, ...args]); return builder; };
    } });
    return builder;
  } };
  const counts = { errors: [] };
  await processExtraAlerts(admin, '2026-11-23', counts, {});
  assert.deepEqual(counts.errors, []);
  assert.deepEqual(updates, [{ next_due_on: '2026-11-30' }]);
});
