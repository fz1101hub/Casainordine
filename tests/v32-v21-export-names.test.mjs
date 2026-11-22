import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the actual pure export-name implementation without importing JSX in Node.
const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
const start=source.indexOf('const exportNames=');
const end=source.indexOf('const uuid=',start);
assert.ok(start>=0&&end>start,'V21 export-name implementation must exist');
const normalizeLanguage=value=>['it','en','es','fr','de','pt'].includes(value)?value:'it';
const getName=new Function('normalizeLanguage',source.slice(start,end)+';return v21ExportName;')(normalizeLanguage);

test('V21 export names are translated for all six supported languages',()=>{
 const expected={
  it:['passaporto-immobile','inventario-assicurativo','casa-in-5-minuti'],
  en:['property-passport','insurance-inventory','home-in-5-minutes'],
  es:['pasaporte-inmueble','inventario-seguro','casa-en-5-minutos'],
  fr:['passeport-logement','inventaire-assurance','maison-en-5-minutes'],
  de:['immobilienpass','versicherungsinventar','zuhause-in-5-minuten'],
  pt:['passaporte-imovel','inventario-seguro','casa-em-5-minutos']
 };
 for(const [lang,names] of Object.entries(expected)){
  for(const [index,type] of ['property','inventory','briefing'].entries()){
   assert.equal(getName(lang,type),names[index]+'.json',lang+' '+type);
  }
 }
 assert.equal(getName('unknown','property'),'passaporto-immobile.json');
 assert.equal(getName('en','unknown'),null);
});

test('V21 briefing filename appends only valid calendar dates',()=>{
 assert.equal(getName('en','briefing','2024-02-29'),'home-in-5-minutes-2024-02-29.json');
 for(const invalid of ['2023-02-29','1900-02-29','2024-04-31','2024-13-01','2024-00-01','2024-01-00','2024-1-1','../../private','']){
  assert.equal(getName('en','briefing',invalid),'home-in-5-minutes.json',invalid);
 }
 assert.equal(getName('en','briefing','2000-02-29'),'home-in-5-minutes-2000-02-29.json');
 assert.equal(getName('en','inventory','2024-02-29'),'insurance-inventory.json');
});
