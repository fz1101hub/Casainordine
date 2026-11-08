import test from 'node:test';
import assert from 'node:assert/strict';
import {safeMailApiMessage} from '../lib/mail-api-errors.mjs';

test('known mail API messages translate across all six languages',()=>{
 const expected={it:'Non autorizzato',en:'Unauthorized',es:'No autorizado',fr:'Non autorisé',de:'Nicht autorisiert',pt:'Não autorizado'};
 for(const [language,value] of Object.entries(expected))assert.equal(safeMailApiMessage(' Non autorizzato ',language),value);
});
test('unknown provider diagnostics never reach UI',()=>{
 for(const value of ['IMAP password invalid: secret','Internal stack trace','',null,undefined,{error:'secret'}])assert.equal(safeMailApiMessage(value,'en'),null);
});
test('known error punctuation and locale variants remain supported',()=>{
 assert.equal(safeMailApiMessage('Richiesta non valida','en-GB'),'Invalid request.');
 assert.equal(safeMailApiMessage('Bolletta non trovata.','pt-PT'),'Fatura não encontrada.');
});
