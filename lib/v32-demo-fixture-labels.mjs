// Dati di esempio tradotti nella lingua dell'app (chiavi «demo.fixture.*» del dizionario).
// Si traduce solo un testo rimasto quello originale: se nella prova qualcuno lo cambia, resta il suo.
import { createDemoFixtures } from './test-fixtures.mjs';

const BASE = createDemoFixtures('2026-01-01');
const ORIGINAL = Object.fromEntries(['bills', 'tasks', 'shopping', 'assets', 'decisions']
  .flatMap(list => BASE[list].map(item => [item.id, { title: item.title ?? item.name, quantity: item.quantity }])));

function localizeItem(item, t, id = item?.id) {
  const original = ORIGINAL[id];
  if (!original || !item) return item;
  const out = { ...item };
  if (item.title !== undefined && item.title === original.title) out.title = t('demo.fixture.' + id);
  if (item.name !== undefined && item.name === original.title) out.name = t('demo.fixture.' + id);
  if (item.quantity && item.quantity === original.quantity) out.quantity = t('demo.fixture.qty.' + id);
  return out;
}

// Pagina di prova (/prova): dati di lib/test-fixtures.mjs.
export function localizeDemoFixtures(data, t) {
  if (!data) return data;
  const all = list => (data[list] || []).map(item => localizeItem(item, t));
  return { ...data, bills: all('bills'), tasks: all('tasks'), shopping: all('shopping'), assets: all('assets'), decisions: all('decisions') };
}

// Pagina principale senza account (fakeData in app/page.jsx): stessi testi della prova.
const MAIN = { 'demo-1': 'bill-electric', 'demo-2': 'bill-internet', 'demo-3': 'bill-water', 'demo-4': 'bill-gas', 'demo-t1': 'task-filter' };
export function localizeMainDemo(data, t) {
  if (!data) return data;
  const item = x => x && MAIN[x.id] ? localizeItem(x, t, MAIN[x.id]) : x;
  return { ...data, bills: (data.bills || []).map(item), tasks: (data.tasks || []).map(item),
    reminders: (data.reminders || []).map(r => r?.bills ? { ...r, bills: item(r.bills) } : r) };
}
