import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
const rgb=h=>{h=h.replace('#','');if(h.length===3)h=[...h].map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));};
const lum=h=>{const [r,g,b]=rgb(h).map(c=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
const muted=css.match(/--muted:(#[0-9a-f]{6});/i)[1];
const rule=sel=>{const i=css.indexOf(sel+'{');assert.ok(i>=0,sel);return css.slice(i,css.indexOf('}',i));};

test('Contrasto: testo secondario almeno 4,5:1 su bianco, sfondo pagina e etichette',()=>{
  for(const bg of ['#ffffff','#f7f9f7','#f1f4f1'])assert.ok(ratio(muted,bg)>=4.5,`${muted} su ${bg}: ${ratio(muted,bg).toFixed(2)}`);
});
test('Contrasto: fornitore, scadenze, totali ed etichette usano il colore leggibile e almeno 12 px',()=>{
  for(const sel of ['.mini-bill-info small,.table-identity small','.chart-total small','.tag','.stat-card small','.task-title small','.bills-table th']){
    const r=rule(sel);
    assert.match(r,/color:var\(--muted\)/,sel);
    const sizes=[...r.matchAll(/font-size:([0-9.]+)px|font:\d{3} ([0-9.]+)px/g)].map(m=>Number(m[1]||m[2]));
    for(const size of sizes)assert.ok(size>=12,`${sel}: ${size}px`);
  }
  assert.match(rule('.muted'),/color:var\(--muted\)/);
});
test('Contrasto: nessun grigio chiaro rimasto come colore del testo sugli sfondi chiari',()=>{
  const offenders=[];
  for(const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const sel=m[1],c=m[2].match(/(?<![-\w])color:(#[0-9a-fA-F]{3,6})\b/)?.[1];
    if(!c||/auth-decoration|auth-intro|auth-quote|task-check|testdrive|::placeholder/.test(sel))continue;
    // Se la regola ha un proprio sfondo (pulsanti colorati), il testo si misura su quello.
    const bg=m[2].match(/background(?:-color)?:(#[0-9a-fA-F]{3,6})\b/)?.[1]||'#ffffff';
    const [r,g,b]=rgb(c);
    if(Math.max(r,g,b)-Math.min(r,g,b)<40&&r+g+b>300&&ratio(c,bg)<4.5)offenders.push(sel.trim()+' '+c);
  }
  assert.deepEqual(offenders,[]);
});
test('Contrasto: il bianco su un pulsante scuro non è un grigio chiaro, su uno chiaro sì',()=>{
  assert.ok(ratio('#fff','#b34a3a')>=4.5);
  assert.ok(ratio('#fff','#f2f6f3')<4.5);
});
