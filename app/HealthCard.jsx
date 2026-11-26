'use client';
// Scheda d'emergenza (scelta dell'utente del 26 novembre 2026, notte): per babysitter, nonni o
// scuola, una pagina per persona con gruppo sanguigno, allergie, cose da sapere, medico o pediatra,
// chi chiamare, terapie in corso e vaccinazioni fatte. Si stampa dal browser (o si salva in PDF):
// nessun link pubblico, perché sono dati sanitari.
import { useMemo, useState } from 'react';
import { Printer, X, Phone } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { emergencyCard, hhmm } from '../lib/health.mjs';

const MAX_VACCINES = 12;

export function CardBody({ card, today }) {
  const { t: tr, date } = useLanguage();
  const { person, age, therapies, vaccines } = card;
  const long = iso => date(iso, { day: 'numeric', month: 'long', year: 'numeric' });
  const short = iso => date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  const ageText = age ? ('months' in age ? tr('health.card.ageMonths', { months: age.months }) : tr('health.card.ageYears', { years: age.years })) : '';
  const phone = number => (number ? <a href={`tel:${number.replace(/[^0-9+]/g, '')}`}><Phone size={12} aria-hidden="true" /> {number}</a> : null);
  const none = <span className="muted">{tr('health.card.none')}</span>;
  return <article className="health-card" aria-label={tr('health.card.titleFor', { name: person.name })}>
    <header>
      <h3>{person.name}</h3>
      <p>{[person.birth_on ? tr('health.born', { date: long(person.birth_on) }) : '', ageText].filter(Boolean).join(' · ')}</p>
    </header>
    <dl>
      <div><dt>{tr('health.card.bloodType')}</dt><dd>{person.blood_type || none}</dd></div>
      <div className="health-card-alert"><dt>{tr('health.card.allergies')}</dt><dd>{person.allergies || none}</dd></div>
      <div><dt>{tr('health.card.conditions')}</dt><dd>{person.conditions || none}</dd></div>
      <div><dt>{tr('health.card.doctor')}</dt><dd>{person.doctor_name || person.doctor_phone ? <>{person.doctor_name} {phone(person.doctor_phone)}</> : none}</dd></div>
      <div><dt>{tr('health.card.contact')}</dt><dd>{person.emergency_name || person.emergency_phone ? <>{person.emergency_name} {phone(person.emergency_phone)}</> : none}</dd></div>
    </dl>
    <h4>{tr('health.card.therapies')}</h4>
    {!therapies.length ? <p>{none}</p> : <ul>{therapies.map(t => <li key={t.id}><b>{t.name}{t.dose ? ` · ${t.dose}` : ''}</b>
      {' — '}{(t.times || []).map(hhmm).join(', ')}{t.instructions ? ` · ${t.instructions}` : ''}{t.end_on ? ` · ${tr('health.card.until', { date: short(t.end_on) })}` : ''}</li>)}</ul>}
    <h4>{tr('health.card.vaccines')}</h4>
    {!vaccines.length ? <p>{none}</p> : <ul className="health-card-vaccines">{vaccines.slice(0, MAX_VACCINES).map(v => <li key={v.id}>{v.title} · {short(v.done_on)}</li>)}
      {vaccines.length > MAX_VACCINES && <li className="muted">{tr('health.card.moreVaccines', { count: vaccines.length - MAX_VACCINES })}</li>}</ul>}
    <footer>
      <p><b>{tr('health.card.emergency')}</b></p>
      <p className="muted">{tr('health.card.updated', { date: short(today) })}</p>
    </footer>
  </article>;
}

// Finestra di scelta e anteprima; la stampa mostra solo le schede (classe extra-print-only).
export default function HealthCards({ people, therapies, appointments, today, initial, onClose }) {
  const { t: tr } = useLanguage();
  const [chosen, setChosen] = useState(() => new Set(initial ? [initial] : people.map(p => p.id)));
  const cards = useMemo(() => people.filter(p => chosen.has(p.id)).map(p => emergencyCard(p, therapies, appointments, today)), [people, chosen, therapies, appointments, today]);
  const incomplete = cards.filter(c => c.missing).map(c => c.person.name);
  const toggle = id => setChosen(set => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <>
    <section className="panel extra-panel health-card-panel" aria-labelledby="health-card-heading">
      <div className="health-person-head">
        <h2 id="health-card-heading"><Printer size={19} /> {tr('health.card.heading')}</h2>
        <button className="icon-button" aria-label={tr('health.card.close')} title={tr('health.card.close')} onClick={onClose}><X size={16} /></button>
      </div>
      <p className="muted">{tr('health.card.help')}</p>
      <fieldset className="health-card-people"><legend>{tr('health.card.who')}</legend>
        {people.map(p => <label key={p.id} className="extra-toggle"><input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />{p.name}</label>)}
      </fieldset>
      {incomplete.length > 0 && <p className="garden-warning">{tr('health.card.incomplete', { names: incomplete.join(', ') })}</p>}
      <div className="extra-buttons"><button className="btn btn-primary" disabled={!cards.length} onClick={() => window.print()}><Printer size={15} /> {tr('health.card.print')}</button></div>
      <div className="health-card-preview">{cards.map(card => <CardBody key={card.person.id} card={card} today={today} />)}</div>
    </section>
    <div className="extra-print-only health-card-print">{cards.map(card => <CardBody key={card.person.id} card={card} today={today} />)}</div>
  </>;
}
