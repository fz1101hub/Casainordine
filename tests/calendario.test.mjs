// Calendario sul telefono (scelta dell'utente, 23 novembre 2026): il collegamento .ics che Google
// Calendar, Apple Calendario e Outlook leggono. Si controlla il formato (RFC 5545) con le regole
// che i programmi più severi applicano, e lo si legge con ical.js (la libreria di Thunderbird).
// Poi il collegamento vero (app/api/calendar) contro il Supabase finto: crearlo, leggerlo,
// rigenerarlo, revocarlo.
import test from 'node:test';
import assert from 'node:assert/strict';
import ICAL from 'ical.js';
import { calendarText } from '../lib/calendar.mjs';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';

const LONG = 'Bolletta della luce dell\'appartamento al mare con un nome molto lungo per vedere come si piega la riga 🏖️ àèìòù ' + 'x'.repeat(60);
const TRICKY = 'Gas; acqua, luce\\rifiuti\nseconda riga\tcon tab e \u0007 un carattere di controllo';
const bills = [
  { id: 'b-lunga', title: LONG, supplier: 'Fornitore di energia elettrica con un nome davvero lunghissimo', amount: 1234.5, due_date: '2026-03-29', paid_at: null },
  { id: 'b-difficile', title: TRICKY, supplier: null, amount: null, due_date: '2026-10-25', paid_at: null },
  { id: 'b-pagata', title: 'Già pagata', supplier: 'Eni', amount: 10, due_date: '2026-11-12', paid_at: '2026-11-05T10:00:00Z' },
];

// Regole di formato che i programmi severi controllano.
function formatProblems(text) {
  const problems = [];
  if (!text.endsWith('\r\n')) problems.push('non finisce con CRLF');
  if (/[^\r]\n|\r[^\n]/.test(text)) problems.push('a capo senza CRLF');
  const lines = text.split('\r\n').slice(0, -1);
  lines.forEach((line, i) => {
    if (Buffer.byteLength(line, 'utf8') > 75) problems.push(`riga ${i + 1} di ${Buffer.byteLength(line, 'utf8')} byte (massimo 75)`);
    if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(line)) problems.push(`riga ${i + 1} con un carattere di controllo`);
    if (/[\ud800-\udbff]$/.test(line) || /^ ?[\udc00-\udfff]/.test(line)) problems.push(`riga ${i + 1}: emoji spezzata`);
  });
  const unfolded = text.replace(/\r\n[ \t]/g, '');
  const events = unfolded.split('BEGIN:VEVENT').slice(1);
  for (const event of events) for (const prop of ['UID:', 'DTSTAMP:', 'DTSTART;VALUE=DATE:']) if (!event.includes(`\r\n${prop}`)) problems.push(`evento senza ${prop}`);
  if (!/\r\nVERSION:2\.0\r\n/.test(unfolded) || !/\r\nPRODID:/.test(unfolded)) problems.push('VERSION o PRODID mancanti');
  if (!/BEGIN:V(EVENT|TIMEZONE|TODO)/.test(unfolded)) problems.push('calendario senza nessun componente');
  return problems;
}

test('formato: righe di al massimo 75 byte, CRLF, niente caratteri di controllo, campi obbligatori', () => {
  const text = calendarText(bills, '20261123T180000Z', 'it');
  assert.deepEqual(formatProblems(text), []);
});

test('ical.js legge gli eventi: titoli e date come sono stati scritti, nessun giorno spostato dal cambio dell\'ora', () => {
  const calendar = new ICAL.Component(ICAL.parse(calendarText(bills, '20261123T180000Z', 'it')));
  const events = calendar.getAllSubcomponents('vevent').map(v => new ICAL.Event(v));
  assert.equal(events.length, 2, 'la bolletta pagata non c\'è');
  const [long, tricky] = events;
  assert.equal(long.summary, `Pagamento: ${LONG}`);
  assert.equal(tricky.summary, 'Pagamento: Gas; acqua, luce\\rifiuti\nseconda riga con tab e  un carattere di controllo');
  // Giornata intera: il 29 marzo e il 25 ottobre (cambi dell'ora) restano quei giorni.
  assert.equal(long.startDate.isDate, true);
  assert.equal(long.startDate.toString(), '2026-03-29');
  assert.equal(long.endDate.toString(), '2026-03-30');
  assert.equal(tricky.startDate.toString(), '2026-10-25');
  assert.match(long.description, /Importo: EUR 1234\.50/);
  assert.equal(long.uid, 'bill-b-lunga@casainordine');
  // Promemoria 3 giorni prima, che non occupa la giornata.
  const alarm = long.component.getFirstSubcomponent('valarm');
  assert.equal(alarm.getFirstPropertyValue('trigger').toString(), '-P3D');
  assert.equal(long.component.getFirstPropertyValue('transp'), 'TRANSPARENT');
  assert.equal(long.component.getFirstPropertyValue('dtstamp').toString(), '2026-11-23T18:00:00Z');
  // Il calendario dice quanto spesso ricaricarlo e in che fuso orario è.
  assert.equal(calendar.getFirstPropertyValue('x-wr-timezone'), 'Europe/Rome');
  assert.equal(calendar.getFirstPropertyValue('refresh-interval').toString(), 'PT6H');
});

