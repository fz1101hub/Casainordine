// Date e ora legale (scelta dell'utente, 23 novembre 2026). L'app ragiona in giorni del calendario
// italiano: «oggi» è quello di Roma, le scadenze sono date senza ora, l'orario silenzioso è in ora
// di Roma. Qui si prova a cavallo della mezzanotte, nei due giorni del cambio dell'ora (29 marzo e
// 25 ottobre 2026), a fine anno, negli anni bisestili e con il computer in un altro fuso orario.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { todayRome, addDaysISO, nextRecurringDue } from '../lib/dates.mjs';
import { reminderWindow, daysUntil, firstRecurringFrom } from '../lib/reminder-window.mjs';
import { quietTimeRome, pushAllowed } from '../lib/push-preferences.mjs';
import { advanceMeterDate, pendingMeterEvents } from '../lib/extra-alerts.mjs';
import { shouldSendSummary, monthEndISO } from '../lib/summary-schedule.mjs';
import { formatDate } from '../lib/i18n.mjs';

const at = iso => new Date(iso);

test('«oggi» è il giorno di Roma, anche tra mezzanotte e le 2 (ora UTC del giorno prima)', () => {
  // Inverno, UTC+1.
  assert.equal(todayRome(at('2026-11-30T22:59:00Z')), '2026-11-30');
  assert.equal(todayRome(at('2026-11-30T23:00:00Z')), '2026-12-01');
  // Estate, UTC+2.
  assert.equal(todayRome(at('2026-06-30T21:59:00Z')), '2026-06-30');
  assert.equal(todayRome(at('2026-06-30T22:00:00Z')), '2026-07-01');
  // Capodanno.
  assert.equal(todayRome(at('2026-12-31T23:30:00Z')), '2027-01-01');
});

