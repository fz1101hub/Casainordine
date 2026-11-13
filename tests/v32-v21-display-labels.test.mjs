import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 display labels use translated categories while preserving export payload',()=>{
 for(const snippet of [
  'categoryLabel(asset.category)',
  'assetCategory(selection.category)',
  'propertyType(passport.property.kind)',
  'documentType(d.doc_type)',
  'categoryLabel={assetCategory}',
  "<DownloadJson name={v21ExportName(language,'property')} object={passport}"
 ]) assert.ok(source.includes(snippet),snippet);
 for(const key of ['extra.maint.category.','extra.propertyType.','extra.documentType.']) assert.ok(source.includes(key));
 assert.ok(!source.includes('{selection.category}'));
 assert.ok(!source.includes('{passport.property.kind}'));
 assert.ok(!source.includes('{d.doc_type}'));
});
