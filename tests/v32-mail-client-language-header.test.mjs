import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/MailImporter.jsx', import.meta.url), 'utf8');

test('mail API requests send the selected language, not only the browser default', () => {
  assert.match(source, /const \{t:tr,money,locale,language\}=useLanguage\(\)/);
  assert.match(source, /mailRequest\(client,path,method,payload,tr,language\)/);
  assert.match(source, /'Accept-Language':language/);
  assert.match(source, /Authorization:`Bearer \$\{session\.access_token\}`/);
});

test('mail errors are interpreted using the same selected language', () => {
  assert.match(source, /safeMailApiMessage\(result\.error,language\)/);
});
