import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrate_v32_languages.sql',import.meta.url),'utf8');
test('language preference is per-account with six allowed languages',()=>{
 assert.match(sql,/user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
 assert.match(sql,/CHECK\s*\(language IN \('it','en','es','fr','de','pt'\)\)/i);
 assert.match(sql,/ALTER TABLE public\.user_language_preferences ENABLE ROW LEVEL SECURITY/i);
 assert.match(sql,/REVOKE ALL ON public\.user_language_preferences FROM PUBLIC, anon/i);
});
test('language preference policies scope every operation to auth.uid()',()=>{
 for(const verb of ['SELECT','INSERT','UPDATE','DELETE']){
  const re=new RegExp('CREATE POLICY\\s+user_language_preferences_\\w+\\s+ON\\s+public\\.user_language_preferences\\s+FOR\\s+'+verb+'\\s+TO\\s+authenticated\\s+([\\s\\S]*?);','i');
  const match=sql.match(re);
  assert.ok(match,'Missing policy for '+verb);
  assert.match(match[1],/\(select auth\.uid\(\)\)\s*=\s*user_id/i);
  if(verb==='INSERT'||verb==='UPDATE')assert.match(match[1],/WITH CHECK\s*\(\(select auth\.uid\(\)\)\s*=\s*user_id\)/i);
  if(verb==='SELECT'||verb==='UPDATE'||verb==='DELETE')assert.match(match[1],/USING\s*\(\(select auth\.uid\(\)\)\s*=\s*user_id\)/i);
 }
});
