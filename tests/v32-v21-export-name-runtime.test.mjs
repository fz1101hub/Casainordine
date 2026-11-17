import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Execute the production filename helpers without importing the JSX component.
const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
const start=source.indexOf('const exportNames=');
const end=source.indexOf('const uuid=',start);
assert.ok(start>=0&&end>start,'V21 export helpers must remain discoverable');
const context=vm.createContext({});
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
