'use client';
// Progetti e lavori (Fase 2, 3.3): scheda del lavoro con fasi, preventivi (anche da professionisti di
// fiducia), spese e foto prima/durante/dopo; i conti dicono budget, accettato, speso e residuo.
import { selectIn } from '../lib/select-all.mjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Hammer, Plus, Trash2, Pencil, FileText, Camera, Info, Check } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { uploadHouseDocument, IMAGE_MIME_TYPES } from '../lib/document-upload.mjs';
import { PROJECT_STATUSES, QUOTE_STATUSES, PHOTO_KINDS, PROJECT_LIMITS, normalizeProject, normalizePhase, normalizeQuote, normalizeExpense, projectSummary, sortPhases, photosByKind } from '../lib/projects.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const TABLES = Object.freeze({ phases: 'home_project_phases', quotes: 'home_project_quotes', expenses: 'home_project_expenses', photos: 'home_project_photos' });
const EMPTY = Object.freeze({ phases: [], quotes: [], expenses: [], photos: [] });
const blankProject = () => ({ id: null, title: '', status: 'planning', budget: '', start_on: '', end_on: '', notes: '' });
const blankQuote = () => ({ professional_id: '', supplier: '', amount: '', received_on: '', status: 'pending', notes: '', file: null });
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

function ProjectsSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, money, date } = useLanguage();
  const day = iso => (iso ? date(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const today = todayRome();
  const [projects, setProjects] = useState([]), [items, setItems] = useState(EMPTY), [docs, setDocs] = useState({}), [pros, setPros] = useState([]);
  const [selectedId, setSelectedId] = useState(null), [form, setForm] = useState(blankProject()), [showForm, setShowForm] = useState(false);
  const [phase, setPhase] = useState({ title: '', due_on: '' }), [quote, setQuote] = useState(blankQuote()), [expense, setExpense] = useState({ description: '', amount: '', paid_on: today, quote_id: '' });
  const [photoKind, setPhotoKind] = useState('before');
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [busy, setBusy] = useState('');
  const writable = demo || canWrite;
  const scope = useCallback(query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user?.id).is('home_id', null)), [homeId, user?.id]);

  // Collegamenti temporanei ai file (foto e preventivi): validi un'ora, solo per chi può vedere il documento.
  const attachDocuments = useCallback(async (ids) => {
    if (!ids.length) return {};
    const { data } = await selectIn((part, count) => client.from('home_documents').select('id,storage_path,name,mime_type', count ? { count: 'exact' } : undefined).in('id', part).order('id'), ids);
    const rows = data || [];
    const signed = rows.length ? await client.storage.from('house-documents').createSignedUrls(rows.map(r => r.storage_path), 3600) : { data: [] };
    const urls = new Map((signed.data || []).map(s => [s.path, s.signedUrl]));
    return Object.fromEntries(rows.map(r => [r.id, { ...r, url: urls.get(r.storage_path) || '' }]));
  }, [client]);

  const load = useCallback(async () => {
    if (demo || !client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const list = await scope(client.from('home_projects').select('*')).order('updated_at', { ascending: false }).limit(PROJECT_LIMITS.perSpace);
    if (list.error) {
      setLoading(false);
      if (MISSING_TABLE.has(list.error.code)) setMissing(true); else onNotify(friendlyError(list.error, tr));
      return;
    }
    const ids = (list.data || []).map(p => p.id);
    const [children, professionals] = await Promise.all([
      Promise.all(Object.entries(TABLES).map(([key, table]) => (ids.length ? client.from(table).select('*').in('project_id', ids).order('created_at').limit(2000) : Promise.resolve({ data: [] })).then(r => [key, r]))),
      scope(client.from('home_professionals').select('id,name,trade')).order('name').limit(300),
    ]);
    const next = { ...EMPTY };
    for (const [key, result] of children) { if (result.error) { onNotify(friendlyError(result.error, tr)); } next[key] = result.data || []; }
    const docIds = [...new Set([...next.quotes, ...next.expenses, ...next.photos].map(r => r.document_id).filter(Boolean))];
    const documents = await attachDocuments(docIds);
    setLoading(false); setMissing(false);
    setProjects(list.data || []); setItems(next); setDocs(documents); setPros(professionals.error ? [] : professionals.data || []);
    setSelectedId(current => (current && ids.includes(current) ? current : ids[0] || null));
  }, [client, demo, user?.id, scope, attachDocuments]);
  useEffect(() => { setProjects([]); setItems(EMPTY); setDocs({}); setSelectedId(null); setShowForm(false); load(); }, [load]);

  const project = projects.find(p => p.id === selectedId) || null;
  const own = useMemo(() => Object.fromEntries(Object.keys(TABLES).map(key => [key, items[key].filter(row => row.project_id === selectedId)])), [items, selectedId]);
  const summary = project ? projectSummary(project, own) : null;
  const summaries = useMemo(() => Object.fromEntries(projects.map(p => [p.id, projectSummary(p, Object.fromEntries(Object.keys(TABLES).map(key => [key, items[key].filter(row => row.project_id === p.id)])))])), [projects, items]);

  // Scrittura di una voce del progetto: nel database, o nella pagina durante la prova.
  async function insertItem(key, row) {
    if (demo) { const created = { ...row, id: uid(), created_at: new Date().toISOString() }; setItems(all => ({ ...all, [key]: [...all[key], created] })); return created; }
    const { data, error } = await client.from(TABLES[key]).insert(row).select('*').single();
    if (error) { onNotify(friendlyError(error, tr)); return null; }
    setItems(all => ({ ...all, [key]: [...all[key], data] }));
    return data;
  }
  async function updateItem(key, id, patch) {
    if (!demo) { const { error } = await client.from(TABLES[key]).update(patch).eq('id', id); if (error) { onNotify(friendlyError(error, tr)); return false; } }
    setItems(all => ({ ...all, [key]: all[key].map(row => (row.id === id ? { ...row, ...patch } : row)) }));
    return true;
  }
  async function deleteItem(key, id) {
    if (!(await askConfirm(tr('project.deleteItemConfirm'), { danger: true }))) return false;
    if (!demo) { const { error } = await client.from(TABLES[key]).delete().eq('id', id); if (error) { onNotify(friendlyError(error, tr)); return false; } }
    setItems(all => ({ ...all, [key]: all[key].filter(row => row.id !== id) }));
    return true;
  }

  async function saveProject(event) {
    event.preventDefault();
    const result = normalizeProject(form);
    if (result.error) { onNotify(tr(result.error)); return; }
    if (!form.id && projects.length >= PROJECT_LIMITS.perSpace) { onNotify(tr('project.error.limit')); return; }
    const value = result.value;
    if (demo) {
      const id = form.id || uid();
      setProjects(list => (form.id ? list.map(p => (p.id === id ? { ...p, ...value } : p)) : [{ ...value, id, updated_at: new Date().toISOString() }, ...list]));
      setSelectedId(id);
    } else {
      setBusy('project');
      const { data, error } = form.id
        ? await client.from('home_projects').update(value).eq('id', form.id).select('*').single()
        : await client.from('home_projects').insert({ ...value, home_id: homeId || null }).select('*').single();
      setBusy('');
      if (error) { onNotify(friendlyError(error, tr)); return; }
      setProjects(list => (form.id ? list.map(p => (p.id === data.id ? data : p)) : [data, ...list]));
      setSelectedId(data.id);
    }
    onNotify(tr(form.id ? 'project.updated' : 'project.saved'));
    setForm(blankProject()); setShowForm(false);
  }

  async function removeProject() {
    if (!project || !(await askConfirm(tr('project.deleteConfirm'), { danger: true }))) return;
    if (!demo) { const { error } = await client.from('home_projects').delete().eq('id', project.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setProjects(list => list.filter(p => p.id !== project.id));
    setItems(all => Object.fromEntries(Object.entries(all).map(([key, rows]) => [key, rows.filter(row => row.project_id !== project.id)])));
    setSelectedId(null);
    onNotify(tr('project.deleted'));
  }

  async function setStatus(status) {
    if (!demo) { const { error } = await client.from('home_projects').update({ status }).eq('id', project.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setProjects(list => list.map(p => (p.id === project.id ? { ...p, status } : p)));
  }

  async function addPhase(event) {
    event.preventDefault();
    const result = normalizePhase(phase);
    if (result.error) { onNotify(tr(result.error)); return; }
    if (await insertItem('phases', { ...result.value, project_id: project.id, position: own.phases.length })) setPhase({ title: '', due_on: '' });
  }

  // File allegato (preventivo in PDF o foto): nell'archivio dello stesso spazio del progetto.
  async function upload(file, docType, types) {
    if (demo) { const id = uid(); setDocs(all => ({ ...all, [id]: { id, name: file.name, mime_type: file.type, url: URL.createObjectURL(file) } })); return id; }
    try {
      const { id } = await uploadHouseDocument(client, { file, userId: user.id, homeId: homeId || null, docType, notes: project.title, types });
      const attached = await attachDocuments([id]);
      setDocs(all => ({ ...all, ...attached }));
      return id;
    } catch (error) {
      onNotify(error?.i18nKey ? tr(error.i18nKey) : tr('extra.archive.uploadError', { error: friendlyError(error, tr) }));
      return null;
    }
  }

  async function addQuote(event) {
    event.preventDefault();
    const result = normalizeQuote(quote);
    if (result.error) { onNotify(tr(result.error)); return; }
    setBusy('quote');
    const document_id = quote.file ? await upload(quote.file, 'preventivo') : null;
    if (quote.file && !document_id) { setBusy(''); return; }
    const created = await insertItem('quotes', { ...result.value, project_id: project.id, document_id });
    setBusy('');
    if (created) { setQuote(blankQuote()); onNotify(tr('project.quoteSaved')); }
  }

  async function addExpense(event) {
    event.preventDefault();
    const result = normalizeExpense(expense);
    if (result.error) { onNotify(tr(result.error)); return; }
    if (await insertItem('expenses', { ...result.value, project_id: project.id })) { setExpense({ description: '', amount: '', paid_on: today, quote_id: '' }); onNotify(tr('project.expenseSaved')); }
  }

  async function addPhoto(file) {
    if (!file) return;
    if (!IMAGE_MIME_TYPES.includes(file.type)) { onNotify(tr('project.error.photo')); return; }
    setBusy('photo');
    const document_id = await upload(file, 'foto', IMAGE_MIME_TYPES);
    if (document_id && !own.photos.some(p => p.document_id === document_id)) await insertItem('photos', { project_id: project.id, document_id, kind: photoKind });
    setBusy('');
  }

  // Togliere una foto la toglie anche dall'archivio: il file non serve più a nient'altro.
  async function removePhoto(photo) {
    if (!(await askConfirm(tr('project.deletePhotoConfirm'), { danger: true }))) return;
    if (!demo) {
      const document = docs[photo.document_id];
      if (document?.storage_path) { const { error } = await client.storage.from('house-documents').remove([document.storage_path]); if (error) { onNotify(friendlyError(error, tr)); return; } }
      const { error } = await client.from('home_documents').delete().eq('id', photo.document_id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setItems(all => ({ ...all, photos: all.photos.filter(p => p.id !== photo.id) }));
  }

  const supplierName = q => (q.professional_id ? pros.find(p => p.id === q.professional_id)?.name : '') || q.supplier || tr('project.unknownSupplier');
  const editProject = p => { setForm({ id: p.id, title: p.title, status: p.status, budget: p.budget ?? '', start_on: p.start_on || '', end_on: p.end_on || '', notes: p.notes || '' }); setShowForm(true); };
  const set = setter => patch => setter(state => ({ ...state, ...patch }));

  const projectForm = <form className="extra-form" onSubmit={saveProject}>
    <Field label={tr('project.title')}><input required minLength={2} maxLength={PROJECT_LIMITS.title} value={form.title} placeholder={tr('project.titlePlaceholder')} onChange={e => set(setForm)({ title: e.target.value })} /></Field>
    <div className="extra-row">
      <Field label={tr('project.status')}><select value={form.status} onChange={e => set(setForm)({ status: e.target.value })}>{PROJECT_STATUSES.map(s => <option key={s} value={s}>{tr('project.status.' + s)}</option>)}</select></Field>
      <Field label={tr('project.budget')}><input type="number" inputMode="decimal" min="0" step="0.01" value={form.budget} onChange={e => set(setForm)({ budget: e.target.value })} /></Field>
    </div>
    <div className="extra-row">
      <Field label={tr('project.start')}><input type="date" value={form.start_on} onChange={e => set(setForm)({ start_on: e.target.value })} /></Field>
      <Field label={tr('project.end')}><input type="date" value={form.end_on} onChange={e => set(setForm)({ end_on: e.target.value })} /></Field>
    </div>
    <Field label={tr('project.notes')}><textarea rows={3} maxLength={PROJECT_LIMITS.notes} value={form.notes} onChange={e => set(setForm)({ notes: e.target.value })} /></Field>
    <div className="extra-buttons">
      <button className="btn btn-primary" disabled={busy === 'project'}>{tr(form.id ? 'project.update' : 'project.create')}</button>
      <button type="button" className="btn btn-soft" onClick={() => { setForm(blankProject()); setShowForm(false); }}>{tr('project.cancel')}</button>
    </div>
  </form>;

  return <div className="extra-main projects">
    <div className="page-heading"><div><div className="eyebrow">{tr('project.eyebrow')}</div><h1>{tr('nav.projects')}</h1><p>{tr('project.help')}</p></div>
      {writable && !missing && !showForm && <button className="btn btn-primary" onClick={() => { setForm(blankProject()); setShowForm(true); }}><Plus size={18} /> {tr('project.new')}</button>}</div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('project.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('project.demo')}</p></div>}
    {!demo && !missing && !canWrite && <div className="informative"><Info size={17} /><p>{tr('project.readOnly')}</p></div>}
    {!missing && <div className="project-layout">
      <aside className="panel extra-panel project-list">
        <h2><Hammer size={19} /> {tr('project.list')}</h2>
        {showForm && writable && projectForm}
        {loading ? <p className="muted">{tr('general.loading')}</p> : !projects.length ? <p className="muted">{tr('project.empty')}</p> :
          projects.map(p => { const s = summaries[p.id]; return <button key={p.id} className={`project-card${p.id === selectedId ? ' selected' : ''}`} onClick={() => setSelectedId(p.id)} aria-pressed={p.id === selectedId}>
            <b>{p.title}</b><span className={`extra-pill project-${p.status}`}>{tr('project.status.' + p.status)}</span>
            {s.phasesTotal > 0 && <span className="project-progress" role="progressbar" aria-valuemin={0} aria-valuemax={s.phasesTotal} aria-valuenow={s.phasesDone} aria-label={tr('project.phasesProgress', { done: s.phasesDone, total: s.phasesTotal })}><span style={{ width: `${Math.round(s.progress * 100)}%` }} /></span>}
            <small>{s.budget !== null ? tr('project.spentOfBudget', { spent: money(s.spent), budget: money(s.budget) }) : tr('project.spent', { spent: money(s.spent) })}</small>
          </button>; })}
      </aside>
      {project && summary && <section className="panel extra-panel project-detail">
        <div className="project-head">
          <div><h2>{project.title}</h2><small>{[project.start_on && tr('project.from', { date: day(project.start_on) }), project.end_on && tr('project.to', { date: day(project.end_on) })].filter(Boolean).join(' · ')}</small></div>
          {writable && <div className="extra-buttons">
            <select aria-label={tr('project.status')} value={project.status} onChange={e => setStatus(e.target.value)}>{PROJECT_STATUSES.map(s => <option key={s} value={s}>{tr('project.status.' + s)}</option>)}</select>
            <button className="icon-button" title={tr('project.edit')} aria-label={tr('project.edit')} onClick={() => editProject(project)}><Pencil size={16} /></button>
            <button className="icon-button danger" title={tr('project.delete')} aria-label={tr('project.delete')} onClick={removeProject}><Trash2 size={16} /></button>
          </div>}
        </div>
        {project.notes && <p className="project-notes">{project.notes}</p>}
        <div className="project-tiles">
          <div><small>{tr('project.budget')}</small><b>{summary.budget === null ? '—' : money(summary.budget)}</b></div>
          <div><small>{tr('project.accepted')}</small><b>{money(summary.accepted)}</b></div>
          <div><small>{tr('project.spentLabel')}</small><b>{money(summary.spent)}</b></div>
          <div className={summary.overBudget ? 'over' : ''}><small>{tr('project.remaining')}</small><b>{summary.remaining === null ? '—' : money(summary.remaining)}</b></div>
        </div>
        {summary.overBudget && <p className="project-warning">{tr('project.overBudget')}</p>}

        <h3>{tr('project.phases')} <small>{tr('project.phasesProgress', { done: summary.phasesDone, total: summary.phasesTotal })}</small></h3>
        <ul className="project-phases">{sortPhases(own.phases).map(ph => <li key={ph.id} className={ph.done_at ? 'done' : ''}>
          <label className="extra-toggle"><input type="checkbox" checked={Boolean(ph.done_at)} disabled={!writable} onChange={() => updateItem('phases', ph.id, { done_at: ph.done_at ? null : new Date().toISOString() })} /> {ph.title}</label>
          <small>{ph.due_on ? day(ph.due_on) : ''}</small>
          {writable && <button className="icon-button danger" aria-label={tr('project.delete')} title={tr('project.delete')} onClick={() => deleteItem('phases', ph.id)}><Trash2 size={14} /></button>}
        </li>)}</ul>
        {writable && <form className="project-inline" onSubmit={addPhase}>
          <input aria-label={tr('project.phaseTitle')} placeholder={tr('project.phasePlaceholder')} maxLength={PROJECT_LIMITS.phase} value={phase.title} onChange={e => set(setPhase)({ title: e.target.value })} />
          <input aria-label={tr('project.phaseDue')} type="date" value={phase.due_on} onChange={e => set(setPhase)({ due_on: e.target.value })} />
          <button className="btn btn-soft"><Plus size={15} /> {tr('project.addPhase')}</button>
        </form>}

        <h3>{tr('project.quotes')}</h3>
        {!own.quotes.length && <p className="muted">{tr('project.noQuotes')}</p>}
        <ul className="project-rows">{own.quotes.map(q => <li key={q.id}>
          <span><b>{supplierName(q)}</b> · {money(Number(q.amount))}{q.received_on ? ' · ' + day(q.received_on) : ''}
            {q.document_id && docs[q.document_id]?.url && <> · <a href={docs[q.document_id].url} target="_blank" rel="noopener noreferrer"><FileText size={13} /> {tr('project.openFile')}</a></>}</span>
          <span className="extra-buttons">
            <select aria-label={tr('project.quoteStatus')} value={q.status} disabled={!writable} onChange={e => updateItem('quotes', q.id, { status: e.target.value })}>{QUOTE_STATUSES.map(s => <option key={s} value={s}>{tr('project.quote.' + s)}</option>)}</select>
            {writable && <button className="icon-button danger" aria-label={tr('project.delete')} title={tr('project.delete')} onClick={() => deleteItem('quotes', q.id)}><Trash2 size={14} /></button>}
          </span>
        </li>)}</ul>
        {writable && <form className="extra-form project-subform" onSubmit={addQuote}>
          <div className="extra-row">
            {pros.length > 0 && <Field label={tr('project.professional')}><select value={quote.professional_id} onChange={e => set(setQuote)({ professional_id: e.target.value })}><option value="">{tr('project.otherSupplier')}</option>{pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
            {!quote.professional_id && <Field label={tr('project.supplier')}><input maxLength={PROJECT_LIMITS.supplier} value={quote.supplier} onChange={e => set(setQuote)({ supplier: e.target.value })} /></Field>}
          </div>
          <div className="extra-row">
            <Field label={tr('project.amount')}><input required type="number" inputMode="decimal" min="0" step="0.01" value={quote.amount} onChange={e => set(setQuote)({ amount: e.target.value })} /></Field>
            <Field label={tr('project.received')}><input type="date" value={quote.received_on} onChange={e => set(setQuote)({ received_on: e.target.value })} /></Field>
          </div>
          <Field label={tr('project.quoteFile')}><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => set(setQuote)({ file: e.target.files?.[0] || null })} /></Field>
          <button className="btn btn-soft" disabled={busy === 'quote'}><Plus size={15} /> {tr('project.addQuote')}</button>
        </form>}

        <h3>{tr('project.expenses')}</h3>
        {!own.expenses.length && <p className="muted">{tr('project.noExpenses')}</p>}
        <ul className="project-rows">{[...own.expenses].sort((a, b) => String(b.paid_on).localeCompare(String(a.paid_on))).map(x => <li key={x.id}>
          <span><b>{x.description}</b> · {day(x.paid_on)}{x.quote_id ? ' · ' + tr('project.forQuote', { supplier: supplierName(own.quotes.find(q => q.id === x.quote_id) || {}) }) : ''}</span>
          <span className="extra-buttons"><strong>{money(Number(x.amount))}</strong>{writable && <button className="icon-button danger" aria-label={tr('project.delete')} title={tr('project.delete')} onClick={() => deleteItem('expenses', x.id)}><Trash2 size={14} /></button>}</span>
        </li>)}</ul>
        {writable && <form className="extra-form project-subform" onSubmit={addExpense}>
          <Field label={tr('project.expenseDescription')}><input required minLength={2} maxLength={PROJECT_LIMITS.expense} value={expense.description} placeholder={tr('project.expensePlaceholder')} onChange={e => set(setExpense)({ description: e.target.value })} /></Field>
          <div className="extra-row">
            <Field label={tr('project.amount')}><input required type="number" inputMode="decimal" min="0" step="0.01" value={expense.amount} onChange={e => set(setExpense)({ amount: e.target.value })} /></Field>
            <Field label={tr('project.paidOn')}><input required type="date" value={expense.paid_on} onChange={e => set(setExpense)({ paid_on: e.target.value })} /></Field>
          </div>
          {own.quotes.length > 0 && <Field label={tr('project.linkedQuote')}><select value={expense.quote_id} onChange={e => set(setExpense)({ quote_id: e.target.value })}><option value="">{tr('project.noQuote')}</option>{own.quotes.map(q => <option key={q.id} value={q.id}>{supplierName(q)} · {money(Number(q.amount))}</option>)}</select></Field>}
          <button className="btn btn-soft"><Plus size={15} /> {tr('project.addExpense')}</button>
        </form>}

        <h3>{tr('project.photos')}</h3>
        {(() => { const groups = photosByKind(own.photos); return <div className="project-photos">{PHOTO_KINDS.map(kind => <div key={kind}>
          <small>{tr('project.photo.' + kind)}</small>
          <div className="project-photo-row">{groups[kind].length ? groups[kind].map(ph => <figure key={ph.id}>
            {docs[ph.document_id]?.url ? <a href={docs[ph.document_id].url} target="_blank" rel="noopener noreferrer"><img src={docs[ph.document_id].url} alt={tr('project.photoAlt', { kind: tr('project.photo.' + kind), title: project.title })} loading="lazy" /></a> : <div className="project-photo-missing"><Camera size={18} /></div>}
            {writable && <button className="icon-button danger" aria-label={tr('project.deletePhoto')} title={tr('project.deletePhoto')} onClick={() => removePhoto(ph)}><Trash2 size={13} /></button>}
          </figure>) : <span className="muted">—</span>}</div>
        </div>)}</div>; })()}
        {writable && <div className="project-inline">
          <select aria-label={tr('project.photoKind')} value={photoKind} onChange={e => setPhotoKind(e.target.value)}>{PHOTO_KINDS.map(kind => <option key={kind} value={kind}>{tr('project.photo.' + kind)}</option>)}</select>
          <label className="btn btn-soft"><Camera size={15} /> {busy === 'photo' ? tr('general.loading') : tr('project.addPhoto')}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy === 'photo'} onChange={e => { addPhoto(e.target.files?.[0]); e.target.value = ''; }} /></label>
        </div>}
        {summary.phasesTotal > 0 && summary.phasesDone === summary.phasesTotal && project.status !== 'done' && writable &&
          <p className="project-done-hint"><Check size={15} /> {tr('project.allPhasesDone')} <button className="btn btn-soft" onClick={() => setStatus('done')}>{tr('project.markDone')}</button></p>}
      </section>}
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.project.json).
export default function Projects(props) {
  const { t } = useLanguage();
  const ready = useSection('project');
  return ready ? <ProjectsSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}
