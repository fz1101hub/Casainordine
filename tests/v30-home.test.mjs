import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOME_PREFERENCES, HOME_WIDGETS, normalizeHomePreferences, moveHomeWidget, toggleHomeWidget } from '../lib/home-preferences.mjs';

test('v3 default home is the exact user-selected compact order', () => {
  assert.deepEqual(DEFAULT_HOME_PREFERENCES.widgets, ['bills','shopping','tasks','five_minutes']);
  assert.equal(DEFAULT_HOME_PREFERENCES.layout, 'compact');
});
test('v3 default is restored for unconfigured user', () => assert.deepEqual(normalizeHomePreferences(null), { widgets:['bills','shopping','tasks','five_minutes'], layout:'compact' }));
test('v3 accepts saved subset and expanded layout', () => assert.deepEqual(normalizeHomePreferences({widget_order:['shopping','bills'],layout:'expanded'}), {widgets:['shopping','bills'],layout:'expanded'}));
test('v3 removes untrusted IDs and duplicates', () => assert.deepEqual(normalizeHomePreferences({widgets:['bills','malicious','bills','tasks']} ).widgets,['bills','tasks']));
test('v3 rejects empty lists to keep useful Home', () => assert.deepEqual(normalizeHomePreferences({widgets:[]}).widgets,[...DEFAULT_HOME_PREFERENCES.widgets]));
test('v3 normalizes unsupported layout', () => assert.equal(normalizeHomePreferences({layout:'unsafe'}).layout,'compact'));
test('v3 reorder up and down', () => {
 const prefs = moveHomeWidget(DEFAULT_HOME_PREFERENCES,'shopping',-1);
 assert.deepEqual(prefs.widgets,['shopping','bills','tasks','five_minutes']);
 assert.deepEqual(moveHomeWidget(prefs,'shopping',1).widgets,[...DEFAULT_HOME_PREFERENCES.widgets]);
});
test('v3 does not move a widget outside bounds', () => assert.deepEqual(moveHomeWidget(DEFAULT_HOME_PREFERENCES,'bills',-1).widgets,[...DEFAULT_HOME_PREFERENCES.widgets]));
test('v3 ignores unknown widget and invalid direction', () => assert.deepEqual(moveHomeWidget(DEFAULT_HOME_PREFERENCES,'not-a-widget',1).widgets,[...DEFAULT_HOME_PREFERENCES.widgets]));
test('v3 hides and reactivates widgets', () => {
 const hidden = toggleHomeWidget(DEFAULT_HOME_PREFERENCES,'shopping');
 assert.deepEqual(hidden.widgets,['bills','tasks','five_minutes']);
 assert.deepEqual(toggleHomeWidget(hidden,'shopping').widgets,['bills','tasks','five_minutes','shopping']);
});
test('v3 never hides the final visible widget', () => assert.deepEqual(toggleHomeWidget({widgets:['bills']},'bills').widgets,['bills']));
test('v3 has a distinct catalog entry for every widget', () => assert.equal(new Set(HOME_WIDGETS.map(x=>x.id)).size,HOME_WIDGETS.length));
