'use client';
// Previsione delle uscite (scelta dell'utente del 26 novembre 2026, notte): bollette, utenze
// ricorrenti, stime dallo storico e rate dei piani in corso, mese per mese, con un grafico a barre
// e la tabella degli stessi numeri. Il calcolo è in lib/spending-forecast.mjs.
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { todayRome } from '../lib/dates.mjs';
import { selectIn } from '../lib/select-all.mjs';
import { spendingForecast, forecastRange, FORECAST_PARTS, FORECAST_HORIZONS } from '../lib/spending-forecast.mjs';

const safe = result => (result?.error ? [] : result?.data || []);
const SHOWN_ITEMS = 8;

export default function SpendingForecast({ client, demo, user, homeId, bills = [], utilities = [] }) {
  const { t: tr, money, date } = useLanguage();
  const [months, setMonths] = useState(12);
  const [selected, setSelected] = useState(null);
  const [extra, setExtra] = useState({ plans: [], installments: [], ready: false });
  const today = todayRome();

  // Le rate stanno nelle loro tabelle (migrate_v64): si leggono una volta per lo spazio attivo,
  // per l'orizzonte più lungo. Senza le tabelle (database non aggiornato) la previsione va avanti
  // senza rate.
  useEffect(() => {
    if (demo || !client || !user?.id) { setExtra({ plans: [], installments: [], ready: true }); return undefined; }
    let live = true;
    (async () => {
      const scope = q => (homeId ? q.eq('home_id', homeId) : q.eq('user_id', user.id).is('home_id', null));
      const { first, last } = forecastRange(todayRome(), Math.max(...FORECAST_HORIZONS));
      const plans = safe(await scope(client.from('payment_plans').select('id,title,ended_on')).limit(500));
      const ids = plans.filter(p => !p.ended_on || p.ended_on >= first).map(p => p.id);
      const installments = ids.length
        ? safe(await selectIn((part, count) => client.from('payment_installments')
          .select('id,plan_id,label,due_on,amount_cents,paid_on,paid_cents', count ? { count: 'exact' } : undefined)
          .in('plan_id', part).gte('due_on', first).lte('due_on', last).order('id'), ids))
        : [];
      if (live) setExtra({ plans, installments, ready: true });
    })().catch(() => { if (live) setExtra({ plans: [], installments: [], ready: true }); });
    return () => { live = false; };
  }, [client, demo, homeId, user?.id]);

  const forecast = useMemo(
    () => spendingForecast({ bills, utilities, plans: extra.plans, installments: extra.installments, months, today }),
    [bills, utilities, extra, months, today],
  );
  const cents = value => money((value || 0) / 100);
  // Mese breve; a gennaio anche l'anno («gen 27»), per leggere il cambio d'anno.
  const shortMonth = month => date(`${month}-01`, { month: 'short' });
  const shortLabel = month => `${date(`${month}-01`, { month: 'short' })}${month.endsWith('-01') ? ` ${month.slice(2, 4)}` : ''}`;
  const longMonth = month => date(`${month}-01`, { month: 'long', year: 'numeric' });
  const day = iso => date(iso, { day: 'numeric', month: 'short' });
  const current = forecast.months.find(m => m.month === selected) || forecast.peak && forecast.months.find(m => m.month === forecast.peak.month) || forecast.months[0];

  return (
    <section className="panel extra-panel forecast-panel" aria-labelledby="forecast-title">
      <h2 id="forecast-title"><TrendingUp size={20} aria-hidden="true" /> {tr('extra.forecast.title')}</h2>
      <p>{tr('extra.forecast.help')}</p>
      <label className="forecast-horizon">{tr('extra.insights.horizon')}
        <select value={months} onChange={e => { setMonths(Number(e.target.value)); setSelected(null); }}>
          {FORECAST_HORIZONS.map(n => <option key={n} value={n}>{tr('extra.insights.months', { count: n })}</option>)}
        </select>
      </label>
      {!extra.ready ? <p className="muted" role="status">{tr('general.loading')}</p> : <>
        <dl className="forecast-stats">
          <div><dt>{tr('extra.forecast.total', { count: months })}</dt><dd>{cents(forecast.total)}</dd></div>
          <div><dt>{tr('extra.forecast.average')}</dt><dd>{cents(forecast.average)}</dd></div>
          <div><dt>{tr('extra.forecast.peak')}</dt><dd>{forecast.peak ? <>{longMonth(forecast.peak.month)} <small>{cents(forecast.peak.total)}</small></> : '—'}</dd></div>
        </dl>
        {forecast.max > 0 ? <>
          <ul className="forecast-legend">
            {FORECAST_PARTS.map(part => <li key={part}><span className={`forecast-swatch forecast-${part}`} aria-hidden="true" />{tr(`extra.forecast.part.${part}`)}</li>)}
          </ul>
          <div className="forecast-chart" role="group" aria-label={tr('extra.forecast.chart')}>
            {forecast.months.map(m => (
              <button type="button" key={m.month} className="forecast-col" aria-pressed={current.month === m.month}
                aria-label={tr('extra.forecast.barAria', { short: shortLabel(m.month), month: longMonth(m.month), total: cents(m.total) })}
                onClick={() => setSelected(m.month)}>
                <span className="forecast-plot" aria-hidden="true">
                  <span className="forecast-bar" style={{ height: `${m.total ? Math.max(2, (m.total / forecast.max) * 100) : 0}%` }}>
                    {FORECAST_PARTS.filter(part => m[part] > 0).map(part => <span key={part} className={`forecast-seg forecast-${part}`} style={{ flexGrow: m[part] }} />)}
                  </span>
                </span>
                {/* Testo visibile nello stesso ordine del nome letto (mese breve, poi importo). */}
                <span className="forecast-month" aria-hidden="true">{shortMonth(m.month)}{m.month.endsWith('-01') ? <>{' '}<small>{m.month.slice(2, 4)}</small></> : null}</span>{' '}
                <span className="forecast-tip" aria-hidden="true">{cents(m.total)}</span>
              </button>
            ))}
          </div>
          <div className="forecast-detail" aria-live="polite">
            <h3>{longMonth(current.month)} · {cents(current.total)}</h3>
            {current.items.length ? <ul>
              {current.items.slice(0, SHOWN_ITEMS).map((item, index) => (
                <li key={`${item.part}-${index}`}>
                  <span className={`forecast-swatch forecast-${item.part}`} aria-hidden="true" />
                  <span className="forecast-item-name">{item.label}{item.date ? ` · ${day(item.date)}` : ''}
                    <small>{tr(`extra.forecast.part.${item.part}`)}{item.estimate && item.part === 'bills' ? ` · ${tr('extra.forecast.estimate')}` : ''}</small></span>
                  <b>{cents(item.cents)}</b>
                </li>
              ))}
            </ul> : <p className="muted">{tr('extra.forecast.emptyMonth')}</p>}
            {current.items.length > SHOWN_ITEMS && <p className="muted">{tr('extra.forecast.more', { count: current.items.length - SHOWN_ITEMS })}</p>}
            {current.unknown > 0 && <p className="muted">{tr('extra.forecast.unknown', { count: current.unknown })}</p>}
          </div>
          <details className="forecast-table">
            <summary>{tr('extra.forecast.table')}</summary>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={tr('extra.forecast.table')}>
              <table>
                <thead><tr><th scope="col">{tr('extra.forecast.month')}</th>{FORECAST_PARTS.map(part => <th scope="col" key={part}>{tr(`extra.forecast.part.${part}`)}</th>)}<th scope="col">{tr('extra.forecast.monthTotal')}</th></tr></thead>
                <tbody>{forecast.months.map(m => <tr key={m.month}><th scope="row">{longMonth(m.month)}</th>{FORECAST_PARTS.map(part => <td key={part}>{cents(m[part])}</td>)}<td><b>{cents(m.total)}</b></td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </> : <p className="muted">{tr('extra.forecast.empty')}</p>}
      </>}
      <p className="muted"><small>{tr('extra.forecast.disclaimer', { count: forecast.historyRecords })}</small></p>
    </section>
  );
}
