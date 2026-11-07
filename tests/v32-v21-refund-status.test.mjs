import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';

test('V21 refund statuses are localized without changing persisted codes',()=>{
 const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
 assert.match(source,/r\.status==='received'\?briefingCopy\.receivedLabel/);
 assert.match(source,/r\.status==='expected'\?briefingCopy\.expectedLabel/);
 assert.match(source,/briefingCopy\.expectedLabel:r\.status/);
 for(const lang of ['it','en','es','fr','de','pt']){
  const copy=v21BriefingCopy(lang);
  assert.ok(typeof copy.receivedLabel==='string'&&copy.receivedLabel.trim(),lang);
  assert.ok(typeof copy.expectedLabel==='string'&&copy.expectedLabel.trim(),lang);
  assert.notEqual(copy.receivedLabel,copy.expectedLabel,lang);
 }
 assert.equal(v21BriefingCopy('en').receivedLabel,'Received');
 assert.equal(v21BriefingCopy('en').expectedLabel,'Expected');
});
