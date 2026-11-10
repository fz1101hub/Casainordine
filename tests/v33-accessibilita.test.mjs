import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const page=source('app/page.jsx'),css=source('app/globals.css');

test('Finestre: ruolo dialog, titolo collegato, focus gestito e pulsante di chiusura con nome',()=>{
  assert.match(page,/className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex=\{-1\} ref=\{dialogRef\}/);
  assert.match(page,/className="modal rate-modal" role="dialog" aria-modal="true" aria-labelledby="rate-modal-title"/);
  assert.match(page,/<h2 id="modal-title">/);
  assert.match(page,/<h2 id="rate-modal-title">/);
  assert.match(page,/onClick=\{\(\)=>setModal\(null\)\} aria-label=\{tr\('ui\.close'\)\}/);
  // In Page la funzione di traduzione si chiama tr: t('ui.close') mandava in errore la finestra del
  // piano rate appena aperta ("t is not defined").
  assert.match(page,/onClick=\{\(\)=>setRatePlan\(null\)\} aria-label=\{tr\('ui\.close'\)\}/);
  const pageBody=page.slice(page.indexOf('export default function'));
  assert.doesNotMatch(pageBody.slice(0,pageBody.indexOf('\nfunction ',1)>0?pageBody.indexOf('\nfunction ',1):undefined),/aria-label=\{t\('/);
  assert.match(page,/if\(dialogRef\.current&&!dialogRef\.current\.contains\(document\.activeElement\)\)dialogRef\.current\.focus\(\);/,'non toglie il focus al campo con autoFocus');
  assert.match(page,/if\(previous\?\.isConnected&&typeof previous\.focus==='function'\)previous\.focus\(\)/);
  assert.match(page,/const onFocus=e=>\{if\(!e\.target\?\.closest\?\.\('\.modal'\)\)lastFocus\.current=e\.target;\};/);
});
test('Finestre: Esc chiude, ma non una bolletta letta da un documento (come il tocco sullo sfondo)',()=>{
  assert.match(page,/if\(e\.key!=='Escape'\)return;if\(dialogState\.current\.ratePlan\)setRatePlan\(null\);else if\(!dialogState\.current\.documentBill\)setModal\(null\);/);
  assert.match(page,/if\(e\.target===e\.currentTarget&&form\.source!=='document'\)setModal\(null\);/);
  assert.match(page,/\},\[dialogOpen\]\);/,'il focus non salta quando cambia il contenuto della finestra');
});
test('Tocco e campi: aree di almeno 44 px e campi a 16 px sui telefoni',()=>{
  assert.match(css,/\.task-check::after\{content:'';position:absolute;inset:-11px\}/);
  assert.match(css,/\.toast button::after\{content:'';position:absolute;inset:-12px\}/);
  assert.match(css,/@media \(max-width:760px\)\{input:not\(\[type=checkbox\]\)[^{]*,select,textarea\{font-size:16px\}\}/);
});