test('senza scadenze il calendario resta valido (ha comunque un componente)', () => {
  const text = calendarText([], '20261123T180000Z', 'en');
  assert.deepEqual(formatProblems(text), []);
  const calendar = new ICAL.Component(ICAL.parse(text));
  assert.equal(calendar.getAllSubcomponents('vevent').length, 0);
  assert.equal(calendar.getFirstSubcomponent('vtimezone').getFirstPropertyValue('tzid'), 'Europe/Rome');
  assert.equal(calendar.getFirstPropertyValue('x-wr-calname'), 'Casa in Ordine due dates');
});

test('il collegamento: crearlo, leggerlo, rigenerarlo e revocarlo', async () => {
  const fake = await startFakeSupabase();
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: fake.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'chiave-pubblica-finta', SUPABASE_SECRET_KEY: 'chiave-di-servizio-finta' });
  try {
    const ANNA = '11111111-1111-4111-8111-111111111111', HOME = '10000000-0000-4000-8000-0000000000c1';
    const token = fake.addUser(ANNA, 'anna@example.org');
    fake.seed('home_members', [{ home_id: HOME, user_id: ANNA, role: 'owner' }]);
    fake.seed('user_language_preferences', [{ user_id: ANNA, language: 'de' }]);
    const today = new Date().toISOString().slice(0, 10);
    fake.seed('bills', [{ id: 'p1', user_id: ANNA, home_id: null, title: 'Telefono', supplier: 'Tim', amount: 29, due_date: today, paid_at: null },
      { id: 'h1', user_id: ANNA, home_id: HOME, title: 'Luce della casa', supplier: 'Enel', amount: 60, due_date: today, paid_at: null },
      { id: 'h2', user_id: ANNA, home_id: HOME, title: 'Pagata', supplier: 'Enel', amount: 60, due_date: today, paid_at: '2026-11-01T10:00:00Z' }]);
    const feed = await import('../app/api/calendar/feed/route.js');
    const reader = await import('../app/api/calendar/[token]/route.js');
    const create = async () => (await (await feed.POST(new Request('https://casa.example/api/calendar/feed', { method: 'POST', headers: { authorization: `Bearer ${token}` } }))).json()).url;
    const read = async url => reader.GET(new Request(url), { params: Promise.resolve({ token: url.split('/').pop() }) });

    const first = await create();
    assert.match(first, /^https:\/\/casa\.example\/api\/calendar\/[A-Za-z0-9_-]{43}$/);
    let res = await read(first);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/calendar; charset=utf-8/);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    const text = await res.text();
    assert.deepEqual(formatProblems(text), []);
    const events = new ICAL.Component(ICAL.parse(text)).getAllSubcomponents('vevent').map(v => new ICAL.Event(v));
    assert.deepEqual(events.map(e => e.uid).sort(), ['bill-h1@casainordine', 'bill-p1@casainordine'], 'personali e della casa, non quelle pagate');
    assert.match(events[0].summary, /^Zahlung: /, 'nella lingua di chi l\'ha creato');
    // DTSTAMP è il momento della lettura, non una data fissa.
    const stamp = events[0].component.getFirstPropertyValue('dtstamp').toJSDate().getTime();
    assert.ok(Math.abs(stamp - Date.now()) < 120000, 'DTSTAMP di adesso');

    // Rigenerato: il vecchio collegamento non funziona più.
    const second = await create();
    assert.notEqual(second, first);
    assert.equal((await read(first)).status, 404);
    assert.equal((await read(second)).status, 200);
    // Revocato: nessun collegamento funziona.
    const off = await feed.DELETE(new Request('https://casa.example/api/calendar/feed', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }));
    assert.equal(off.status, 200);
    assert.equal((await read(second)).status, 404);
    // Collegamento malformato: 404 senza leggere il database.
    fake.state.requests.length = 0;
    assert.equal((await read('https://casa.example/api/calendar/corto')).status, 404);
    assert.equal(fake.state.requests.length, 0);
  } finally { await fake.close(); }
});
