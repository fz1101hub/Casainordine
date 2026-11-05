import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/LanguageProvider.jsx',import.meta.url),'utf8');

test('language preference save errors are scoped to the latest selection and account',()=>{
 assert.match(source,/const epoch=\+\+selectionEpoch\.current/);
 assert.match(source,/const selectedAccount=accountId/);
 assert.match(source,/currentAccount\.current===selectedAccount/);
 assert.match(source,/selectionEpoch\.current===epoch/);
 assert.match(source,/user_id:selectedAccount/);
});

test('sign-out cannot overwrite a newer manual language selection',()=>{
 assert.match(source,/if\(!user\)\{if\(active&&request===authRequest\.current&&selectionEpoch\.current===epoch\)/);
});

test('unavailable preference storage reports failure for authenticated users',()=>{
 assert.match(source,/if\(!client\)\{if\(selectionEpoch\.current===epoch&&currentAccount\.current===selectedAccount\)setSaveError/);
});
