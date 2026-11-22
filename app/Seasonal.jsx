'use client';
// Programma stagionale (Fase 2, 3.3): le voci del periodo per clima, tipo di casa e dotazioni,
// da segnare come fatte (una volta per stagione) o aggiungere alle attività con la scadenza della stagione.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SunSnow, Check, ListPlus, Undo2, Info } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome, addDaysISO } from '../lib/dates.mjs';
import { CLIMATES, HOME_TYPES, FEATURES, DEFAULT_PROFILE, normalizeProfile, seasonalPlan } from '../lib/seasonal.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const GROUPS = ['late', 'now', 'soon'];
const LATE_TASK_DAYS = 14;
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function SeasonalSection({ client, demo, user, homeId, canWrite, onNotify = () => {}, onAddTask = async () => false }) {
  const { t: tr, date } = useLanguage();
  const day = iso => date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  const monthName = iso => date(iso, { month: 'long' });
  const [profile, setProfile] = useState(normalizeProfile(DEFAULT_PROFILE)), [saved, setSaved] = useState(null);
  const [done, setDone] = useState([]);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [working, setWorking] = useState(false);
  const today = todayRome();
  const writable = demo || canWrite;
  const canSave = writable && !missing;

  const load = useCallback(async () => {
    if (demo || !client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const scope = query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user.id).is('home_id', null));
    const [settings, marks] = await Promise.all([
      scope(client.from('home_seasonal_settings').select('id,climate,home_type,features')).limit(1).maybeSingle(),
      scope(client.from('home_seasonal_done').select('id,item_id,period,done_on,user_id')).order('done_on', { ascending: false }).limit(400),
    ]);
    setLoading(false);
    const error = settings.error || marks.error;
    if (error) {
      if (MISSING_TABLE.has(error.code)) setMissing(true); else onNotify(friendlyError(error, tr));
      return;
    }
    setMissing(false);
    setSaved(settings.data || null);
    setProfile(normalizeProfile(settings.data || DEFAULT_PROFILE));
    setDone(marks.data || []);
  }, [client, demo, homeId, user?.id]);
  useEffect(() => { setDone([]); setSaved(null); setProfile(normalizeProfile(DEFAULT_PROFILE)); load(); }, [load]);

  const plan = useMemo(() => seasonalPlan(profile, done, today), [profile, done, today]);
  const changed = JSON.stringify(normalizeProfile(saved || DEFAULT_PROFILE)) !== JSON.stringify(profile);

  async function saveProfile() {
    if (!demo) {
      setWorking(true);
      const { error } = saved?.id
        ? await client.from('home_seasonal_settings').update(profile).eq('id', saved.id)
        : await client.from('home_seasonal_settings').insert({ ...profile, home_id: homeId || null });
      setWorking(false);
      if (error) { onNotify(friendlyError(error, tr)); return; }
      await load();
    } else setSaved({ ...profile });
    onNotify(tr('seasonal.profileSaved'));
  }

  async function markDone(entry) {
    const row = { item_id: entry.id, period: entry.period, done_on: today };
    if (demo) setDone(list => [...list, { ...row, id: uid() }]);
    else {
      const { error } = await client.from('home_seasonal_done').insert({ ...row, home_id: homeId || null });
      // Già segnata da qualcun altro della casa: basta ricaricare.
      if (error && error.code !== '23505') { onNotify(friendlyError(error, tr)); return; }
      await load();
    }
    onNotify(tr('seasonal.markedDone'));
  }

  async function undo(entry) {
    if (!entry.done) return;
    if (!demo) {
      const { error } = await client.from('home_seasonal_done').delete().eq('id', entry.done.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setDone(list => list.filter(row => row.id !== entry.done.id));
    onNotify(tr('seasonal.undone'));
  }

  // Scadenza dell'attività: la fine della stagione; per una voce rimasta indietro, fra due settimane.
  async function addTask(entry) {
    const due = entry.status === 'late' ? addDaysISO(today, LATE_TASK_DAYS) : entry.end;
    const ok = await onAddTask({ title: tr('seasonal.item.' + entry.id), due_date: due });
    if (ok) onNotify(tr('seasonal.taskAdded', { date: day(due) }));
  }

  const months = entry => {
    const first = monthName(entry.start), last = monthName(entry.end);
    return first === last ? first : `${first} – ${last}`;
  };
  const toggleFeature = feature => setProfile(p => normalizeProfile({ ...p, features: p.features.includes(feature) ? p.features.filter(f => f !== feature) : [...p.features, feature] }));

  function item(entry) {
    return <div key={entry.id + entry.period} className={`seasonal-item ${entry.status}${entry.done ? ' is-done' : ''}`}>
      <div>
        <b>{tr('seasonal.item.' + entry.id)}</b>
        <small>{tr('seasonal.why.' + entry.id)}</small>
        <small className="seasonal-when">{entry.done ? tr('seasonal.doneOn', { date: day(entry.done.done_on) }) : tr('seasonal.window', { months: months(entry) })}</small>
      </div>
      {writable && <div className="extra-buttons">
        {/* Segnare come fatta serve la migrazione v45; aggiungere alle attività no. */}
        {entry.done
          ? canSave && <button className="btn btn-soft" onClick={() => undo(entry)}><Undo2 size={15} /> {tr('seasonal.undo')}</button>
          : <>
            {canSave && <button className="btn btn-soft" onClick={() => markDone(entry)}><Check size={15} /> {tr('seasonal.markDone')}</button>}
            <button className="btn btn-soft" onClick={() => addTask(entry)}><ListPlus size={15} /> {tr('seasonal.addTask')}</button>
          </>}
      </div>}
    </div>;
  }

  const nothingSoon = GROUPS.every(group => !plan[group].length);
  return <div className="extra-main seasonal">
    <div className="page-heading"><div><div className="eyebrow">{tr('seasonal.eyebrow')}</div><h1>{tr('nav.seasonal')}</h1><p>{tr('seasonal.help')}</p></div></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('seasonal.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('seasonal.demo')}</p></div>}
    {!demo && !missing && !canWrite && <div className="informative"><Info size={17} /><p>{tr('seasonal.readOnly')}</p></div>}
    <div className="extra-layout">
      <section className="panel extra-panel">
        <h2><SunSnow size={19} /> {tr('seasonal.profile')}</h2>
        <div className="extra-form">
          <label className="extra-field">{tr('seasonal.climate')}<select value={profile.climate} disabled={!writable} onChange={e => setProfile(p => ({ ...p, climate: e.target.value }))}>
            {CLIMATES.map(c => <option key={c} value={c}>{tr('seasonal.climate.' + c)}</option>)}
          </select></label>
          <label className="extra-field">{tr('seasonal.homeType')}<select value={profile.home_type} disabled={!writable} onChange={e => setProfile(p => ({ ...p, home_type: e.target.value }))}>
            {HOME_TYPES.map(h => <option key={h} value={h}>{tr('seasonal.homeType.' + h)}</option>)}
          </select></label>
          <fieldset className="seasonal-features" disabled={!writable}><legend>{tr('seasonal.features')}</legend>
            {FEATURES.map(feature => <label key={feature} className="extra-toggle"><input type="checkbox" checked={profile.features.includes(feature)} onChange={() => toggleFeature(feature)} /> {tr('seasonal.feature.' + feature)}</label>)}
          </fieldset>
          {canSave && <button className="btn btn-primary" disabled={working || !changed} onClick={saveProfile}>{tr(homeId ? 'seasonal.saveProfile' : 'seasonal.saveProfilePersonal')}</button>}
        </div>
      </section>
      <section className="panel extra-panel seasonal-plan">
        {loading ? <p className="muted">{tr('general.loading')}</p> : <>
          {GROUPS.map(group => plan[group].length > 0 && <div key={group} className="seasonal-group">
            <h2>{tr('seasonal.' + group)}</h2>
            {group === 'late' && <p className="muted">{tr('seasonal.lateHint')}</p>}
            {plan[group].map(item)}
          </div>)}
          {nothingSoon && <p className="muted">{tr('seasonal.nothingNow')}</p>}
          {plan.done.length > 0 && <div className="seasonal-group"><h2>{tr('seasonal.done')}</h2>{plan.done.map(item)}</div>}
          {plan.later.length > 0 && <details className="seasonal-group"><summary>{tr('seasonal.later')} ({plan.later.length})</summary>{plan.later.map(item)}</details>}
        </>}
      </section>
    </div>
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.seasonal.json).
export default function Seasonal(props) {
  const { t } = useLanguage();
  const ready = useSection('seasonal');
  return ready ? <SeasonalSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}
