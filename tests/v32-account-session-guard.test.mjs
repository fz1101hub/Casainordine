import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Static safety regression only: real server authorization and two-account tests remain required.
test('account deletion checks authenticated identity before sending destructive request',()=>{
 const source=readFileSync(fileURLToPath(new URL('../app/AccountSecurity.jsx',import.meta.url)),'utf8');
 const panel=source.slice(source.indexOf('export function DeleteAccountPanel'));
 const session=panel.indexOf('await client.auth.getSession()');
 const guard=panel.indexOf('!session?.access_token || session.user?.id !== user?.id');
 const request=panel.indexOf("fetch('/api/account/delete'");
 assert.ok(session>=0&&guard>session&&request>guard,'session and user identity must be checked before deletion request');
 assert.match(panel,/onNotify\(t\('account\.deleteFailed'\)\)/);
 assert.doesNotMatch(panel,/Bearer \$\{session\?\.access_token\s*\|\|\s*''\}/);
});
