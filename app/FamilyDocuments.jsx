'use client';
// Documenti di famiglia in scadenza (scelta dell'utente del 26 novembre 2026, notte): per ogni
// persona carta d'identità, passaporto, patente, tessera sanitaria, permesso di soggiorno e altri,
// con la scadenza e il preavviso. «Rinnovato» chiede solo la nuova scadenza. Niente numeri né
// scansioni dei documenti. Gli avvisi li manda il lavoro giornaliero (lib/document-alerts.mjs).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IdCard, Plus, Pencil, Trash2, Info, RefreshCw, School } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { selectAll } from '../lib/select-all.mjs';
import { DOC_KINDS, DOC_NOTICE, NOTICE_CHOICES, DOC_LIMITS, normalizeDocument, documentAgenda, holderSuggestions, suggestedRenewal, schoolEnrollments } from '../lib/family-documents.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const DEMO_KEY = 'casainordine-iddocs-demo';
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const blank = () => ({ id: null, holder: '', kind: 'identity_card', label: '', expires_on: '', no_expiry: false, notice_days: DOC_NOTICE.identity_card, notes: '' });
function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

function DocumentsSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, date } = useLanguage();
  const [docs, setDocs] = useState([]), [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [working, setWorking] = useState(false);
  const [form, setForm] = useState(null), [renew, setRenew] = useState(null);
  const today = todayRome();
  const writable = demo || canWrite;
  const day = iso => date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  const scope = useCallback(query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user?.id).is('home_id', null)), [homeId, user?.id]);

  const load = useCallback(async () => {
    if (demo) { try { setDocs(JSON.parse(localStorage.getItem(DEMO_KEY) || '[]')); } catch { setDocs([]); } setLoading(false); return; }
    if (!client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const [list, names] = await Promise.all([
      selectAll(count => scope(client.from('family_documents').select('*', count ? { count: 'exact' } : undefined)).order('expires_on', { nullsFirst: false }).order('id')),
      scope(client.from('health_people').select('name,birth_on,relation')).limit(100),
    ]);
    setLoading(false);
    if (list.error) { if (MISSING_TABLE.has(list.error.code)) setMissing(true); else onNotify(friendlyError(list.error, tr)); return; }
    setMissing(false); setDocs(list.data || []); setPeople(names.error ? [] : names.data || []);
  }, [client, demo, scope, user?.id]);
  useEffect(() => { setDocs([]); setForm(null); setRenew(null); load(); }, [load]);
  // Prova senza account: i documenti restano in questo browser.
  const keepDemo = list => { if (demo) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(list)); } catch { /* spazio pieno: restano solo in memoria */ } } return list; };

  const agenda = useMemo(() => documentAgenda(docs, today), [docs, today]);
  const suggestions = useMemo(() => holderSuggestions(docs, people), [docs, people]);
  const attention = agenda.filter(a => a.state === 'expired' || a.state === 'renew').length;
  // Iscrizioni scolastiche dei bambini e ragazzi scritti in Salute (con la data di nascita).
  const enrollments = useMemo(() => schoolEnrollments(people.filter(p => p.birth_on && p.birth_on > `${Number(today.slice(0, 4)) - 15}-01-01`), today), [people, today]);
  const what = doc => doc.label || tr('iddocs.kind.' + doc.kind);
  const stateText = a => (a.state === 'none' ? tr('iddocs.state.none') : a.state === 'expired' ? tr('iddocs.state.expired', { date: day(a.doc.expires_on) })
    : a.state === 'renew' ? tr('iddocs.state.renew', { days: a.days, date: day(a.doc.expires_on) }) : tr('iddocs.state.ok', { date: day(a.doc.expires_on) }));

  async function save(event) {
    event.preventDefault();
    const { id, ...input } = form;
    const result = normalizeDocument(input);
    if (result.error) { onNotify(tr(result.error)); return; }
    if (!id && docs.length >= DOC_LIMITS.perSpace) { onNotify(tr('iddocs.error.limit')); return; }
    setWorking(true);
    try {
      if (id) {
        if (!demo) { const { error } = await client.from('family_documents').update(result.value).eq('id', id); if (error) { onNotify(friendlyError(error, tr)); return; } }
        setDocs(list => keepDemo(list.map(d => (d.id === id ? { ...d, ...result.value } : d))));
        onNotify(tr('iddocs.updated'));
      } else {
        let made;
        if (demo) made = { ...result.value, id: uid() };
        else {
          const { data, error } = await client.from('family_documents').insert({ ...result.value, user_id: user.id, home_id: homeId || null }).select('*').single();
          if (error) { onNotify(friendlyError(error, tr)); return; }
          made = data;
        }
        setDocs(list => keepDemo([...list, made]));
        onNotify(tr('iddocs.saved', { what: what(made), holder: made.holder }));
      }
      setForm(null);
    } finally { setWorking(false); }
  }

  async function saveRenew(event) {
    event.preventDefault();
    const doc = docs.find(d => d.id === renew.id);
    if (!doc || !renew.expires_on || renew.expires_on <= today) { onNotify(tr('iddocs.error.renewDate')); return; }
    setWorking(true);
    try {
      if (!demo) { const { error } = await client.from('family_documents').update({ expires_on: renew.expires_on }).eq('id', doc.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
      setDocs(list => keepDemo(list.map(d => (d.id === doc.id ? { ...d, expires_on: renew.expires_on } : d))));
      onNotify(tr('iddocs.renewed', { what: what(doc), holder: doc.holder, date: day(renew.expires_on) }));
      setRenew(null);
    } finally { setWorking(false); }
  }

  async function remove(doc) {
    if (!(await askConfirm(tr('iddocs.deleteConfirm', { what: what(doc), holder: doc.holder }), { danger: true }))) return;
    if (!demo) { const { error } = await client.from('family_documents').delete().eq('id', doc.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setDocs(list => keepDemo(list.filter(d => d.id !== doc.id)));
    onNotify(tr('iddocs.deleted'));
  }

  const set = patch => setForm(f => ({ ...f, ...patch }));
  return <div className="extra-main iddocs">
    <div className="page-heading"><div><div className="eyebrow">{tr('iddocs.eyebrow')}</div><h1>{tr('nav.iddocs')}</h1><p>{tr('iddocs.help')}</p></div></div>
    <div className="informative"><Info size={17} /><p>{tr(homeId ? 'iddocs.privacyHome' : 'iddocs.privacyPersonal')}</p></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('iddocs.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('iddocs.demo')}</p></div>}
    {!demo && !missing && !canWrite && <div className="informative"><Info size={17} /><p>{tr('iddocs.readOnly')}</p></div>}
    {!missing && <div className="extra-layout">
      <section className="panel extra-panel">
        <h2><IdCard size={19} /> {tr('iddocs.list')}</h2>
        {!loading && docs.length > 0 && <p className={attention ? 'garden-warning' : 'muted'}>{attention ? tr('iddocs.attention', { count: attention }) : tr('iddocs.allGood')}</p>}
        {loading ? <p className="muted">{tr('general.loading')}</p> : !agenda.length ? <p className="muted">{tr('iddocs.empty')}</p> :
        <ul className="health-list iddocs-list">{agenda.map(a => <li key={a.doc.id} className={`iddocs-${a.state}`}>
          <span><b>{what(a.doc)} · {a.doc.holder}</b>
            <small><span className={`extra-pill iddocs-pill-${a.state}`}>{stateText(a)}</span>{a.doc.expires_on ? ' · ' + tr('iddocs.noticeShort', { days: a.doc.notice_days }) : ''}</small>
            {a.doc.notes && <small>{a.doc.notes}</small>}</span>
          {writable && <span className="extra-buttons">
            {a.doc.expires_on && <button className="btn btn-soft" aria-label={tr('iddocs.renewAria', { what: what(a.doc), holder: a.doc.holder })} onClick={() => { setForm(null); setRenew({ id: a.doc.id, expires_on: suggestedRenewal(a.doc, today) }); }}><RefreshCw size={15} /> {tr('iddocs.renew')}</button>}
            <button className="icon-button" aria-label={tr('iddocs.editAria', { what: what(a.doc), holder: a.doc.holder })} title={tr('iddocs.edit')} onClick={() => { setRenew(null); setForm({ ...a.doc, expires_on: a.doc.expires_on || '', no_expiry: !a.doc.expires_on }); }}><Pencil size={16} /></button>
            <button className="icon-button danger" aria-label={tr('iddocs.deleteAria', { what: what(a.doc), holder: a.doc.holder })} title={tr('iddocs.delete')} onClick={() => remove(a.doc)}><Trash2 size={16} /></button>
          </span>}
          {renew?.id === a.doc.id && <form className="health-done-form" onSubmit={saveRenew}>
            <Field label={tr('iddocs.newExpiry')}><input type="date" required min={today} value={renew.expires_on} onChange={e => setRenew(r => ({ ...r, expires_on: e.target.value }))} /></Field>
            <span className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('iddocs.save')}</button><button type="button" className="btn btn-soft" onClick={() => setRenew(null)}>{tr('iddocs.cancel')}</button></span>
          </form>}
        </li>)}</ul>}
        {writable && !form && <button className="btn btn-soft" onClick={() => { setRenew(null); setForm(blank()); }}><Plus size={15} /> {tr('iddocs.add')}</button>}
        {form && <form className="extra-form garden-inline" onSubmit={save}>
          <h3>{tr(form.id ? 'iddocs.edit' : 'iddocs.add')}</h3>
          <div className="extra-row">
            <Field label={tr('iddocs.holder')}><input required maxLength={DOC_LIMITS.holder} list="iddocs-holders" value={form.holder} placeholder={tr('iddocs.holderPlaceholder')} onChange={e => set({ holder: e.target.value })} /></Field>
            <Field label={tr('iddocs.kind')}><select value={form.kind} onChange={e => set({ kind: e.target.value, ...(form.id ? {} : { notice_days: DOC_NOTICE[e.target.value] }) })}>{DOC_KINDS.map(k => <option key={k} value={k}>{tr('iddocs.kind.' + k)}</option>)}</select></Field>
          </div>
          <datalist id="iddocs-holders">{suggestions.map(n => <option key={n} value={n} />)}</datalist>
          <Field label={tr('iddocs.label')}><input maxLength={DOC_LIMITS.label} value={form.label} placeholder={tr('iddocs.labelPlaceholder')} onChange={e => set({ label: e.target.value })} /></Field>
          <div className="extra-row">
            <Field label={tr('iddocs.expiresOn')}><input type="date" required={!form.no_expiry} disabled={form.no_expiry} value={form.expires_on} onChange={e => set({ expires_on: e.target.value })} /></Field>
            <Field label={tr('iddocs.notice')}><select value={String(form.notice_days)} disabled={form.no_expiry} onChange={e => set({ notice_days: Number(e.target.value) })}>
              {(NOTICE_CHOICES.includes(Number(form.notice_days)) ? NOTICE_CHOICES : [...NOTICE_CHOICES, Number(form.notice_days)].sort((a, b) => a - b)).map(n => <option key={n} value={n}>{tr('iddocs.noticeDays', { days: n })}</option>)}</select></Field>
          </div>
          <label className="extra-toggle"><input type="checkbox" checked={form.no_expiry} onChange={e => set({ no_expiry: e.target.checked })} />{tr('iddocs.noExpiry')}</label>
          <small className="muted">{tr('iddocs.hint.' + form.kind)}</small>
          <Field label={tr('iddocs.notes')}><input maxLength={DOC_LIMITS.notes} value={form.notes} placeholder={tr('iddocs.notesPlaceholder')} onChange={e => set({ notes: e.target.value })} /></Field>
          <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('iddocs.save')}</button><button type="button" className="btn btn-soft" onClick={() => setForm(null)}>{tr('iddocs.cancel')}</button></div>
        </form>}
      </section>
      <section className="panel extra-panel">
        <h2><Info size={19} /> {tr('iddocs.rulesTitle')}</h2>
        <ul className="iddocs-rules">{['identity_card', 'passport', 'driving_license', 'residence_permit', 'health_card', 'sport_certificate'].map(k => <li key={k}><b>{tr('iddocs.kind.' + k)}</b> — {tr('iddocs.rule.' + k)}</li>)}</ul>
        <p className="muted">{tr('iddocs.rulesNote')}</p>
        <h2><School size={19} /> {tr('iddocs.enrollments')}</h2>
        {!enrollments.length ? <p className="muted">{tr('iddocs.enrollmentsEmpty')}</p> : <ul className="health-list iddocs-enrollments">{enrollments.map(e => <li key={e.person.name + e.grade}>
          <span><b>{e.person.name} · {tr('iddocs.grade.' + e.grade)}</b><small>{tr('iddocs.enrollmentWhen', { year: e.year, schoolYear: e.schoolYear })}</small></span></li>)}</ul>}
        <p className="muted">{tr('iddocs.enrollmentsHelp')}</p>
      </section>
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.iddocs.json).
export default function FamilyDocuments(props) {
  const { t } = useLanguage();
  const ready = useSection('iddocs');
  return ready ? <DocumentsSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}
