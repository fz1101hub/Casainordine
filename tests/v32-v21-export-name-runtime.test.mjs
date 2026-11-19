import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeLanguage} from '../lib/i18n-core.mjs';

// Execute the production filename helpers without importing the JSX component.
const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
const start=source.indexOf('const exportNames=');
const end=source.indexOf('const uuid=',start);
assert.ok(start>=0&&end>start,'V21 export helpers must remain discoverable');
const context=vm.createContext({normalizeLanguage});
vm.runInContext(source.slice(start,end)+'\nthis.exportName=v21ExportName;',context);
const exportName=context.exportName;
const expected={
 it:['passaporto-immobile','inventario-assicurativo','casa-in-5-minuti'],
 en:['property-passport','insurance-inventory','home-in-5-minutes'],
 es:['pasaporte-inmueble','inventario-seguro','casa-en-5-minutos'],
 fr:['passeport-logement','inventaire-assurance','maison-en-5-minutes'],
 de:['immobilienpass','versicherungsinventar','zuhause-in-5-minuten'],
 pt:['passaporte-imovel','inventario-seguro','casa-em-5-minutos']
};
test('V21 JSON export names follow all six supported languages',()=>{
 for(const [lang,stems] of Object.entries(expected)){
  for(const [index,type] of ['property','inventory','briefing'].entries()){
   assert.equal(exportName(lang,type,'2026-11-17'),stems[index]+(type==='briefing'?'-2026-11-17':'')+'.json');
  }
 }
});
test('V21 filenames reject invalid dates and unsupported export types',()=>{
 for(const date of ['2026-02-29','2026-13-01','2026-04-31','2026-00-01','2026-01-00','2026-1-1','not-a-date',null]){
  assert.equal(exportName('en','briefing',date),'home-in-5-minutes.json');
 }
 assert.equal(exportName('en','briefing','2024-02-29'),'home-in-5-minutes-2024-02-29.json');
 assert.equal(exportName('en','other','2026-11-17'),null);
});
test('V21 export filenames fall back to Italian for unsupported locale',()=>{
 assert.equal(exportName('xx','property','2026-11-17'),'passaporto-immobile.json');
 assert.equal(exportName('__proto__','property','2026-11-17'),'passaporto-immobile.json');
});

test('V21 briefing date validation handles Gregorian century boundaries',()=>{
 const valid=['2000-02-29','2400-02-29','1900-02-28','2100-02-28','2026-12-31','0001-01-01'];
 const invalid=['1900-02-29','2100-02-29','0000-01-01','2026-06-31','2026-11-31','2026-02-30','2026-12-32','2026-01-01T00:00:00Z'];
 for(const date of valid)assert.equal(exportName('fr','briefing',date),'maison-en-5-minutes-'+date+'.json');
 for(const date of invalid)assert.equal(exportName('fr','briefing',date),'maison-en-5-minutes.json');
});
test('V21 export names reject inherited or unexpected keys without altering locale',()=>{
 for(const type of ['constructor','toString','__proto__','hasOwnProperty','PROPERTY','',null]){
  assert.equal(exportName('de',type,'2026-11-17'),null);
 }
 for(const locale of ['constructor','toString','__proto__',null]){
  assert.equal(exportName(locale,'inventory','2026-11-17'),'inventario-assicurativo.json');
 }
});

test('V21 regional and uppercase locale tags retain their translated filenames',()=>{
 for(const [locale,base] of [['EN','en'],['en-GB','en'],['es-ES','es'],['fr-FR','fr'],['de-DE','de'],['pt-PT','pt'],['en_US','en']]){
  assert.equal(exportName(locale,'inventory','2026-11-17'),exportName(base,'inventory','2026-11-17'));
 }
});
