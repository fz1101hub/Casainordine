'use client';
// Spese sanitarie di una persona (scelta dell'utente del 26 novembre 2026, notte): farmaci,
// dispositivi medici, visite, esami e ticket, con il pagamento; finiscono da sole tra le Spese
// detraibili (voce «health_expense», categoria spese sanitarie) se la casella resta spuntata.
// Cancellando la spesa il database toglie anche la voce del 730 (migrate_v62).
import { useMemo, useState } from 'react';
import { Receipt, Plus, Pencil, Trash2, Landmark } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import DecimalInput from './DecimalInput';
import ShowMore from './ShowMore';
import { EXPENSE_KINDS, EXPENSE_PAYMENTS, CASH_OK_KINDS, HEALTH_LIMITS, normalizeExpense, expenseTaxItem, expenseNeedsTraceable, expenseYear } from '../lib/health.mjs';

const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }
export const blankExpense = (today, patch = {}) => ({ id: null, spent_on: today, kind: 'pharmacy', description: '', amount: '', payment_method: 'traceable', appointment_id: '', in730: true, ...patch });

export default function HealthExpenses({ client, demo, user, homeId, person, appointments, expenses, setExpenses, taxLinks, setTaxLinks, writable, today, form, setForm, onNotify }) {
  const { t: tr, locale, date } = useLanguage();
  const [working, setWorking] = useState(false);
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [listed, setListed] = useState(50); // spese mostrate dell'anno scelto
  const money = cents => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format((Number(cents) || 0) / 100);
  const day = iso => date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  const mine = useMemo(() => expenses.filter(e => e.person_id === person.id).sort((a, b) => b.spent_on.localeCompare(a.spent_on) || String(b.id).localeCompare(String(a.id))), [expenses, person.id]);
  const years = useMemo(() => [...new Set([thisYear, thisYear - 1, ...mine.map(e => Number(e.spent_on.slice(0, 4)))])].sort((a, b) => b - a).slice(0, 6), [mine, thisYear]);
  const shown = mine.filter(e => Number(e.spent_on.slice(0, 4)) === year);
  const summary = expenseYear(mine, year);
  const linkable = !demo && !!client;
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const visits = useMemo(() => appointments.filter(a => a.person_id === person.id).sort((a, b) => b.on_date.localeCompare(a.on_date)).slice(0, 60), [appointments, person.id]);

  async function linkTax(expense) {
    const row = { ...expenseTaxItem(expense, person), user_id: user.id, home_id: homeId || null };
    const { data, error } = await client.from('home_tax_items').insert(row).select('id,source_id').single();
    if (error && error.code !== '23505') { onNotify(friendlyError(error, tr)); return false; }
    setTaxLinks(map => new Map(map).set(expense.id, data?.id || true));
    return true;
  }
  async function unlinkTax(expense) {
    const { error } = await client.from('home_tax_items').delete().eq('source', 'health_expense').eq('source_id', expense.id);
    if (error) { onNotify(friendlyError(error, tr)); return false; }
    setTaxLinks(map => { const next = new Map(map); next.delete(expense.id); return next; });
    return true;
  }

  async function save(event) {
    event.preventDefault();
    const { id, in730, ...input } = form;
    const result = normalizeExpense({ ...input, appointment_id: input.appointment_id || null }, today);
    if (result.error) { onNotify(tr(result.error)); return; }
    if (!id && mine.length >= HEALTH_LIMITS.expensesPerPerson) { onNotify(tr('health.error.expenseLimit')); return; }
    setWorking(true);
    try {
      let saved;
      if (id) {
        if (!demo) { const { error } = await client.from('health_expenses').update(result.value).eq('id', id); if (error) { onNotify(friendlyError(error, tr)); return; } }
        saved = { ...expenses.find(e => e.id === id), ...result.value };
        setExpenses(list => list.map(e => (e.id === id ? saved : e)));
      } else if (demo) {
        saved = { ...result.value, id: uid(), person_id: person.id };
        setExpenses(list => [...list, saved]);
      } else {
        const { data, error } = await client.from('health_expenses').insert({ ...result.value, person_id: person.id }).select('*').single();
        if (error) { onNotify(friendlyError(error, tr)); return; }
        saved = data; setExpenses(list => [...list, data]);
      }
      // Spese detraibili: aggiunta, aggiornata o tolta insieme alla spesa.
      let note = '';
      if (linkable) {
        const linked = taxLinks.has(saved.id);
        if (in730 && !linked) note = (await linkTax(saved)) ? tr('health.expenseIn730') : '';
        else if (in730 && linked) {
          const { tax_year, description, amount_cents, paid_on, payment_method, cash_ok } = expenseTaxItem(saved, person);
          const { error } = await client.from('home_tax_items').update({ tax_year, description, amount_cents, paid_on, payment_method, cash_ok }).eq('source', 'health_expense').eq('source_id', saved.id);
          if (error) onNotify(friendlyError(error, tr)); else note = tr('health.expenseIn730');
        } else if (!in730 && linked) await unlinkTax(saved);
      }
      onNotify([tr(id ? 'health.expenseUpdated' : 'health.expenseSaved', { amount: money(saved.amount_cents) }), note].filter(Boolean).join(' '));
      setYear(Number(saved.spent_on.slice(0, 4)));
      setForm(null);
    } finally { setWorking(false); }
  }

  async function remove(expense) {
    if (!(await askConfirm(tr(taxLinks.has(expense.id) ? 'health.expenseDeleteConfirm730' : 'health.expenseDeleteConfirm', { description: expense.description }), { danger: true }))) return;
    if (!demo) { const { error } = await client.from('health_expenses').delete().eq('id', expense.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setExpenses(list => list.filter(e => e.id !== expense.id));
    setTaxLinks(map => { const next = new Map(map); next.delete(expense.id); return next; });
    onNotify(tr('health.expenseDeleted'));
  }

  async function addTo730(expense) {
    setWorking(true);
    try { if (await linkTax(expense)) onNotify(tr('health.expenseAdded730', { description: expense.description })); } finally { setWorking(false); }
  }

  const edit = e => setForm({ ...e, amount: (Number(e.amount_cents) / 100).toFixed(2), payment_method: e.payment_method || '', appointment_id: e.appointment_id || '', in730: taxLinks.has(e.id) });

  return <div className="health-expenses">
    <h3><Receipt size={16} /> {tr('health.expenses')}</h3>
    <div className="health-expense-years" role="group" aria-label={tr('health.expenseYears')}>
      {years.map(y => <button key={y} className={`btn ${y === year ? 'btn-primary' : 'btn-soft'}`} aria-pressed={y === year} onClick={() => { setYear(y); setListed(50); }}>{y}</button>)}
    </div>
    <p className="health-expense-total">{tr('health.expenseTotal', { year, amount: money(summary.total_cents), count: summary.count })}</p>
    {!shown.length ? <p className="muted">{tr('health.expensesEmpty')}</p> : <><ul className="health-list">{shown.slice(0, listed).map(e => {
      const linked = taxLinks.has(e.id);
      return <li key={e.id}>
        <span><b>{e.description} · {money(e.amount_cents)}</b>
          <small>{[day(e.spent_on), tr('health.expenseKind.' + e.kind), e.payment_method ? tr('health.payment.' + e.payment_method) : tr('health.paymentUnknown')].join(' · ')}</small>
          {expenseNeedsTraceable(e) && <small className="garden-warning">{tr('health.expenseTraceable')}</small>}
          {linkable && <small>{linked ? <span className="extra-pill health-v-done"><Landmark size={11} /> {tr('health.in730')}</span> : <span className="extra-pill health-v-booked">{tr('health.not730')}</span>}</small>}</span>
        {writable && <span className="extra-buttons">
          {linkable && !linked && <button className="btn btn-soft" disabled={working} aria-label={tr('health.add730Aria', { description: e.description })} onClick={() => addTo730(e)}><Landmark size={15} /> {tr('health.add730')}</button>}
          <button className="icon-button" aria-label={tr('health.editExpenseAria', { description: e.description })} title={tr('health.edit')} onClick={() => edit(e)}><Pencil size={16} /></button>
          <button className="icon-button danger" aria-label={tr('health.deleteExpenseAria', { description: e.description })} title={tr('health.delete')} onClick={() => remove(e)}><Trash2 size={16} /></button>
        </span>}
      </li>;
    })}</ul>
    <ShowMore shown={Math.min(listed, shown.length)} total={shown.length} onMore={setListed} /></>}
    {writable && !form && <button className="btn btn-soft" onClick={() => setForm(blankExpense(today))}><Plus size={15} /> {tr('health.addExpense')}</button>}
    {form && <form className="extra-form garden-inline" onSubmit={save}>
      <h3>{tr(form.id ? 'health.editExpense' : 'health.addExpense')}</h3>
      <div className="extra-row">
        <Field label={tr('health.expenseKind')}><select value={form.kind} onChange={e => set({ kind: e.target.value })}>{EXPENSE_KINDS.map(k => <option key={k} value={k}>{tr('health.expenseKind.' + k)}</option>)}</select></Field>
        <Field label={tr('health.spentOn')}><input type="date" required max={today} value={form.spent_on} onChange={e => set({ spent_on: e.target.value })} /></Field>
      </div>
      <Field label={tr('health.expenseDescription')}><input required minLength={2} maxLength={HEALTH_LIMITS.expenseDescription} value={form.description} placeholder={tr('health.expenseDescriptionPlaceholder')} onChange={e => set({ description: e.target.value })} /></Field>
      <div className="extra-row">
        <Field label={tr('health.expenseAmount')}><DecimalInput required decimals={2} min="0.01" max={HEALTH_LIMITS.maxCents / 100} value={form.amount} onChange={e => set({ amount: e.target.value })} /></Field>
        <Field label={tr('health.paymentLabel')}><select value={form.payment_method || ''} onChange={e => set({ payment_method: e.target.value })}><option value="">{tr('health.paymentUnknown')}</option>{EXPENSE_PAYMENTS.map(m => <option key={m} value={m}>{tr('health.payment.' + m)}</option>)}</select></Field>
      </div>
      <small className={expenseNeedsTraceable(form) ? 'garden-warning' : 'muted'}>{tr(CASH_OK_KINDS.includes(form.kind) ? 'health.expenseCashOk' : 'health.expenseTraceable')}</small>
      {visits.length > 0 && <Field label={tr('health.expenseVisit')}><select value={form.appointment_id || ''} onChange={e => set({ appointment_id: e.target.value })}><option value="">{tr('health.expenseNoVisit')}</option>
        {visits.map(a => <option key={a.id} value={a.id}>{day(a.on_date)} · {a.title}</option>)}</select></Field>}
      {linkable ? <label className="extra-toggle"><input type="checkbox" checked={form.in730} onChange={e => set({ in730: e.target.checked })} />{tr('health.expenseTo730')}</label>
        : <small className="muted">{tr('health.expense730Demo')}</small>}
      <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('health.save')}</button><button type="button" className="btn btn-soft" onClick={() => setForm(null)}>{tr('health.cancel')}</button></div>
    </form>}
    <p className="muted health-expense-help">{tr('health.expensesHelp')}</p>
  </div>;
}
