import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';
const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
test('V21 briefing text and privacy copy exist in six languages',()=>{
 const langs=['it','en','es','fr','de','pt'];
 const copies=langs.map(v21BriefingCopy);
 const keys=Object.keys(copies[0]);
 assert.equal(keys.length,193);
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

test('V21 selective property dossier and export privacy are localized',()=>{
 for(const key of ['propertyDossier','dossierPrivacy','propertyLabel','includeAddress','includeSerials','exportDossier','printPdf','dossierPreview','equipmentLabel','contractsLabel','documentsLabel','maintenanceEvents','maintenancePrefix','informationalDocument','registerPropertyFirst']){
  assert.ok(source.includes('briefingCopy.'+key),key);
 }
});

test('family voting does not authorize payments and follows selected language',()=>{
 for(const key of ['decisionsSharedOnly','proposeDecision','proposalPublished','titleLabel','decisionReason','proposedBudget','voteDeadline','publishProposal','proposalsAndVotes','budgetLabel','voteOpen','voteClosed','deadline','votesYes','votesNo','votesAbstain','voteYes','voteNo','voteAbstain','votingClosedFeedback','closeVoting','voteNotPayment']){
  assert.ok(source.includes('briefingCopy.'+key),key);
 }
});

test('SOS privacy, offline encryption and deletion confirmations are localized',()=>{
 for(const key of ['emergencyInstructions','emergencyDisclaimer','valvesLocation','procedures','contactLabel','phoneLabel','updateCard','saveCard','cancelEditing','savedOfflineSos','sosEncryptionNotice','devicePassphrase','editLabel','saveEncryptedOffline','openOfflineDrafts','encryptedCopyExists','noOfflineCopy','confirmDeleteSos','localCopyDeleted','deleteLocalCopy']){
  assert.ok(source.includes('briefingCopy.'+key),key);
 }
 assert.match(source,/confirm\(briefingCopy\.confirmDeleteSos\)/);
});

test('vacation links, expiry and restricted sharing copy are localized',()=>{
 for(const key of ['planAbsence','periodName','departure','returnDate','personalHomeNotes','createChecklist','checklistUpdated','deleteVacationPlan','limitedSharing','sharingPrivacy','planLabel','choosePlaceholder','specificInstructions','sharingPlaceholder','linkDuration','hours24','days3','days7','createTemporaryLink','copyNowWarning','linkCopied','copyManually','copyLabel','shareRevokedFeedback','revokeLabel','vacationLabel','revokedLabel','activeUntilExpiry']){
  assert.ok(source.includes('briefingCopy.'+key),key);
 }
});

test('insured inventory forms, document links and estimate caveat use localized copy',()=>{
 for(const key of ['registerInsuredItem','itemRegistered','objectLabel','estimatedValue','propertyLabel','notSpecified','choosePhoto','archivePhoto','noneMasculine','relatedAsset','notesLabel','saveInventory','inventoryDocumentation','itemsCount','estimatedValueSuffix','linkedDocumentsCount','exportList','documentButton','roomNotSpecified','documentLinked','addReceiptPhoto','inventoryDisclaimer']){
  assert.ok(source.includes('briefingCopy.'+key),key);
 }
});

test('V21 navigation and dynamic feedback use account language',()=>{
 for(const key of ['sosUpdated','sosSaved','sosEncrypted','vacationCreated','chooseSharePlan','confirmShareLink','shareLinkCreated','photoTypeLimit','itemPhotoName','inventoryPhotoNotes','photoSaved','photoUploadFailed','voteSaved','tabTags','tabSos','tabRadar','tabSimulator','tabPassport','tabVacation','tabInventory','tabDecisions','tabBriefing','eyebrow','sharedHomeInfo','personalInfo','permissionNotice','loadingData','demoMode','enableDatabase','readOnlyHome','confirmDeletePermanent','itemDeleted','operationFailed','migrationRequired']){
  assert.ok(source.includes('briefingCopy.'+key),key);
 }
 assert.match(source,/confirm\(briefingCopy\.confirmDeletePermanent\)/);
 assert.match(source,/confirm\(briefingCopy\.confirmShareLink\)/);
});
