import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';
const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
test('V21 briefing text and privacy copy exist in six languages',()=>{
 const langs=['it','en','es','fr','de','pt'];
 const copies=langs.map(v21BriefingCopy);
 const keys=Object.keys(copies[0]);
 assert.equal(keys.length,52);
 for(const copy of copies){assert.deepEqual(Object.keys(copy),keys);for(const value of Object.values(copy))assert.ok(value.trim());}
 for(const key of keys)assert.ok(source.includes('briefingCopy.'+key),key);
 assert.deepEqual(v21BriefingCopy('unknown'),v21BriefingCopy('it'));
 assert.match(source,/v21BriefingCopy\(language\)/);
});

test('V21 radar and simulator labels and safety caveats are localized',()=>{
 for(const key of ['signalsToReview','signalsNotProof','noInconsistencies','expectedRefunds','refundSaved','refundLabel','expectedAmount','expectedDate','optionalBill','noneLabel','saveRefund','refundReceivedFeedback','receivedLabel','expectedLabel','simulateScenario','scenarioExplanation','monthlyBaseline','consumptionShare','consumptionReduction','otherDelta','unexpectedCost','monthsHorizon','simulationResult','newMonthlySpending','projectedTotal','changeFromBaseline','overPeriod','monthsSuffix','estimateDisclaimer','checkValues']){
  assert.ok(source.includes('briefingCopy.'+key),key);
 }
});

test('V21 QR passport privacy and protected fields use account language',()=>{
 for(const key of ['qrPassport','qrPrivacy','chooseMaintenanceAsset','selectPlaceholder','addMaintenanceFirst','protectedAsset','noNotes','warrantyLabel','nextMaintenance','modelLabel','serialNumber','roomLabel','openAttachment','documentPrefix','scanOrSelect']){
  assert.ok(source.includes('briefingCopy.'+key),key);
 }
});
