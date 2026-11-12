'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, LockOpen, KeyRound } from 'lucide-react';
import { deriveKey, makeVerifier, newSalt, openCard, phraseMatches, phraseProblem, scopeOf, sealCard } from '../lib/sos-vault.mjs';
import { askConfirm, askText } from './ConfirmDialog';

const PROBLEM_KEYS = { short: 'sos.phraseShort', mismatch: 'sos.phraseMismatch' };
const BLANK = { title: '', location_hint: '', instructions: '', contact_label: '', contact_phone: '' };

// Schede SOS cifrate con la frase della casa (supabase/migrate_v40_sos_cifrate.sql).
// La chiave resta solo in memoria: si perde ricaricando l'app o premendo «Blocca».
export function useSosVault({ client, user, homeId, demo, cards }) {
  const scope = scopeOf(homeId, user?.id);
  const [keyRow, setKeyRow] = useState(null), [ready, setReady] = useState(false);
  const [key, setKey] = useState(null), [plain, setPlain] = useState(() => new Map());
  const scopeRef = useRef(scope);
  const loadKey = useCallback(async () => {
    if (!client || demo || !user?.id) { setKeyRow(null); setReady(true); return null; }
    const query = client.from('home_sos_keys').select('id,salt,verifier,updated_at');
    const { data, error } = await (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user.id).is('home_id', null)).maybeSingle();
    // Senza la migrazione v4.0 la tabella non c'è: le schede restano in chiaro come prima.
    const row = error ? null : data || null;
    if (scopeRef.current === scope) { setKeyRow(row); setReady(true); }
    return row;
  }, [client, demo, homeId, user?.id, scope]);
  // Cambiando casa si dimentica la chiave della casa precedente.
  useEffect(() => { scopeRef.current = scope; setKey(null); setPlain(new Map()); setReady(false); loadKey(); }, [scope, loadKey]);
  // Se un altro membro cambia la frase, la chiave in memoria non vale più.
  useEffect(() => { if (key && keyRow && key.salt !== keyRow.salt) { setKey(null); setPlain(new Map()); } }, [key, keyRow]);
  useEffect(() => {
    let active = true;
    if (!key) { setPlain(new Map()); return; }
    (async () => {
      const next = new Map();
      for (const card of cards || []) {
        if (!card.sealed) continue;
        try { next.set(card.id, await openCard(card.sealed, key.cryptoKey, scope)); } catch { next.set(card.id, null); }
      }
      if (active) setPlain(next);
    })();
    return () => { active = false; };
  }, [cards, key, scope]);

  const isProtected = Boolean(keyRow);
  async function unlock(phrase) {
    if (!keyRow) return false;
    const cryptoKey = await deriveKey(phrase, keyRow.salt);
    if (!(await phraseMatches(keyRow.verifier, cryptoKey, scope))) return false;
    setKey({ cryptoKey, salt: keyRow.salt });
    return true;
  }
  function lock() { setKey(null); setPlain(new Map()); }
  // Testo da salvare: in una casa protetta i campi in chiaro restano vuoti.
  async function payloadFor(card) {
    if (!isProtected) return card;
    if (!key) throw new Error('sos-locked');
    // Se nel frattempo un altro membro ha cambiato la frase, la chiave in memoria è vecchia:
    // la scheda diventerebbe illeggibile per tutti. Si blocca e si chiede la frase nuova.
    const current = await loadKey();
    if (!current || current.salt !== key.salt) { lock(); throw new Error('sos-locked'); }
    return { ...BLANK, sealed: await sealCard(card, key.cryptoKey, scope) };
  }
  // Sceglie o cambia la frase: tutte le schede vengono cifrate di nuovo in un solo passaggio.
  async function setPhrase(phrase) {
    const salt = newSalt(), cryptoKey = await deriveKey(phrase, salt);
    const sealedCards = [];
    for (const card of cards || []) {
      const content = card.sealed ? plain.get(card.id) : card;
      if (!content) throw new Error('sos-unreadable');
      sealedCards.push({ id: card.id, sealed: await sealCard(content, cryptoKey, scope) });
    }
    const verifier = await makeVerifier(cryptoKey, scope);
    const { error } = await client.rpc('v40_set_sos_key', { scope_home: homeId || null, new_salt: salt, new_verifier: verifier, cards: sealedCards });
    if (error) throw Object.assign(new Error('sos-save'), { cause: error });
    // Prima il sale nuovo, poi la chiave: altrimenti il controllo qui sopra la scarterebbe.
    setKeyRow(row => ({ ...(row || {}), salt, verifier }));
    setKey({ cryptoKey, salt });
    await loadKey();
  }
  async function reset() {
    const { error } = await client.rpc('v40_reset_sos', { scope_home: homeId || null });
    if (error) throw Object.assign(new Error('sos-reset'), { cause: error });
    lock(); await loadKey();
  }
  // Contenuto da mostrare: le schede cifrate solo dopo lo sblocco.
  function view(card) {
    if (!card.sealed) return { ...card, locked: false, unreadable: false };
    const content = plain.get(card.id);
    return { ...card, ...(content || BLANK), locked: !key, unreadable: Boolean(key) && content === null };
  }
  return { ready, scope, keyRow, isProtected, isOpen: Boolean(key), unlock, lock, payloadFor, setPhrase, reset, view, reloadKey: loadKey };
}

