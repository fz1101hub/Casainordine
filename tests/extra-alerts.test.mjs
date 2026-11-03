import test from 'node:test';import assert from 'node:assert/strict';
import {pendingContractEvents,pendingMaintenanceEvents,pendingMeterEvents,advanceMeterDate,quietTimeRome,pushAllowed} from '../lib/extra-alerts.mjs';
test('contratto: avviso alla data programmata',()=>{const c={id:'x',supplier:'Fornitore',service:'Luce',renewal_on:'2026-12-02',alert_days:30};assert.equal(pendingContractEvents(c,'2026-11-02').length,1);assert.equal(pendingContractEvents(c,'2026-11-03').length,0)});
test('manutenzione -3 giorni e garanzia -30 giorni',()=>{const a={id:'a',name:'Caldaia',next_service_on:'2026-11-05',warranty_until:'2026-12-02'};assert.equal(pendingMaintenanceEvents(a,'2026-11-02').length,2)});
test('orario silenzioso incluso attraversamento mezzanotte, fuso Roma',()=>{const instant=new Date('2026-11-02T22:30:00Z');assert.equal(quietTimeRome({quiet_from:'22:00:00',quiet_until:'07:00:00'},instant),true);assert.equal(quietTimeRome({quiet_from:'01:00:00',quiet_until:'07:00:00'},instant),false)});
test('preferenze notifiche indipendenti',()=>{assert.equal(pushAllowed({push_contracts:false},'contract'),false);assert.equal(pushAllowed({push_bills:true},'bill'),true)});

test('promemoria contatore 3 giorni prima',()=>{assert.equal(pendingMeterEvents({id:'m',meter_name:'Gas',next_due_on:'2026-11-05'},'2026-11-02').length,1)});
test('scadenze ricorrenti contatore',()=>{assert.equal(advanceMeterDate('2026-01-31',1,'2026-03-01'),'2026-03-28')});
