'use client';
// Professionisti di fiducia (Fase 2, 3.3): contatti e nota condivisa con la casa, una nota privata
// per ciascuno e gli interventi collegati dal registro delle manutenzioni, con il totale speso.
import { useCallback, useEffect, useState } from 'react';
import { HardHat, Phone, Mail, Pencil, Trash2, Info, Lock } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { TRADES, PROFESSIONAL_LIMITS, normalizeProfessional, telHref, mailHref, professionalStats } from '../lib/professionals.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205', '42703']);
const OTHER = 'other';
const blank = () => ({ id: null, name: '', trade: 'plumber', customTrade: '', phone: '', email: '', notes: '' });
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

function ProfessionalsSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, money, date } = useLanguage();
  const day = iso => date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  const [list, setList] = useState([]), [notes, setNotes] = useState({}), [events, setEvents] = useState([]), [assets, setAssets] = useState([]);
  const [drafts, setDrafts] = useState({}), [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [working, setWorking] = useState(false);
  const [form, setForm] = useState(blank());
  const writable = demo || canWrite;
  const tradeLabel = trade => (TRADES.includes(trade) ? tr('professional.trade.' + trade) : trade);

  const load = useCallback(async () => {
    if (demo || !client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const scope = query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user.id).is('home_id', null));
    const people = await scope(client.from('home_professionals').select('*')).order('name').limit(300);
    if (people.error) {
      setLoading(false);
      if (MISSING_TABLE.has(people.error.code)) setMissing(true); else onNotify(friendlyError(people.error, tr));
      return;
    }
    const ids = (people.data || []).map(p => p.id);
    const [own, done, items] = await Promise.all([
      ids.length ? client.from('home_professional_notes').select('professional_id,note').in('professional_id', ids) : { data: [] },
      ids.length ? scope(client.from('maintenance_events').select('id,asset_id,done_on,cost,description,professional_id')).not('professional_id', 'is', null).order('done_on', { ascending: false }).limit(600) : { data: [] },
      ids.length ? scope(client.from('maintenance_assets').select('id,name')).limit(600) : { data: [] },
    ]);
    setLoading(false); setMissing(false);
    setList(people.data || []);
    setNotes(Object.fromEntries((own.data || []).map(n => [n.professional_id, n.note])));
    setEvents(done.data || []); setAssets(items.data || []);
  }, [client, demo, homeId, user?.id]);
  useEffect(() => { setList([]); setNotes({}); setEvents([]); setOpen(null); setForm(blank()); load(); }, [load]);

  async function save(event) {
    event.preventDefault();
    const result = normalizeProfessional({ ...form, trade: form.trade === OTHER ? form.customTrade : form.trade });
    if (result.error) { onNotify(tr(result.error)); return; }
    const value = result.value;
    if (demo) {
      setList(items => form.id ? items.map(p => (p.id === form.id ? { ...p, ...value } : p)) : [...items, { ...value, id: uid() }]);
    } else {
      setWorking(true);
      const { error } = form.id
        ? await client.from('home_professionals').update(value).eq('id', form.id)
        : await client.from('home_professionals').insert({ ...value, home_id: homeId || null });
      setWorking(false);
      if (error) { onNotify(friendlyError(error, tr)); return; }
      await load();
    }
    onNotify(tr(form.id ? 'professional.updated' : 'professional.saved'));
    setForm(blank());
  }

  function edit(person) {
    const known = TRADES.includes(person.trade);
    setForm({ id: person.id, name: person.name, trade: known ? person.trade : OTHER, customTrade: known ? '' : person.trade, phone: person.phone || '', email: person.email || '', notes: person.notes || '' });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(person) {
    if (!(await askConfirm(tr('professional.deleteConfirm'), { danger: true }))) return;
    if (!demo) {
      const { error } = await client.from('home_professionals').delete().eq('id', person.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setList(items => items.filter(p => p.id !== person.id));
    if (form.id === person.id) setForm(blank());
    onNotify(tr('professional.deleted'));
  }

  // Nota privata: la vede solo chi la scrive (la regola di accesso del database lo garantisce).
  async function saveNote(person) {
    const text = String(drafts[person.id] ?? notes[person.id] ?? '').trim().slice(0, PROFESSIONAL_LIMITS.privateNote);
    if (!demo) {
      const { error } = text
        ? await client.from('home_professional_notes').upsert({ professional_id: person.id, note: text }, { onConflict: 'professional_id,user_id' })
        : await client.from('home_professional_notes').delete().eq('professional_id', person.id).eq('user_id', user.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setNotes(all => ({ ...all, [person.id]: text }));
    setDrafts(all => { const next = { ...all }; delete next[person.id]; return next; });
    onNotify(tr('professional.noteSaved'));
  }

  const set = patch => setForm(f => ({ ...f, ...patch }));

  return <div className="extra-main professionals">
    <div className="page-heading"><div><div className="eyebrow">{tr('professional.eyebrow')}</div><h1>{tr('nav.professionals')}</h1><p>{tr('professional.help')}</p></div></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('professional.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('professional.demo')}</p></div>}
    {!missing && <div className="extra-layout">
      <section className="panel extra-panel">
        <h2><HardHat size={19} /> {tr(form.id ? 'professional.edit' : 'professional.new')}</h2>
        {!writable ? <p className="muted">{tr('professional.readOnly')}</p> :
        <form className="extra-form" onSubmit={save}>
          <Field label={tr('professional.name')}><input required minLength={2} maxLength={PROFESSIONAL_LIMITS.name} value={form.name} placeholder={tr('professional.namePlaceholder')} onChange={e => set({ name: e.target.value })} /></Field>
          <div className="extra-row">
            <Field label={tr('professional.trade')}><select value={form.trade} onChange={e => set({ trade: e.target.value })}>
              {TRADES.map(trade => <option key={trade} value={trade}>{tr('professional.trade.' + trade)}</option>)}
              <option value={OTHER}>{tr('professional.trade.other')}</option>
            </select></Field>
            {form.trade === OTHER && <Field label={tr('professional.customTrade')}><input required minLength={2} maxLength={PROFESSIONAL_LIMITS.trade} value={form.customTrade} onChange={e => set({ customTrade: e.target.value })} /></Field>}
          </div>
          <div className="extra-row">
            <Field label={tr('professional.phone')}><input type="tel" inputMode="tel" autoComplete="off" maxLength={PROFESSIONAL_LIMITS.phone} value={form.phone} onChange={e => set({ phone: e.target.value })} /></Field>
            <Field label={tr('professional.email')}><input type="email" autoComplete="off" maxLength={PROFESSIONAL_LIMITS.email} value={form.email} placeholder={tr('ui.emailPlaceholder')} onChange={e => set({ email: e.target.value })} /></Field>
          </div>
          <Field label={tr(homeId ? 'professional.sharedNotes' : 'professional.notes')}><textarea rows={3} maxLength={PROFESSIONAL_LIMITS.notes} value={form.notes} onChange={e => set({ notes: e.target.value })} /></Field>
          <div className="extra-buttons">
            <button className="btn btn-primary" disabled={working}>{tr(form.id ? 'professional.update' : 'professional.save')}</button>
            {form.id && <button type="button" className="btn btn-soft" onClick={() => setForm(blank())}>{tr('professional.cancel')}</button>}
          </div>
        </form>}
      </section>
      <section className="panel extra-panel">
        <h2>{tr('professional.list')}</h2>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !list.length ? <p className="muted">{tr('professional.empty')}</p> :
        <div className="extra-list">{list.map(person => {
          const stats = professionalStats(events, person.id);
          const tel = telHref(person.phone), mail = mailHref(person.email);
          const note = drafts[person.id] ?? notes[person.id] ?? '';
          return <article key={person.id} className="professional-card">
            <div className="extra-item">
              <div><b>{person.name} <span className="extra-pill">{tradeLabel(person.trade)}</span></b>
                <small className="professional-contacts">
                  {tel && <a href={tel}><Phone size={13} /> {person.phone}</a>}
                  {mail && <a href={mail}><Mail size={13} /> {person.email}</a>}
                </small>
                {person.notes && <small className="professional-notes">{person.notes}</small>}
                <small>{!stats.count ? tr('professional.noEvents') : tr(stats.count === 1 ? 'professional.statsOne' : 'professional.stats', { count: stats.count, total: money(stats.total), date: day(stats.last) })}</small>
              </div>
              {writable && <div className="extra-buttons">
                <button className="icon-button" title={tr('professional.edit')} aria-label={tr('professional.edit')} onClick={() => edit(person)}><Pencil size={16} /></button>
                <button className="icon-button danger" title={tr('professional.delete')} aria-label={tr('professional.delete')} onClick={() => remove(person)}><Trash2 size={16} /></button>
              </div>}
            </div>
            <details open={open === person.id} onToggle={e => { if (e.currentTarget.open) setOpen(person.id); else if (open === person.id) setOpen(null); }}>
              <summary>{tr('professional.details')}</summary>
              {stats.count > 0 && <ul className="professional-events">{stats.events.map(item => <li key={item.id}>
                {day(item.done_on)} · {assets.find(a => a.id === item.asset_id)?.name || tr('extra.maint.deletedItem')} · {item.description} · <strong>{money(Number(item.cost) || 0)}</strong>
              </li>)}</ul>}
              <label className="extra-field professional-private"><span><Lock size={13} /> {tr('professional.privateNote')}</span>
                <textarea rows={2} maxLength={PROFESSIONAL_LIMITS.privateNote} value={note} placeholder={tr('professional.privatePlaceholder')} onChange={e => setDrafts(all => ({ ...all, [person.id]: e.target.value }))} />
              </label>
              <button className="btn btn-soft" disabled={drafts[person.id] === undefined} onClick={() => saveNote(person)}>{tr('professional.saveNote')}</button>
            </details>
          </article>;
        })}</div>}
      </section>
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.professional.json).
export default function Professionals(props) {
  const { t } = useLanguage();
  const ready = useSection('professional');
  return ready ? <ProfessionalsSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}