function PhraseFields({ t, phrase, confirm, onPhrase, onConfirm, label, withConfirm = true }) {
  return <>
    <label className="extra-field">{label || t('sos.phrase')}<input type="password" minLength={10} autoComplete="new-password" value={phrase} onChange={e => onPhrase(e.target.value)}/></label>
    {withConfirm && <label className="extra-field">{t('sos.confirmPhrase')}<input type="password" minLength={10} autoComplete="new-password" value={confirm} onChange={e => onConfirm(e.target.value)}/></label>}
  </>;
}

// Riquadro della frase: proteggere, aprire, bloccare, cambiare, ricominciare.
export function SosProtectionCard({ vault, t, canWrite, demo, onNotify, onChanged, failed }) {
  const [phrase, setPhrase] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('main');
  const clear = () => { setPhrase(''); setConfirm(''); };
  async function run(task) {
    setBusy(true);
    try { await task(); } catch (e) {
      const code = e?.cause?.message || '';
      onNotify(/sos_cards_changed/.test(code) ? t('sos.changedMeanwhile') : e?.message === 'sos-unreadable' ? t('sos.unreadable') : failed);
    } finally { setBusy(false); }
  }
  function checked(withConfirm = true) {
    const problem = phraseProblem(phrase, withConfirm ? confirm : undefined);
    if (problem) { onNotify(t(PROBLEM_KEYS[problem])); return false; }
    return true;
  }
  if (!vault.ready) return null;
  if (!vault.isProtected) {
    if (!canWrite || demo) return <div className="sos-protection"><p><Lock size={16}/> {t('sos.viewerNoPhrase')}</p></div>;
    return <form className="sos-protection extra-form" onSubmit={e => { e.preventDefault(); if (!checked()) return; run(async () => { await vault.setPhrase(phrase); clear(); onNotify(t('sos.protected')); await onChanged(); }); }}>
      <h3><KeyRound size={18}/> {t('sos.protectTitle')}</h3>
      <p>{t('sos.protectHelp')}</p>
      <PhraseFields t={t} phrase={phrase} confirm={confirm} onPhrase={setPhrase} onConfirm={setConfirm}/>
      <button className="btn btn-primary" disabled={busy}>{t('sos.protectButton')}</button>
    </form>;
  }
  if (!vault.isOpen) {
    return <div className="sos-protection">
      <form className="extra-form" onSubmit={e => { e.preventDefault(); run(async () => { const ok = await vault.unlock(phrase); if (!ok) { onNotify(t('sos.wrongPhrase')); return; } clear(); }); }}>
        <h3><Lock size={18}/> {t('sos.lockedTitle')}</h3>
        <p>{t('sos.lockedHelp')}</p>
        <PhraseFields t={t} phrase={phrase} onPhrase={setPhrase} withConfirm={false} label={t('sos.phrase')}/>
        <button className="btn btn-primary" disabled={busy || !phrase}>{t('sos.unlock')}</button>
      </form>
      {canWrite && !demo && <details className="sos-forgot"><summary>{t('sos.forgotTitle')}</summary><p>{t('sos.forgotHelp')}</p>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={async () => { if ((await askConfirm(t('sos.resetConfirm'),{danger:true}))) run(async () => { await vault.reset(); clear(); onNotify(t('sos.resetDone')); await onChanged(); }); }}>{t('sos.resetButton')}</button></details>}
    </div>;
  }
  return <div className="sos-protection">
    <p className="sos-open"><LockOpen size={16}/> {t('sos.lockedTitle')} <button type="button" className="btn btn-soft" onClick={() => { vault.lock(); clear(); setMode('main'); }}>{t('sos.lock')}</button></p>
    {canWrite && !demo && (mode === 'change'
      ? <form className="extra-form" onSubmit={e => { e.preventDefault(); if (!checked()) return; run(async () => { await vault.setPhrase(phrase); clear(); setMode('main'); onNotify(t('sos.changed')); await onChanged(); }); }}>
          <h3>{t('sos.changeTitle')}</h3>
          <PhraseFields t={t} phrase={phrase} confirm={confirm} onPhrase={setPhrase} onConfirm={setConfirm} label={t('sos.newPhrase')}/>
          <button className="btn btn-primary" disabled={busy}>{t('sos.changeButton')}</button>
        </form>
      : <button type="button" className="btn btn-soft" onClick={() => setMode('change')}>{t('sos.changeTitle')}</button>)}
  </div>;
}
