'use client';
// Spese detraibili per il 730 (scelta dell'utente del 25 novembre 2026, sera): voci per anno e
// categoria, prese dalle bollette pagate, dalle spese di casa, dai lavori e dal veterinario o scritte
// a mano; cosa controllare (pagamento, documento, codice fiscale); riepilogo, CSV e stampa per il
// commercialista. Non calcola il rimborso: mostra le regole principali e rimanda al commercialista.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Plus, Pencil, Trash2, Info, Download, Printer, AlertTriangle, FileText, Inbox } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import ShowMore from './ShowMore';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { selectAll, selectIn } from '../lib/select-all.mjs';
import { uploadHouseDocument } from '../lib/document-upload.mjs';
import { saveBlob } from '../lib/file-download.js';
import { preparePhoto, looksHeic } from '../lib/image-prepare.js';
import DecimalInput from './DecimalInput';
import { TAX_CATEGORIES, PAYMENT_METHODS, TAX_LIMITS, PAYMENT_NEEDED, taxRuleKey, normalizeTaxItem, itemWarnings, yearSummary, taxYears, taxCandidates, taxCsv, validTaxCode } from '../lib/taxes.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const blankItem = (year, today) => ({ id: null, category: 'renovation', description: '', amount: '', paid_on: String(year) === today.slice(0, 4) ? today : `${year}-12-31`, payment_method: 'tax_transfer', supplier: '', supplier_tax_code: '', notes: '', cash_ok: false, file: null });

function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

function TaxesSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, locale, date } = useLanguage();
  const today = todayRome();
  const [items, setItems] = useState([]), [docs, setDocs] = useState({}), [sources, setSources] = useState({});
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [working, setWorking] = useState(false);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [form, setForm] = useState(null), [showCandidates, setShowCandidates] = useState(false), [picked, setPicked] = useState({});
  // Elenchi lunghi a pagine (prova con tanti dati): si riparte da capo cambiando anno.
  const [itemsShown, setItemsShown] = useState(100), [candidatesShown, setCandidatesShown] = useState(50);
  const writable = demo || canWrite;
  const money = cents => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format((Number(cents) || 0) / 100);
  const day = iso => (iso ? date(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const scope = useCallback(query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user?.id).is('home_id', null)), [homeId, user?.id]);

  const load = useCallback(async () => {
    if (demo || !client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const list = await selectAll(count => scope(client.from('home_tax_items').select('*', count ? { count: 'exact' } : undefined)).order('paid_on', { ascending: false }).order('id'));
    if (list.error) { setLoading(false); if (MISSING_TABLE.has(list.error.code)) setMissing(true); else onNotify(friendlyError(list.error, tr)); return; }
    setMissing(false); setItems(list.data || []);
    const ids = [...new Set((list.data || []).map(i => i.document_id).filter(Boolean))];
    const found = ids.length ? await selectIn((part, count) => client.from('home_documents').select('id,name', count ? { count: 'exact' } : undefined).in('id', part).order('id'), ids) : { data: [] };
    setDocs(Object.fromEntries((found.data || []).map(d => [d.id, d])));
    setLoading(false);
  }, [client, demo, scope, user?.id]);
  useEffect(() => { setItems([]); setDocs({}); setSources({}); setForm(null); setShowCandidates(false); load(); }, [load]);

  // Spese dell'anno da cui partire: lette quando si apre l'elenco. Se una sezione manca, si salta.
  const loadSources = useCallback(async () => {
    if (demo || !client || !user?.id) return;
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const safe = result => (result?.error ? [] : result?.data || []);
    const [bills, expenses, projects, pets, people, plans] = await Promise.all([
      selectAll(count => scope(client.from('bills').select('id,title,supplier,amount,paid_at', count ? { count: 'exact' } : undefined)).gte('paid_at', from).lte('paid_at', `${to}T23:59:59Z`).order('id')),
      homeId ? selectAll(count => client.from('home_expenses').select('id,title,amount,incurred_on', count ? { count: 'exact' } : undefined).eq('home_id', homeId).gte('incurred_on', from).lte('incurred_on', to).order('id')) : { data: [] },
      scope(client.from('home_projects').select('id,title')).limit(300),
      scope(client.from('home_pets').select('id,name')).limit(100),
      scope(client.from('health_people').select('id,name')).limit(100),
      scope(client.from('payment_plans').select('id,title,payee,tax_category')).not('tax_category', 'is', null).limit(300),
    ]);
    const projectIds = safe(projects).map(p => p.id), petIds = safe(pets).map(p => p.id), billIds = safe(bills).map(b => b.id), personIds = safe(people).map(p => p.id), planIds = safe(plans).map(p => p.id);
    const [projectExpenses, petLog, billDocuments, healthExpenses, installments] = await Promise.all([
      projectIds.length ? selectIn((part, count) => client.from('home_project_expenses').select('id,project_id,description,amount,paid_on,document_id', count ? { count: 'exact' } : undefined).in('project_id', part).gte('paid_on', from).lte('paid_on', to).order('id'), projectIds) : { data: [] },
      petIds.length ? selectIn((part, count) => client.from('home_pet_log').select('id,pet_id,title,cost_cents,done_on,document_id', count ? { count: 'exact' } : undefined).in('pet_id', part).gt('cost_cents', 0).gte('done_on', from).lte('done_on', to).order('id'), petIds) : { data: [] },
      billIds.length ? selectIn((part, count) => client.from('home_documents').select('id,bill_id', count ? { count: 'exact' } : undefined).in('bill_id', part).order('id'), billIds) : { data: [] },
      personIds.length ? selectIn((part, count) => client.from('health_expenses').select('id,person_id,kind,description,amount_cents,spent_on,payment_method', count ? { count: 'exact' } : undefined).in('person_id', part).gte('spent_on', from).lte('spent_on', to).order('id'), personIds) : { data: [] },
      planIds.length ? selectIn((part, count) => client.from('payment_installments').select('id,plan_id,label,amount_cents,paid_on,paid_cents', count ? { count: 'exact' } : undefined).in('plan_id', part).gte('paid_on', from).lte('paid_on', to).order('id'), planIds) : { data: [] },
    ]);
    setSources({ year, bills: safe(bills), expenses: safe(expenses), projects: safe(projects), projectExpenses: safe(projectExpenses), pets: safe(pets), petLog: safe(petLog), billDocuments: safe(billDocuments),
      healthPeople: safe(people), healthExpenses: safe(healthExpenses), plans: safe(plans), installments: safe(installments) });
  }, [client, demo, homeId, scope, user?.id, year]);
  useEffect(() => { if (showCandidates && sources.year !== year) loadSources(); }, [showCandidates, year, sources.year, loadSources]);

  const years = useMemo(() => taxYears(items, today), [items, today]);
  const yearItems = useMemo(() => items.filter(i => Number(i.tax_year) === year).sort((a, b) => String(b.paid_on || '').localeCompare(String(a.paid_on || ''))), [items, year]);
  const summary = useMemo(() => yearSummary(items, year), [items, year]);
  const total = summary.reduce((s, r) => s + r.total_cents, 0);
  const candidates = useMemo(() => (sources.year === year ? taxCandidates(sources, year, items) : []), [sources, year, items]);

  async function attach(picked, label) {
    if (!picked) return null;
    // Foto della ricevuta (anche HEIC dell'iPhone o molto pesanti): JPEG leggero, come nell'archivio.
    let file = picked;
    if (picked.type?.startsWith('image/') || looksHeic(picked)) {
      try { file = (await preparePhoto(picked)).file; } catch (error) { onNotify(friendlyError(error, tr)); return undefined; }
    }
    if (demo) { const id = uid(); setDocs(all => ({ ...all, [id]: { id, name: file.name } })); return id; }
    try {
      const { id } = await uploadHouseDocument(client, { file, userId: user.id, homeId: homeId || null, docType: 'ricevuta', notes: label });
      setDocs(all => ({ ...all, [id]: { id, name: file.name } }));
      return id;
    } catch (error) { onNotify(error?.i18nKey ? tr(error.i18nKey) : tr('extra.archive.uploadError', { error: friendlyError(error, tr) })); return undefined; }
  }

  async function saveItem(event) {
    event.preventDefault();
    const { id, file, ...input } = form;
    const result = normalizeTaxItem({ ...input, tax_year: year, document_id: form.document_id || null });
    if (result.error) { onNotify(tr(result.error)); return; }
    if (!id && items.length >= TAX_LIMITS.perSpace) { onNotify(tr('taxes.error.limit')); return; }
    setWorking(true);
    try {
      const documentId = file ? await attach(file, result.value.description) : result.value.document_id;
      if (documentId === undefined) return;
      const row = { ...result.value, document_id: documentId };
      if (id) {
        if (!demo) { const { error } = await client.from('home_tax_items').update(row).eq('id', id); if (error) { onNotify(friendlyError(error, tr)); return; } }
        setItems(list => list.map(i => (i.id === id ? { ...i, ...row } : i)));
        onNotify(tr('taxes.updated'));
      } else {
        const made = await insert({ ...row, source: 'manual', source_id: null });
        if (!made) return;
        onNotify(tr('taxes.saved'));
      }
      setForm(null);
    } finally { setWorking(false); }
  }

  async function insert(row) {
    if (demo) { const made = { ...row, id: uid(), home_id: homeId || null }; setItems(list => [made, ...list]); return made; }
    const { data, error } = await client.from('home_tax_items').insert({ ...row, user_id: user.id, home_id: homeId || null }).select('*').single();
    if (error) { onNotify(error.code === '23505' ? tr('taxes.error.already') : friendlyError(error, tr)); return null; }
    setItems(list => [data, ...list]);
    return data;
  }

  // Una spesa dell'elenco diventa una voce detraibile (una volta sola: il database lo controlla).
  async function addCandidate(candidate) {
    const category = picked[`${candidate.source}:${candidate.source_id}`] || candidate.category;
    const payment = candidate.source === 'health_expense' ? candidate.payment_method : candidate.source === 'pet_log' || candidate.source === 'bill' ? 'traceable' : PAYMENT_NEEDED[category] || null;
    const result = normalizeTaxItem({ ...candidate, category, tax_year: year, payment_method: payment });
    if (result.error) { onNotify(tr(result.error)); return; }
    setWorking(true);
    try {
      const made = await insert({ ...result.value, source: candidate.source, source_id: candidate.source_id });
      if (made) onNotify(tr('taxes.added', { description: made.description }));
    } finally { setWorking(false); }
  }

  async function deleteItem(item) {
    if (!(await askConfirm(tr('taxes.deleteConfirm', { description: item.description }), { danger: true }))) return;
    if (!demo) { const { error } = await client.from('home_tax_items').delete().eq('id', item.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setItems(list => list.filter(i => i.id !== item.id));
    onNotify(tr('taxes.deleted'));
  }

  function exportCsv() {
    const rows = yearItems.map(i => ({ ...i, document_name: docs[i.document_id]?.name || '' }));
    saveBlob(new Blob([taxCsv(rows, year, tr)], { type: 'text/csv;charset=utf-8' }), tr('taxes.csvName', { year }));
  }

  const set = patch => setForm(f => ({ ...f, ...patch }));
  const warningText = item => itemWarnings(item).map(w => tr('taxes.warning.' + w)).join(' ');
  const sourceLabel = item => (item.source && item.source !== 'manual' ? tr('taxes.source.' + item.source) : '');

  return <div className="extra-main taxes">
    <div className="page-heading"><div><div className="eyebrow">{tr('taxes.eyebrow')}</div><h1>{tr('nav.taxes')}</h1><p>{tr('taxes.help')}</p></div></div>
    <div className="informative taxes-disclaimer"><Info size={17} /><p>{tr('taxes.disclaimer')}</p></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('taxes.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('taxes.demo')}</p></div>}
    {!demo && !missing && !canWrite && <div className="informative"><Info size={17} /><p>{tr('taxes.readOnly')}</p></div>}
    {!missing && <div className="extra-layout">
      <section className="panel extra-panel">
        <div className="taxes-year">
          <Field label={tr('taxes.year')}><select value={year} onChange={e => { setYear(Number(e.target.value)); setForm(null); setItemsShown(100); setCandidatesShown(50); }}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></Field>
          <small className="muted">{tr('taxes.yearHelp', { year, next: year + 1 })}</small>
        </div>
        <h2><Receipt size={19} /> {tr('taxes.summary', { year })}</h2>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !summary.length ? <p className="muted">{tr('taxes.summaryEmpty')}</p> : <>
          <ul className="taxes-summary">{summary.map(row => <li key={row.category}>
            <span><b>{tr('taxes.category.' + row.category)}</b><small>{tr('taxes.items', { count: row.count })}{row.warnings ? ' · ' + tr('taxes.toCheck', { count: row.warnings }) : ''}</small></span>
            <b>{money(row.total_cents)}</b>
            <small className="taxes-rule">{tr(taxRuleKey(row.category, year))}</small>
          </li>)}</ul>
          <p className="taxes-total"><span>{tr('taxes.total')}</span><b>{money(total)}</b></p>
          <div className="extra-buttons">
            <button className="btn btn-soft" onClick={exportCsv}><Download size={15} /> {tr('taxes.exportCsv')}</button>
            <button className="btn btn-soft" onClick={() => window.print()}><Printer size={15} /> {tr('taxes.print')}</button>
          </div>
        </>}
        {writable && !form && <div className="extra-buttons">
          <button className="btn btn-primary" onClick={() => setForm(blankItem(year, today))}><Plus size={15} /> {tr('taxes.add')}</button>
          {!demo && <button className="btn btn-soft" aria-expanded={showCandidates} onClick={() => setShowCandidates(v => !v)}><Inbox size={15} /> {tr('taxes.fromExpenses')}</button>}
        </div>}
        {form && <form className="extra-form" onSubmit={saveItem}>
          <h3>{tr(form.id ? 'taxes.edit' : 'taxes.add')}</h3>
          <div className="extra-row">
            <Field label={tr('taxes.categoryLabel')}><select value={form.category} onChange={e => set({ category: e.target.value, ...(PAYMENT_NEEDED[e.target.value] === 'tax_transfer' ? { payment_method: 'tax_transfer' } : {}) })}>{TAX_CATEGORIES.map(c => <option key={c} value={c}>{tr('taxes.category.' + c)}</option>)}</select></Field>
            <Field label={tr('taxes.amount')}><DecimalInput required decimals={2} min="0.01" max={TAX_LIMITS.maxCents / 100} value={form.amount} onChange={e => set({ amount: e.target.value })} /></Field>
          </div>
          <small className="muted">{tr(taxRuleKey(form.category, year))}</small>
          <Field label={tr('taxes.description')}><input required minLength={2} maxLength={TAX_LIMITS.description} value={form.description} placeholder={tr('taxes.descriptionPlaceholder')} onChange={e => set({ description: e.target.value })} /></Field>
          <div className="extra-row">
            <Field label={tr('taxes.paidOn')}><input type="date" value={form.paid_on || ''} onChange={e => set({ paid_on: e.target.value })} /></Field>
            <Field label={tr('taxes.paymentLabel')}><select value={form.payment_method || ''} onChange={e => set({ payment_method: e.target.value || null })}><option value="">{tr('taxes.paymentNone')}</option>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{tr('taxes.payment.' + m)}</option>)}</select></Field>
          </div>
          {form.category === 'medical' && <label className="extra-toggle"><input type="checkbox" checked={form.cash_ok === true} onChange={e => set({ cash_ok: e.target.checked })} />{tr('taxes.cashOk')}</label>}
          <div className="extra-row">
            <Field label={tr('taxes.supplier')}><input maxLength={TAX_LIMITS.supplier} value={form.supplier} onChange={e => set({ supplier: e.target.value })} /></Field>
            <Field label={tr('taxes.taxCode')}><input maxLength={TAX_LIMITS.taxCode} autoCapitalize="characters" value={form.supplier_tax_code} onChange={e => set({ supplier_tax_code: e.target.value })} /></Field>
          </div>
          {form.supplier_tax_code && !validTaxCode(form.supplier_tax_code) && <small className="garden-warning">{tr('taxes.taxCodeCheck')}</small>}
          {PAYMENT_NEEDED[form.category] === 'tax_transfer' && form.payment_method !== 'tax_transfer' && <small className="garden-warning">{tr('taxes.warning.transfer')}</small>}
          <Field label={tr(form.document_id ? 'taxes.replaceDocument' : 'taxes.document')}><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.heic,.heif,image/heic,image/heif" onChange={e => set({ file: e.target.files?.[0] || null })} /></Field>
          {form.document_id && <small className="muted"><FileText size={13} /> {docs[form.document_id]?.name || tr('taxes.documentLinked')}</small>}
          <Field label={tr('taxes.notes')}><textarea rows={2} maxLength={TAX_LIMITS.notes} value={form.notes} onChange={e => set({ notes: e.target.value })} /></Field>
          <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('taxes.save')}</button><button type="button" className="btn btn-soft" onClick={() => setForm(null)}>{tr('taxes.cancel')}</button></div>
        </form>}
        {showCandidates && !form && <div className="taxes-candidates">
          <h3>{tr('taxes.candidatesTitle', { year })}</h3>
          <p className="muted">{tr('taxes.candidatesHelp')}</p>
          {sources.year !== year ? <p className="muted">{tr('general.loading')}</p> : !candidates.length ? <p className="muted">{tr('taxes.candidatesEmpty')}</p> :
          <ul>{candidates.slice(0, candidatesShown).map(c => { const key = `${c.source}:${c.source_id}`; return <li key={key}>
            <span><b>{c.description}</b><small>{day(c.paid_on)} · {money(c.amount_cents)} · {tr('taxes.source.' + c.source)}</small></span>
            <span className="extra-buttons">
              <select aria-label={tr('taxes.categoryFor', { description: c.description })} value={picked[key] || c.category} onChange={e => setPicked(p => ({ ...p, [key]: e.target.value }))}>{TAX_CATEGORIES.map(cat => <option key={cat} value={cat}>{tr('taxes.category.' + cat)}</option>)}</select>
              <button className="btn btn-soft" disabled={working} aria-label={tr('taxes.addCandidateAria', { description: c.description })} onClick={() => addCandidate(c)}><Plus size={15} /> {tr('taxes.addCandidate')}</button>
            </span>
          </li>; })}</ul>}
          <ShowMore shown={Math.min(candidatesShown, candidates.length)} total={candidates.length} onMore={setCandidatesShown} />
        </div>}
      </section>

      <section className="panel extra-panel">
        <h2><FileText size={19} /> {tr('taxes.list', { year })}</h2>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !yearItems.length ? <p className="muted">{tr('taxes.listEmpty')}</p> :
        <><ul className="taxes-items">{yearItems.slice(0, itemsShown).map(item => { const warn = itemWarnings(item); return <li key={item.id}>
          <span>
            <b>{item.description}</b>
            <small>{[day(item.paid_on), tr('taxes.category.' + item.category), item.payment_method ? tr('taxes.payment.' + item.payment_method) : '', item.supplier, item.supplier_tax_code, sourceLabel(item)].filter(Boolean).join(' · ')}</small>
            {item.document_id && <small><FileText size={12} /> {docs[item.document_id]?.name || tr('taxes.documentLinked')}</small>}
            {warn.length > 0 && <small className="garden-warning"><AlertTriangle size={12} /> {warningText(item)}</small>}
          </span>
          <b>{money(item.amount_cents)}</b>
          {writable && <span className="extra-buttons">
            <button className="icon-button" aria-label={tr('taxes.editAria', { description: item.description })} title={tr('taxes.edit')} onClick={() => setForm({ ...item, amount: (Number(item.amount_cents) / 100).toFixed(2), file: null, supplier: item.supplier || '', supplier_tax_code: item.supplier_tax_code || '', notes: item.notes || '' })}><Pencil size={16} /></button>
            <button className="icon-button danger" aria-label={tr('taxes.deleteAria', { description: item.description })} title={tr('taxes.delete')} onClick={() => deleteItem(item)}><Trash2 size={16} /></button>
          </span>}
        </li>; })}</ul>
        <ShowMore shown={Math.min(itemsShown, yearItems.length)} total={yearItems.length} step={100} onMore={setItemsShown} /></>}
      </section>
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.taxes.json).
export default function Taxes(props) {
  const { t } = useLanguage();
  const ready = useSection('taxes');
  return ready ? <TaxesSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}
