import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/MailImporter.jsx',import.meta.url),'utf8');

test('mail requests use the selected language and reload on language changes',()=>{
  assert.match(source,/['"]Accept-Language['"]\s*:\s*language/);
  assert.match(source,/\[client,refresh,language\]/);
  // A cleanup invalidates in-flight responses when the language changes.
  assert.match(source,/return \(\)=>\{loadGeneration\.current\+\+;\}/);
});
