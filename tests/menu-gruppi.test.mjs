import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MENU_TOP, MENU_BOTTOM, MENU_GROUPS, menuGroupOf, readOpenGroups, saveOpenGroups, toggleGroup, withPageGroup } from '../lib/menu-groups.mjs';
import { TRANSLATIONS } from '../lib/i18n.mjs';

const page = readFileSync(new URL('../app/page.jsx', import.meta.url), 'utf8');
const menuIds = [...page.match(/const menu = \[([\s\S]*?)\n\];/)[1].matchAll(/\{id:'([a-z]+)'/g)].map(m => m[1]);
const memory = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) }; };

test('ogni voce del menu sta in un solo posto', () => {
  const placed = [...MENU_TOP, ...MENU_GROUPS.flatMap(g => g.items), ...MENU_BOTTOM];
  assert.equal(new Set(placed).size, placed.length, 'nessuna voce ripetuta');
  assert.deepEqual([...placed].sort(), [...menuIds].sort(), 'tutte le voci del menu, nessuna in più');
  assert.ok(menuIds.length >= 40);
});

test('quattro gruppi, nessuno troppo lungo', () => {
  assert.deepEqual(MENU_GROUPS.map(g => g.id), ['money', 'home', 'family', 'tools']);
  for (const g of MENU_GROUPS) assert.ok(g.items.length >= 4 && g.items.length <= 12, g.id);
  assert.equal(menuGroupOf('bills'), 'money');
  assert.equal(menuGroupOf('rental'), 'home');
  assert.equal(menuGroupOf('sos'), 'family');
  assert.equal(menuGroupOf('automations'), 'tools');
  assert.equal(menuGroupOf('dashboard'), null);
});

test('gruppi aperti: si ricordano, si aprono con la pagina, dati sporchi ignorati', () => {
  const s = memory();
  assert.deepEqual(readOpenGroups(s), []);
  saveOpenGroups(s, ['home', 'home', 'boh']);
  assert.deepEqual(readOpenGroups(s), ['home']);
  s.setItem('cio-menu-groups', '{rotto');
  assert.deepEqual(readOpenGroups(s), []);
  s.setItem('cio-menu-groups', '"money"');
  assert.deepEqual(readOpenGroups(s), []);
  assert.deepEqual(toggleGroup(['home'], 'home'), []);
  assert.deepEqual(toggleGroup([], 'tools'), ['tools']);
  assert.deepEqual(withPageGroup(['home'], 'bills'), ['home', 'money']);
  assert.deepEqual(withPageGroup(['money'], 'bills'), ['money']);
  assert.deepEqual(withPageGroup(['home'], 'dashboard'), ['home']);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.deepEqual(readOpenGroups(broken), []);
  saveOpenGroups(broken, ['home']);
});

test('intestazioni accessibili e tradotte', () => {
  assert.match(page, /className="nav-group-head" aria-expanded=\{open\} aria-controls=\{`nav-group-\$\{group\.id\}`\}/);
  assert.match(page, /className="nav-group-items" hidden=\{!open\}/);
  assert.match(page, /aria-current=\{tab===id\?'page':undefined\}/);
  for (const g of MENU_GROUPS) for (const [lang, dict] of Object.entries(TRANSLATIONS)) assert.ok(dict['nav.group.' + g.id], `nav.group.${g.id} in ${lang}`);
});