test('i giorni del cambio dell\'ora', () => {
  // 29 marzo 2026: alle 02:00 (01:00 UTC) si passa alle 03:00.
  assert.equal(todayRome(at('2026-03-28T23:30:00Z')), '2026-03-29');
  assert.equal(todayRome(at('2026-03-29T21:59:00Z')), '2026-03-29');
  assert.equal(todayRome(at('2026-03-29T22:00:00Z')), '2026-03-30');
  // 25 ottobre 2026: alle 03:00 (01:00 UTC) si torna alle 02:00.
  assert.equal(todayRome(at('2026-10-24T22:00:00Z')), '2026-10-25');
  assert.equal(todayRome(at('2026-10-25T22:59:00Z')), '2026-10-25');
  assert.equal(todayRome(at('2026-10-25T23:00:00Z')), '2026-10-26');
  // I giorni restano giorni: niente 0,96 o 1,04 giorni.
  assert.equal(daysUntil('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysUntil('2026-10-24', '2026-10-26'), 2);
  assert.equal(addDaysISO('2026-03-28', 1), '2026-03-29');
  assert.equal(addDaysISO('2026-10-25', 1), '2026-10-26');
});

test('finestra dei promemoria e fine mese a cavallo dell\'anno e negli anni bisestili', () => {
  assert.deepEqual(reminderWindow('2026-12-30'), { from: '2026-12-30', to: '2027-01-02' });
  assert.deepEqual(reminderWindow('2028-02-27'), { from: '2028-02-27', to: '2028-03-01' });
  assert.equal(addDaysISO('2028-02-28', 1), '2028-02-29');
  assert.equal(addDaysISO('2027-02-28', 1), '2027-03-01');
  assert.equal(monthEndISO('2028-02-10'), '2028-02-29');
  assert.equal(monthEndISO('2026-02-10'), '2026-02-28');
  assert.equal(daysUntil('2026-12-31', '2027-01-01'), 1);
});

test('orario silenzioso in ora di Roma, anche dopo il cambio dell\'ora', () => {
  const night = { quiet_from: '22:00:00', quiet_until: '08:30:00' };
  // Il controllo giornaliero parte alle 07:07 UTC: 08:07 in inverno (silenzio), 09:07 in estate (no).
  assert.equal(quietTimeRome(night, at('2026-11-23T07:07:00Z')), true);
  assert.equal(quietTimeRome(night, at('2026-06-23T07:07:00Z')), false);
  // Proprio nei giorni del cambio.
  assert.equal(quietTimeRome(night, at('2026-03-29T06:15:00Z')), true, '29 marzo, 08:15 CEST (in inverno sarebbero le 07:15)');
  assert.equal(quietTimeRome(night, at('2026-03-29T06:45:00Z')), false, '08:45 CEST');
  assert.equal(quietTimeRome(night, at('2026-03-29T05:45:00Z')), true, '07:45 CEST');
  assert.equal(quietTimeRome(night, at('2026-10-25T07:15:00Z')), true, '25 ottobre, 08:15 CET');
  assert.equal(quietTimeRome(night, at('2026-10-25T07:45:00Z')), false, '08:45 CET');
  // Limiti: dalle 22:00 incluse alle 08:30 escluse; finestra nello stesso giorno; inizio uguale alla fine = spento.
  assert.equal(quietTimeRome(night, at('2026-11-23T21:00:00Z')), true, '22:00');
  assert.equal(quietTimeRome(night, at('2026-11-23T20:59:00Z')), false, '21:59');
  assert.equal(quietTimeRome(night, at('2026-11-23T07:30:00Z')), false, '08:30');
  const afternoon = { quiet_from: '13:00', quiet_until: '15:00' };
  assert.equal(quietTimeRome(afternoon, at('2026-11-23T12:30:00Z')), true, '13:30');
  assert.equal(quietTimeRome(afternoon, at('2026-11-23T14:00:00Z')), false, '15:00');
  assert.equal(quietTimeRome({ quiet_from: '08:00', quiet_until: '08:00' }, at('2026-11-23T07:00:00Z')), false);
  assert.equal(pushAllowed({ ...night, push_bills: true }, 'bill', at('2026-06-23T07:07:00Z')), true);
});

test('utenze ricorrenti: il giorno scelto resta, anche dopo un mese più corto', () => {
  assert.equal(nextRecurringDue('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(nextRecurringDue('2026-02-28', 'monthly', 31), '2026-03-31');
  assert.equal(nextRecurringDue('2027-12-31', 'bimonthly', 31), '2028-02-29');
  assert.equal(nextRecurringDue('2028-02-29', 'yearly', 29), '2029-02-28');
  assert.equal(nextRecurringDue('2029-02-28', 'yearly', 29), '2030-02-28');
  assert.equal(nextRecurringDue('2026-11-30', 'quarterly', 30), '2027-02-28');
  assert.equal(firstRecurringFrom('2026-01-31', '2026-05-01', 'monthly', 31), '2026-05-31');
});

test('autoletture ricorrenti: il giorno scelto resta, anche dopo un mese più corto', () => {
  // Prima: 31 gennaio → 28 febbraio → 28 marzo → 28 aprile… (il giorno si perdeva per sempre).
  assert.equal(advanceMeterDate('2026-01-31', 1, '2026-02-01', 31), '2026-02-28');
  assert.equal(advanceMeterDate('2026-02-28', 1, '2026-03-01', 31), '2026-03-31');
  assert.equal(advanceMeterDate('2026-01-31', 1, '2026-04-15', 31), '2026-04-30', 'più mesi saltati in un colpo');
  assert.equal(advanceMeterDate('2026-01-30', 3, '2026-02-01', 30), '2026-04-30');
  // Senza giorno salvato (voci di prima): si usa il giorno della data.
  assert.equal(advanceMeterDate('2026-01-15', 2, '2026-02-01'), '2026-03-15');
  // L'avviso parte 3 giorni prima, anche a cavallo del cambio dell'ora.
  assert.deepEqual(pendingMeterEvents({ id: 'm', next_due_on: '2026-03-31' }, '2026-03-28').map(e => e.event_date), ['2026-03-28']);
});

test('riepiloghi: giorno della settimana e del mese giusti, anche nelle settimane del cambio dell\'ora', () => {
  // 29 marzo 2026 è domenica, 30 marzo lunedì; 26 ottobre lunedì.
  assert.equal(shouldSendSummary({ summary_frequency: 'weekly', summary_weekday: 1 }, '2026-03-30'), true);
  assert.equal(shouldSendSummary({ summary_frequency: 'weekly', summary_weekday: 1 }, '2026-03-29'), false);
  assert.equal(shouldSendSummary({ summary_frequency: 'weekly', summary_weekday: 0 }, '2026-10-25'), true);
  // Ogni due settimane: alternanza regolare anche attraverso i cambi dell'ora.
  const mondays = []; for (let d = '2026-03-02'; d <= '2026-11-30'; d = addDaysISO(d, 7)) mondays.push(shouldSendSummary({ summary_frequency: 'biweekly', summary_weekday: 1 }, d));
  assert.ok(mondays.every((v, i) => i === 0 || v !== mondays[i - 1]), 'una settimana sì e una no');
  // Mensile: il giorno 31 non esiste in tutti i mesi; si usa al massimo il 28.
  assert.equal(shouldSendSummary({ summary_frequency: 'monthly', summary_month_day: 31 }, '2026-02-28'), true);
});

test('date mostrate: stesso giorno in ogni lingua', () => {
  for (const lang of ['it', 'en', 'es', 'fr', 'de', 'pt']) assert.match(formatDate('2026-03-29', lang), /29/);
  assert.match(formatDate('2026-10-25', 'it'), /^25 ott 2026$/);
});

test('con il computer o il server in un altro fuso orario i risultati non cambiano', () => {
  const script = `
    const d = await import(${JSON.stringify(new URL('../lib/dates.mjs', import.meta.url).href)});
    const w = await import(${JSON.stringify(new URL('../lib/reminder-window.mjs', import.meta.url).href)});
    const q = await import(${JSON.stringify(new URL('../lib/push-preferences.mjs', import.meta.url).href)});
    const i = await import(${JSON.stringify(new URL('../lib/i18n.mjs', import.meta.url).href)});
    const e = await import(${JSON.stringify(new URL('../lib/extra-alerts.mjs', import.meta.url).href)});
    console.log(JSON.stringify([
      d.todayRome(new Date('2026-11-30T23:30:00Z')), d.todayRome(new Date('2026-03-29T01:30:00Z')),
      d.addDaysISO('2026-03-28', 1), w.daysUntil('2026-10-24', '2026-10-26'), JSON.stringify(w.reminderWindow('2026-12-30')),
      q.quietTimeRome({ quiet_from: '22:00', quiet_until: '08:30' }, new Date('2026-11-23T07:07:00Z')),
      i.formatDate('2026-03-29', 'it'), e.advanceMeterDate('2026-01-31', 1, '2026-04-15', 31), d.nextRecurringDue('2026-01-31', 'monthly', 31),
    ]));`;
  const results = ['UTC', 'Europe/Rome', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'].map(TZ =>
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }).trim());
  assert.ok(results.every(r => r === results[0]), results.join('\n'));
  assert.deepEqual(JSON.parse(results[0]).slice(0, 4), ['2026-12-01', '2026-03-29', '2026-03-29', 2]);
});
