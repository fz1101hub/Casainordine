'use client';
// Scadenze fiscali di famiglia (scelta dell'utente del 26 novembre 2026, mattina), nella pagina delle
// Spese detraibili: quali seguire (730, Redditi, IMU, ISEE), le prossime date con «Fatto», e i
// documenti da raccogliere per il 730 con le voci già registrate. Calcoli in lib/tax-calendar.mjs.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, RotateCcw } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { TAX_GROUPS, normalizeTaxSettings, taxAgenda, taxChecklist, taxYearFor, toggleDone, doneKey, docKey } from '../lib/tax-calendar.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const REMIND = [7, 14, 30];

export default function TaxCalendar({ client, demo, user, homeId, canWrite, items = [], onNotify = () => {} }) {
  const { t: tr, date } = useLanguage();
  const today = todayRome();
  const [settings, setSettings] = useState(() => normalizeTaxSettings({})), [rowId, setRowId] = useState(null);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [saving, setSaving] = useState(false);
  const writable = demo || canWrite;
  const day = iso => date(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const scope = useCallback(query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user?.id).is('home_id', null)), [homeId, user?.id]);

  useEffect(() => {
    if (demo || !client || !user?.id) { setLoading(false); return undefined; }
    let live = true;
    setLoading(true);
    scope(client.from('tax_calendar_settings').select('id,groups,remind_days,done')).limit(1).then(({ data, error }) => {
      if (!live) return;
      if (error) { if (MISSING_TABLE.has(error.code)) setMissing(true); else onNotify(friendlyError(error, tr)); setLoading(false); return; }
      const row = data?.[0];
      setRowId(row?.id || null);
      setSettings(normalizeTaxSettings(row || {}));
      setLoading(false);
    });
    return () => { live = false; };
  }, [client, demo, user?.id, homeId]);

  // Salvataggio subito, con il ritorno indietro se il database rifiuta.
  async function save(next) {
    const before = settings;
    setSettings(next);
    if (demo) return;
    setSaving(true);
    try {
      const values = { groups: next.groups, remind_days: next.remind_days, done: next.done };
      const result = rowId
        ? await client.from('tax_calendar_settings').update(values).eq('id', rowId).select('id').single()
        : await client.from('tax_calendar_settings').insert({ ...values, user_id: user.id, home_id: homeId || null }).select('id').single();
      if (result.error) throw result.error;
      setRowId(result.data.id);
      onNotify(tr('taxes.cal.saved'));
    } catch (error) {
      setSettings(before);
      onNotify(friendlyError(error, tr));
    } finally { setSaving(false); }
  }

  const agenda = useMemo(() => taxAgenda(settings, today), [settings, today]);
  const taxYear = taxYearFor(today);
  const checklist = useMemo(() => taxChecklist(settings, items, taxYear), [settings, items, taxYear]);
  const what = a => tr(`taxes.cal.deadline.${a.key}`, { year: a.year });
  const stateText = a => (a.done ? tr('taxes.cal.state.done', { date: day(a.date) }) : a.state === 'late' ? tr('taxes.cal.state.late', { date: day(a.date) })
    : a.state === 'today' ? tr('taxes.cal.state.today', { date: day(a.date) }) : tr('taxes.cal.state.soon', { count: a.days, date: day(a.date) }));
  const showDocs = settings.groups.includes('730') || settings.groups.includes('redditi');

  if (missing) return null;
  return (
    <section className="panel extra-panel taxcal" aria-labelledby="taxcal-title" aria-busy={loading || saving}>
      <h2 id="taxcal-title"><CalendarClock size={19} aria-hidden="true" /> {tr('taxes.cal.title')}</h2>
      <p>{tr('taxes.cal.help')}</p>
      {demo && <p className="muted"><small>{tr('taxes.cal.demo')}</small></p>}
      {loading ? <p className="muted" role="status">{tr('general.loading')}</p> : <>
        <div className="taxcal-choices">
          <fieldset>
            <legend>{tr('taxes.cal.follow')}</legend>
            {TAX_GROUPS.map(group => (
              <label key={group} className="checkbox-label">
                <input type="checkbox" checked={settings.groups.includes(group)} disabled={!writable || saving}
                  onChange={() => save(normalizeTaxSettings({ ...settings, groups: settings.groups.includes(group) ? settings.groups.filter(g => g !== group) : [...settings.groups, group] }))} />
                {' '}{tr(`taxes.cal.group.${group}`)}
              </label>
            ))}
          </fieldset>
          <label className="extra-field">{tr('taxes.cal.remind')}
            <select value={settings.remind_days} disabled={!writable || saving} onChange={e => save(normalizeTaxSettings({ ...settings, remind_days: Number(e.target.value) }))}>
              {[...new Set([...REMIND, settings.remind_days])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{tr('taxes.cal.days', { count: n })}</option>)}
            </select>
          </label>
        </div>
        <h3>{tr('taxes.cal.upcoming')}</h3>
        {!settings.groups.length ? <p className="muted">{tr('taxes.cal.none')}</p> : (
          <ul className="taxcal-list">
            {agenda.map(a => (
              <li key={`${a.key}-${a.year}`} className={a.done ? 'done' : a.state === 'late' ? 'late' : ''}>
                <div>
                  <b>{what(a)}</b>
                  <small className={a.state === 'late' && !a.done ? 'home3-alert' : ''}>{stateText(a)}</small>
                  <small className="muted">{tr(`taxes.cal.hint.${a.key}`)}</small>
                </div>
                {writable && <button type="button" className="btn btn-soft" disabled={saving}
                  aria-label={tr(a.done ? 'taxes.cal.undoAria' : 'taxes.cal.markDoneAria', { what: what(a) })}
                  onClick={() => save(toggleDone(settings, doneKey(a.key, a.year)))}>
                  {a.done ? <><RotateCcw size={15} aria-hidden="true" /> {tr('taxes.cal.undo')}</> : <><Check size={15} aria-hidden="true" /> {tr('taxes.cal.markDone')}</>}
                </button>}
              </li>
            ))}
          </ul>
        )}
        {showDocs && <>
          <h3>{tr('taxes.cal.docs', { year: taxYear + 1, taxYear })}</h3>
          <p className="muted"><small>{tr('taxes.cal.docsHelp', { taxYear })} {tr('taxes.cal.docsReady', { count: checklist.filter(c => c.ready).length, total: checklist.length })}</small></p>
          <ul className="taxcal-docs">
            {checklist.map(c => (
              <li key={c.key}>
                <label className="checkbox-label">
                  <input type="checkbox" checked={c.ready} disabled={!writable || saving}
                    onChange={() => save(toggleDone(settings, docKey(c.key, taxYear)))} />
                  <span>{tr(`taxes.cal.doc.${c.key}`)}{c.counted && <small className="muted">{c.count ? tr('taxes.cal.docCount', { count: c.count }) : tr('taxes.cal.docNone')}</small>}</span>
                </label>
              </li>
            ))}
          </ul>
        </>}
        <p className="muted"><small>{tr('taxes.cal.source')}</small></p>
      </>}
    </section>
  );
}
