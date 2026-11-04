import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v20UiCopy} from '../lib/v20-ui-copy.mjs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
test('V20 monitoring and fraud screen copy exists in all six languages',()=>{
 const langs=['it','en','es','fr','de','pt'];
 const copies=langs.map(v20UiCopy);
 const keys=Object.keys(copies[0]);
 assert.equal(keys.length,114);
 for(const copy of copies){assert.deepEqual(Object.keys(copy),keys);for(const value of Object.values(copy))assert.ok(value.trim().length>0);}
 // Shared terms (for example Code and Elemento) are valid across languages.
 // Validate each language has distinct meaningful prose, without demanding unique words for every label.
 for(const key of ['monitorDescription','fraudCheckDisclaimer','pagopaDebtWarning','trashRetentionNotice'])assert.ok(new Set(copies.map(copy=>copy[key])).size>=5,`Missing language variation for ${key}`);
 assert.deepEqual(v20UiCopy('unknown'),v20UiCopy('it'));
});
test('V20 renders localized headings rather than fixed Italian strings',()=>{
 assert.match(source,/v20UiCopy\(language\)/);
 for(const key of Object.keys(v20UiCopy('it')))assert.ok(source.includes('ui.'+key));
});

test('V20 destructive actions use localized confirmation and feedback',()=>{
 assert.match(source,/window\.confirm\(ui\.confirmDelete\)/);
 assert.match(source,/window\.confirm\(ui\.confirmRestore\)/);
 assert.match(source,/onNotify\(ui\.deleted\)/);
 assert.match(source,/onNotify\(ui\.restored\)/);
});

test('pagoPA validation and payment warning follow the account language',()=>{
 for(const key of ['noticeCodeInvalid','noticeReminderRequiresDetails','confirmNoticeOriginal','noticeAndReminderSaved','noticeSaved']){
  assert.ok(source.includes('ui.'+key));
 }
 assert.match(source,/window\.confirm\(ui\.confirmNoticeOriginal\)/);
});

test('pagoPA local scan feedback is localized',()=>{
 for(const key of ['multipleNoticeCodes','suggestedNoticeCode','unrecognizedNoticeCode','noticeFileTypes','noticeReadingLocal','noticeScanFailed']){
  assert.ok(source.includes('ui.'+key));
 }
});

test('offline import and moving-plan feedback are localized',()=>{
 for(const key of ['signInToImport','selectWritableHome','confirmAddShopping','shoppingAdded','taskSynced','syncFailed','movePlanCreated','moveStepsPartial','movePlanAndStepsCreated']){
  assert.ok(source.includes('ui.'+key));
 }
 assert.match(source,/window\.confirm\(ui\.confirmAddShopping\)/);
});

test('monitoring caveats and notification controls use selected language',()=>{
 for(const key of ['dailyCheck','fraudCheck','missingBillsCaveat','mailHealthDescription','pushMonitorLabel','pushMonitorSaved','never','read']){
  assert.ok(source.includes('ui.'+key));
 }
});

test('fraud review form and IBAN privacy explanation are localized',()=>{
 for(const key of ['fraudPrivacyDescription','billLabel','select','senderLabel','emailAuthLabel','authUnknown','authPassed','authFailed','ibanLabel','ibanPlaceholder','analyze','saveReview']){
  assert.ok(source.includes('ui.'+key));
 }
});

test('fraud result warnings and review actions use localized copy',()=>{
 for(const key of ['reviewRequired','noWarningSigns','fraudCheckDisclaimer','manuallyReviewed','reviewedLabel','markedSuspicious','suspiciousLabel','noAnomalies']){
  assert.ok(source.includes('ui.'+key));
 }
});

test('pagoPA form labels and opt-in reminder consent are localized',()=>{
 for(const key of ['publicNotices','readNotice','fileOrScreenshot','copiedText','pasteNotice','findCodeInText','noticeCodeLabel','creditorCodeLabel','authorityLabel','createBillReminderLabel','registerNotice','registeredNotices']){
  assert.ok(source.includes('ui.'+key));
 }
});

test('pagoPA notice list and official payment caveat are localized',()=>{
 for(const key of ['deleteLabel','pagopaNotice','codeLabel','amountNeedsReview','noNotices','pagopaDebtWarning','officialPagopa','amountLabel','dueDateLabel']){
  assert.ok(source.includes('ui.'+key));
 }
 assert.match(source,/https:\/\/www\.pagopa\.gov\.it\//);
});

test('audit history and recoverable trash warnings use localized copy',()=>{
 for(const key of ['transparencyRecovery','recentActivity','userLabel','automaticProcess','noAuditEvents','recoverableTrash','restoreLabel','itemLabel','deletedOn','trashEmpty','trashRetentionNotice']){
  assert.ok(source.includes('ui.'+key));
 }
});
