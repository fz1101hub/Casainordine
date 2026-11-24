'use client';
// Fondo sostituzioni (Fase 2, 3.3): per gli oggetti delle Manutenzioni, vita utile indicativa,
// costo stimato e quota da mettere da parte ogni mese. Sono stime, e la pagina lo dice sempre.
import { selectIn } from '../lib/select-all.mjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PiggyBank, Info, TriangleAlert } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { REPLACEMENT_TYPES, REPLACEMENT_TYPE_KEYS, REPLACEMENT_LIMITS, normalizePlan, replacementEstimate, fundSummary } from '../lib/replacement.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
// Oggetti d'esempio per la prova senza account (nomi tradotti, date fisse).
const DEMO_ASSETS = Object.freeze([
  { id: 'demo-boiler', nameKey: 'replacement.demo.boiler', purchased_on: '2014-03-01' },
  { id: 'demo-washer', nameKey: 'replacement.demo.washer', purchased_on: '2019-06-10' },
  { id: 'demo-fridge', nameKey: 'replacement.demo.fridge', purchased_on: null },
]);
const DEMO_PLANS = Object.freeze({ 'demo-boiler': { item_type: 'boiler', cost: 2500, saved: 500 }, 'demo-washer': { item_type: 'washing_machine', cost: 600, saved: 0 } });

function ReplacementSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, money, date } = useLanguage();
  const monthYear = iso => date(iso, { month: 'long', year: 'numeric' });
  const today = todayRome();
  const [assets, setAssets] = useState([]), [plans, setPlans] = useState({}), [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [saving, setSaving] = useState('');
  const writable = demo || canWrite;

  const load = useCallback(async () => {
    if (demo) { setAssets([...DEMO_ASSETS]); setPlans({ ...DEMO_PLANS }); setLoading(false); return; }
    if (!client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const query = client.from('maintenance_assets').select('id,name,category,purchased_on');
    const list = await (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user.id).is('home_id', null)).order('name').limit(600);
    if (list.error) { setLoading(false); onNotify(friendlyError(list.error, tr)); return; }
    const ids = (list.data || []).map(a => a.id);
    // A gruppi di 100 id: fino a 600 oggetti nell'indirizzo superavano il limite di Supabase (16 KB).
    const saved = ids.length ? await selectIn((part, count) => client.from('home_replacement_plans').select('*', count ? { count: 'exact' } : undefined).in('asset_id', part).order('asset_id'), ids) : { data: [] };
    setLoading(false);
    setAssets(list.data || []);
    if (saved.error) { if (MISSING_TABLE.has(saved.error.code)) setMissing(true); else onNotify(friendlyError(saved.error, tr)); setPlans({}); return; }
    setMissing(false);
    setPlans(Object.fromEntries((saved.data || []).map(p => [p.asset_id, p])));
  }, [client, demo, homeId, user?.id]);
  useEffect(() => { setDrafts({}); load(); }, [load]);

  const nameOf = asset => (asset.nameKey ? tr(asset.nameKey) : asset.name);
  const planFor = asset => ({ ...(plans[asset.id] || {}), ...(drafts[asset.id] || {}) });
  const estimates = useMemo(() => Object.fromEntries(assets.map(asset => [asset.id, replacementEstimate({ ...asset, name: nameOf(asset) }, planFor(asset), today)])), [assets, plans, drafts, today, tr]);
  const summary = fundSummary(Object.values(estimates));

  async function save(asset) {
    const result = normalizePlan({ ...planFor(asset), item_type: estimates[asset.id].type });
    if (result.error) { onNotify(tr(result.error)); return; }
    if (!demo) {
      setSaving(asset.id);
      const { error } = await client.from('home_replacement_plans').upsert({ asset_id: asset.id, ...result.value }, { onConflict: 'asset_id' });
      setSaving('');
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setPlans(all => ({ ...all, [asset.id]: { ...(all[asset.id] || {}), asset_id: asset.id, ...result.value } }));
    setDrafts(all => { const next = { ...all }; delete next[asset.id]; return next; });
    onNotify(tr('replacement.savedToast', { name: nameOf(asset) }));
  }

  const edit = (asset, patch) => setDrafts(all => ({ ...all, [asset.id]: { ...(all[asset.id] || {}), ...patch } }));
  const value = (asset, key) => { const v = planFor(asset)[key]; return v === null || v === undefined ? '' : String(v); };

  function outcome(e) {
    if (e.status === 'missing_date') return tr('replacement.status.missingDate');
    if (e.status === 'missing_cost') return tr('replacement.status.missingCost', { date: monthYear(e.dueOn) });
    if (e.status === 'due') return e.needed ? tr('replacement.status.dueNeeded', { amount: money(e.needed) }) : tr('replacement.status.due');
    return tr('replacement.status.ok', { date: monthYear(e.dueOn), monthly: money(e.monthly), months: e.monthsLeft });
  }

  return <div className="extra-main replacement">
    <div className="page-heading"><div><div className="eyebrow">{tr('replacement.eyebrow')}</div><h1>{tr('nav.replacement')}</h1><p>{tr('replacement.help')}</p></div></div>
    <div className="informative replacement-disclaimer"><TriangleAlert size={17} /><p>{tr('replacement.disclaimer')}</p></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('replacement.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('replacement.demo')}</p></div>}
    <div className="project-tiles replacement-tiles">
      <div><small>{tr('replacement.monthly')}</small><b>{money(summary.monthly)}</b><small>{tr('replacement.monthlyHint', { count: summary.counted })}</small></div>
      <div><small>{tr('replacement.savedTotal')}</small><b>{money(summary.saved)}</b></div>
      <div className={summary.dueCount ? 'over' : ''}><small>{tr('replacement.dueTitle')}</small><b>{summary.dueCount}</b>{summary.dueNow > 0 && <small>{tr('replacement.dueNow', { amount: money(summary.dueNow) })}</small>}</div>
      <div><small>{tr('replacement.incomplete')}</small><b>{summary.incomplete}</b></div>
    </div>
    <section className="panel extra-panel">
      <h2><PiggyBank size={19} /> {tr('replacement.items')}</h2>
      {loading ? <p className="muted">{tr('general.loading')}</p> : !assets.length ? <p className="muted">{tr('replacement.empty')}</p> :
      <div className="replacement-list">{assets.map(asset => {
        const e = estimates[asset.id];
        const changed = Boolean(drafts[asset.id]);
        return <article key={asset.id} className={`replacement-item ${e.status}`}>
          <header><b>{nameOf(asset)}</b><small className="replacement-outcome">{outcome(e)}</small></header>
          <div className="replacement-fields">
            <label className="extra-field">{tr('replacement.type')}<select value={e.type} disabled={!writable || missing} onChange={ev => edit(asset, { item_type: ev.target.value })}>
              {REPLACEMENT_TYPE_KEYS.map(type => <option key={type} value={type}>{tr('replacement.type.' + type)} · {tr('replacement.years', { years: REPLACEMENT_TYPES[type].life })}</option>)}
            </select></label>
            <label className="extra-field">{tr('replacement.life')}<input type="number" inputMode="numeric" min={REPLACEMENT_LIMITS.minLife} max={REPLACEMENT_LIMITS.maxLife} placeholder={String(REPLACEMENT_TYPES[e.type].life)} disabled={!writable || missing} value={value(asset, 'life_years')} onChange={ev => edit(asset, { life_years: ev.target.value })} /></label>
            {!asset.purchased_on && <label className="extra-field">{tr('replacement.installed')}<input type="date" disabled={!writable || missing} value={value(asset, 'installed_on')} onChange={ev => edit(asset, { installed_on: ev.target.value })} /></label>}
            <label className="extra-field">{tr('replacement.cost')}<input type="number" inputMode="decimal" min="0" step="0.01" disabled={!writable || missing} value={value(asset, 'cost')} onChange={ev => edit(asset, { cost: ev.target.value })} /></label>
            <label className="extra-field">{tr('replacement.saved')}<input type="number" inputMode="decimal" min="0" step="0.01" disabled={!writable || missing} value={value(asset, 'saved')} placeholder="0" onChange={ev => edit(asset, { saved: ev.target.value })} /></label>
          </div>
          {writable && !missing && changed && <button className="btn btn-primary" disabled={saving === asset.id} onClick={() => save(asset)}>{tr('replacement.save')}</button>}
        </article>;
      })}</div>}
    </section>
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.replacement.json).
export default function ReplacementFund(props) {
  const { t } = useLanguage();
  const ready = useSection('replacement');
  return ready ? <ReplacementSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}
