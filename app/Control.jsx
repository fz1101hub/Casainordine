'use client';
// Casa Control (Fase 2, 3.3): pannello facoltativo (si attiva qui, per account e dispositivo) con
// indicatori calcolati da eventi registrati. Ogni numero porta la formula e i dati usati; con pochi
// dati lo dice. Nessun punteggio complessivo: niente da sommare o pesare a occhio.
import { useEffect, useMemo, useState } from 'react';
import { Gauge, ArrowRight, Info } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { todayRome } from '../lib/dates.mjs';
import { controlIndicators } from '../lib/control.mjs';

const storageKey = userId => `cio-control:${userId || 'demo'}`;
function readEnabled(userId) { try { return localStorage.getItem(storageKey(userId)) === '1'; } catch { return false; } }
function writeEnabled(userId, value) { try { if (value) localStorage.setItem(storageKey(userId), '1'); else localStorage.removeItem(storageKey(userId)); } catch {} }

function ControlSection({ client, demo, user, homeId, bills = [], tasks = [], onOpen = () => {} }) {
  const { t: tr, money, locale } = useLanguage();
  const [enabled, setEnabled] = useState(false), [assets, setAssets] = useState([]), [contracts, setContracts] = useState([]);
  const [known, setKnown] = useState({ assets: false, contracts: false });
  const today = todayRome();
  useEffect(() => { setEnabled(readEnabled(user?.id)); }, [user?.id]);

  // Oggetti e contratti dello spazio attivo (nella prova non ci sono: lo dice ogni indicatore).
  useEffect(() => {
    if (!enabled || demo || !client || !user?.id) { setKnown({ assets: false, contracts: false }); return; }
    let active = true;
    const scope = query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user.id).is('home_id', null));
    Promise.all([
      scope(client.from('maintenance_assets').select('id,next_service_on,warranty_until')).limit(600),
      scope(client.from('home_contracts').select('id,renewal_on')).limit(600),
    ]).then(([a, c]) => {
      if (!active) return;
      setAssets(a.data || []); setContracts(c.data || []);
      setKnown({ assets: !a.error, contracts: !c.error });
    });
    return () => { active = false; };
  }, [enabled, demo, client, homeId, user?.id]);

  const indicators = useMemo(() => controlIndicators({ bills, tasks, assets, contracts, today, assetsKnown: known.assets, contractsKnown: known.contracts }), [bills, tasks, assets, contracts, today, known]);
  const percent = value => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value / 100);
  const change = value => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(value / 100);

  function shown(item) {
    if (item.status === 'unavailable') return { value: '—', caption: tr('control.unavailable') };
    if (item.status === 'missing') return { value: '—', caption: tr(`control.${item.id}.missing`, { have: item.denominator, need: item.need }) };
    if (item.kind === 'percent') return { value: percent(item.value), caption: tr(`control.${item.id}.formula`, { num: item.numerator, den: item.denominator }) };
    if (item.kind === 'change') return { value: change(item.value), caption: tr('control.utilitySpend.formula', { recent: money(item.recent), previous: money(item.previous), recentCount: item.recentCount, previousCount: item.previousCount }) };
    return { value: String(item.value), caption: tr(`control.${item.id}.formula`, { total: money(item.total || 0), of: item.of ?? 0 }) };
  }

  const toggle = value => { writeEnabled(user?.id, value); setEnabled(value); };

  return <div className="extra-main control">
    <div className="page-heading"><div><div className="eyebrow">{tr('control.eyebrow')}</div><h1>{tr('nav.control')}</h1><p>{tr('control.help')}</p></div>
      {enabled && <button className="btn btn-soft" onClick={() => toggle(false)}>{tr('control.disable')}</button>}</div>
    {!enabled ? <section className="panel extra-panel control-intro">
      <h2><Gauge size={19} /> {tr('control.introTitle')}</h2>
      <p>{tr('control.intro')}</p>
      <ul>{indicators.map(item => <li key={item.id}>{tr(`control.${item.id}.title`)}</li>)}</ul>
      <button className="btn btn-primary" onClick={() => toggle(true)}>{tr('control.enable')}</button>
    </section> : <>
      <div className="informative"><Info size={17} /><p>{tr('control.noScore')}</p></div>
      <div className="control-grid">{indicators.map(item => { const view = shown(item); return <article key={item.id} className={`panel control-card ${item.status}`}>
        <small>{tr(`control.${item.id}.title`)}</small>
        <b>{view.value}</b>
        <p>{view.caption}</p>
        <button className="btn btn-soft" onClick={() => onOpen(item.tab)}>{tr('control.open', { section: tr('nav.' + item.tab) })} <ArrowRight size={15} /></button>
      </article>; })}</div>
      {demo && <p className="muted">{tr('control.demo')}</p>}
    </>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.control.json).
export default function Control(props) {
  const { t } = useLanguage();
  const ready = useSection('control');
  return ready ? <ControlSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}
