import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 temporary vacation share details are cleared on account or home switch',()=>{
 const effect=/useEffect\(\(\)=>\{setShareLink\(''\);setSharePlan\(''\);setShareText\(''\);\},\[user\?\.id,homeId\]\)/;
 assert.match(source,effect);
 assert.match(source,/\{shareLink&&<div className="extra-alert">/);
 assert.match(source,/shareContextRef\.current\.userId===shareContext\.userId&&shareContextRef\.current\.homeId===shareContext\.homeId/);
});
