'use client';
// Affitti (Fase 2, 3.3): profilo locatore/inquilino. Il locatore crea il contratto da un suo
// immobile e invita l'inquilino con l'email; l'inquilino accetta e vede solo contratto, verbali e
// foto. Verbali d'ingresso e d'uscita con stanze, letture e foto, firmati da entrambe le parti.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Trash2, Camera, PenLine, Info, Check, Mail } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { validDocument, IMAGE_MIME_TYPES } from '../lib/document-upload.mjs';
import { preparePhoto } from '../lib/image-prepare.js';
import { REPORT_KINDS, ROOM_STATES, RENTAL_LIMITS, normalizeLease, normalizeRooms, normalizeReadings, reportState, compareReports, leasePhotoPath } from '../lib/rental.mjs';
import DecimalInput from './DecimalInput';

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const BUCKET = 'lease-files';
const blankLease = () => ({ property_id: '', property_label: '', property_address: '', tenant_email: '', start_on: '', end_on: '', rent: '', deposit: '', notes: '' });
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

function RentalSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, money, date } = useLanguage();
  const day = iso => (iso ? date(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const today = todayRome();
  const [own, setOwn] = useState([]), [rented, setRented] = useState([]), [invites, setInvites] = useState([]), [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState(null), [reports, setReports] = useState([]), [photos, setPhotos] = useState([]), [urls, setUrls] = useState({});
  const [drafts, setDrafts] = useState({}), [form, setForm] = useState(blankLease()), [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [busy, setBusy] = useState('');
  const myEmail = String(user?.email || '').toLowerCase();

  const load = useCallback(async () => {
    if (demo) {
      setOwn(current => current.length ? current : [{ id: 'demo-lease', user_id: 'demo', property_label: tr('rental.demo.property'), property_address: tr('rental.demo.address'), tenant_email: tr('rental.demo.tenant'), tenant_id: 'demo-tenant', status: 'active', start_on: '2026-09-01', end_on: '2030-08-31', rent: 750, deposit: 1500, notes: '' }]);
      setSelectedId(current => current || 'demo-lease'); setLoading(false); return;
    }
    if (!client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const mine = client.from('home_leases').select('*');
    const [ownResult, rentedResult, inviteResult, propertyResult] = await Promise.all([
      (homeId ? mine.eq('home_id', homeId) : mine.eq('user_id', user.id).is('home_id', null)).order('start_on', { ascending: false }).limit(200),
      client.from('home_leases').select('*').eq('tenant_id', user.id).order('start_on', { ascending: false }).limit(50),
      myEmail ? client.from('home_leases').select('id,property_label,property_address,start_on,end_on,rent,deposit,user_id').is('tenant_id', null).eq('status', 'invited').eq('tenant_email', myEmail).limit(20) : { data: [] },
      (homeId ? client.from('home_properties').select('id,label,address').eq('home_id', homeId) : client.from('home_properties').select('id,label,address').eq('user_id', user.id).is('home_id', null)).limit(100),
    ]);
    setLoading(false);
    if (ownResult.error) { if (MISSING_TABLE.has(ownResult.error.code)) setMissing(true); else onNotify(friendlyError(ownResult.error, tr)); return; }
    setMissing(false);
    setOwn(ownResult.data || []); setRented(rentedResult.data || []);
    setInvites((inviteResult.data || []).filter(invite => invite.user_id !== user.id));
    setProperties(propertyResult.data || []);
  }, [client, demo, homeId, user?.id, myEmail]);
  useEffect(() => { setSelectedId(null); setReports([]); setPhotos([]); setShowForm(false); load(); }, [load]);

  const lease = useMemo(() => own.find(l => l.id === selectedId) || rented.find(l => l.id === selectedId) || null, [own, rented, selectedId]);
  const role = lease ? (own.some(l => l.id === lease.id) ? 'landlord' : 'tenant') : null;
  const canEdit = Boolean(lease) && lease.status === 'active' && (demo || (role === 'landlord' ? canWrite : true));

  // Verbali e foto del contratto scelto, con collegamenti temporanei alle foto.
  const loadReports = useCallback(async () => {
    if (!lease || demo || missing) return;
    const { data, error } = await client.from('home_lease_reports').select('*').eq('lease_id', lease.id);
    if (error) { onNotify(friendlyError(error, tr)); return; }
    const ids = (data || []).map(r => r.id);
    const pics = ids.length ? await client.from('home_lease_photos').select('*').in('report_id', ids).order('created_at') : { data: [] };
    const paths = (pics.data || []).map(p => p.storage_path);
    const signed = paths.length ? await client.storage.from(BUCKET).createSignedUrls(paths, 3600) : { data: [] };
    setReports(data || []); setPhotos(pics.data || []);
    setUrls(Object.fromEntries((signed.data || []).map(s => [s.path, s.signedUrl])));
    setDrafts({});
  }, [client, demo, lease?.id, missing]);
  useEffect(() => { if (!demo) { setReports([]); setPhotos([]); } loadReports(); }, [loadReports]);

  async function createLease(event) {
    event.preventDefault();
    const result = normalizeLease(form);
    if (result.error) { onNotify(tr(result.error)); return; }
    if (result.value.tenant_email === myEmail) { onNotify(tr('rental.error.self')); return; }
    if (demo) { const id = uid(); setOwn(list => [{ ...result.value, id, status: 'invited', tenant_id: null }, ...list]); setSelectedId(id); }
    else {
      setBusy('lease');
      const { data, error } = await client.from('home_leases').insert({ ...result.value, home_id: homeId || null }).select('*').single();
      setBusy('');
      if (error) { onNotify(friendlyError(error, tr)); return; }
      setOwn(list => [data, ...list]); setSelectedId(data.id);
    }
    setForm(blankLease()); setShowForm(false);
    onNotify(tr('rental.created', { email: result.value.tenant_email }));
  }

  async function accept(invite) {
    const { data, error } = await client.rpc('v49_accept_lease', { target: invite.id });
    if (error || !data) { onNotify(error ? friendlyError(error, tr) : tr('rental.error.invite')); return; }
    onNotify(tr('rental.accepted'));
    await load(); setSelectedId(invite.id);
  }

  async function endLease() {
    if (!(await askConfirm(tr('rental.endConfirm')))) return;
    if (!demo) { const { error } = await client.from('home_leases').update({ status: 'ended' }).eq('id', lease.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setOwn(list => list.map(l => (l.id === lease.id ? { ...l, status: 'ended' } : l)));
    onNotify(tr('rental.ended'));
  }

  // Eliminando il contratto si tolgono anche le foto dal bucket (i verbali se ne vanno con il contratto).
  async function deleteLease() {
    if (!(await askConfirm(tr('rental.deleteConfirm'), { danger: true }))) return;
    if (!demo) {
      const paths = photos.map(p => p.storage_path);
      if (paths.length) { const { error } = await client.storage.from(BUCKET).remove(paths); if (error) { onNotify(friendlyError(error, tr)); return; } }
      const { error } = await client.from('home_leases').delete().eq('id', lease.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setOwn(list => list.filter(l => l.id !== lease.id)); setSelectedId(null); setReports([]); setPhotos([]);
    onNotify(tr('rental.deleted'));
  }

  const reportOf = kind => reports.find(r => r.kind === kind) || null;
  const draftOf = report => drafts[report.id] || { report_date: report.report_date, rooms: report.rooms || [], readings: report.readings || [], notes: report.notes || '' };
  const setDraft = (report, patch) => setDrafts(all => ({ ...all, [report.id]: { ...draftOf(report), ...patch } }));

  async function createReport(kind) {
    const previous = reportOf('check_in');
    // Il verbale d'uscita parte dalle stanze e dai contatori di quello d'ingresso.
    const row = { lease_id: lease.id, kind, report_date: today,
      rooms: kind === 'check_out' && previous ? normalizeRooms(previous.rooms).map(r => ({ room: r.room, state: r.state, notes: '' })) : [],
      readings: kind === 'check_out' && previous ? normalizeReadings(previous.readings).map(r => ({ meter: r.meter, value: '', unit: r.unit })) : [], notes: '' };
    if (demo) { setReports(list => [...list, { ...row, id: uid() }]); return; }
    const { data, error } = await client.from('home_lease_reports').insert({ ...row, readings: [] }).select('*').single();
    if (error) { onNotify(friendlyError(error, tr)); return; }
    setReports(list => [...list, data]);
    if (row.readings.length) setDrafts(all => ({ ...all, [data.id]: { report_date: data.report_date, rooms: data.rooms, readings: row.readings, notes: '' } }));
  }

  async function saveReport(report) {
    const draft = draftOf(report);
    const patch = { report_date: draft.report_date || today, rooms: normalizeRooms(draft.rooms), readings: normalizeReadings(draft.readings), notes: String(draft.notes || '').slice(0, RENTAL_LIMITS.reportNotes) };
    if (!demo) {
      setBusy('report');
      const { data, error } = await client.from('home_lease_reports').update(patch).eq('id', report.id).select('*').single();
      setBusy('');
      if (error) { onNotify(friendlyError(error, tr)); return; }
      setReports(list => list.map(r => (r.id === report.id ? data : r)));
    } else setReports(list => list.map(r => (r.id === report.id ? { ...r, ...patch, landlord_signed_at: null, tenant_signed_at: null } : r)));
    setDrafts(all => { const next = { ...all }; delete next[report.id]; return next; });
    onNotify(tr(report.landlord_signed_at || report.tenant_signed_at ? 'rental.savedUnsigned' : 'rental.reportSaved'));
  }

  async function sign(report) {
    if (drafts[report.id]) { onNotify(tr('rental.saveFirst')); return; }
    if (!(await askConfirm(tr('rental.signConfirm')))) return;
    if (demo) setReports(list => list.map(r => (r.id === report.id ? { ...r, landlord_signed_at: new Date().toISOString() } : r)));
    else {
      const { error } = await client.rpc('v49_sign_report', { target: report.id });
      if (error) { onNotify(friendlyError(error, tr)); return; }
      await loadReports();
    }
    onNotify(tr('rental.signed'));
  }

  async function addPhoto(report, picked) {
    if (!picked) return;
    // Foto HEIC dell'iPhone o molto pesanti: JPEG leggero prima del controllo.
    let file;
    try { file = (await preparePhoto(picked)).file; } catch (error) { onNotify(friendlyError(error, tr)); return; }
    if (!validDocument(file, IMAGE_MIME_TYPES)) { onNotify(tr('rental.error.photo')); return; }
    if (demo) { const id = uid(); setUrls(all => ({ ...all, [id]: URL.createObjectURL(file) })); setPhotos(list => [...list, { id, report_id: report.id, storage_path: id }]); return; }
    setBusy('photo');
    const path = leasePhotoPath(lease.id, file.type);
    const uploaded = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) { setBusy(''); onNotify(friendlyError(uploaded.error, tr)); return; }
    const { error } = await client.from('home_lease_photos').insert({ report_id: report.id, storage_path: path });
    if (error) { await client.storage.from(BUCKET).remove([path]); setBusy(''); onNotify(friendlyError(error, tr)); return; }
    setBusy(''); await loadReports();
  }

  async function removePhoto(photo) {
    if (!(await askConfirm(tr('rental.deletePhotoConfirm'), { danger: true }))) return;
    if (!demo) {
      const { error } = await client.from('home_lease_photos').delete().eq('id', photo.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
      await client.storage.from(BUCKET).remove([photo.storage_path]);
    }
    setPhotos(list => list.filter(p => p.id !== photo.id));
  }

  const statusLabel = status => tr('rental.status.' + status);
  const signatures = report => { const state = reportState(report); return tr('rental.sign.' + state); };
  const listButton = (l, mine) => <button key={l.id} className={`project-card${l.id === selectedId ? ' selected' : ''}`} aria-pressed={l.id === selectedId} onClick={() => setSelectedId(l.id)}>
    <b>{l.property_label}</b><span className={`extra-pill rental-${l.status}`}>{statusLabel(l.status)}</span>
    <small>{mine ? l.tenant_email : tr('rental.asTenantShort')} · {tr('rental.from', { date: day(l.start_on) })}</small>
  </button>;

  function reportBlock(kind) {
    const report = reportOf(kind);
    if (!report) return <div key={kind} className="rental-report empty"><h3>{tr('rental.report.' + kind)}</h3>
      <p className="muted">{tr('rental.noReport')}</p>
      {canEdit && <button className="btn btn-soft" onClick={() => createReport(kind)}><Plus size={15} /> {tr('rental.createReport.' + kind)}</button>}</div>;
    const state = reportState(report), locked = state === 'locked', editable = canEdit && !locked;
    const draft = draftOf(report);
    const mySide = role === 'landlord' || demo ? 'landlord_signed_at' : 'tenant_signed_at';
    return <div key={kind} className={`rental-report ${state}`}>
      <h3>{tr('rental.report.' + kind)} <span className={`extra-pill rental-sign-${state}`}>{signatures(report)}</span></h3>
      <div className="extra-row"><Field label={tr('rental.reportDate')}><input type="date" disabled={!editable} value={draft.report_date || ''} onChange={e => setDraft(report, { report_date: e.target.value })} /></Field></div>
      <h4>{tr('rental.rooms')}</h4>
      {draft.rooms.map((room, index) => <div key={index} className="rental-room">
        <input aria-label={tr('rental.room')} placeholder={tr('rental.roomPlaceholder')} maxLength={RENTAL_LIMITS.room} disabled={!editable} value={room.room || ''} onChange={e => setDraft(report, { rooms: draft.rooms.map((r, i) => (i === index ? { ...r, room: e.target.value } : r)) })} />
        <select aria-label={tr('rental.roomState')} disabled={!editable} value={room.state || 'good'} onChange={e => setDraft(report, { rooms: draft.rooms.map((r, i) => (i === index ? { ...r, state: e.target.value } : r)) })}>{ROOM_STATES.map(s => <option key={s} value={s}>{tr('rental.state.' + s)}</option>)}</select>
        <input aria-label={tr('rental.roomNotes')} placeholder={tr('rental.roomNotesPlaceholder')} maxLength={RENTAL_LIMITS.roomNotes} disabled={!editable} value={room.notes || ''} onChange={e => setDraft(report, { rooms: draft.rooms.map((r, i) => (i === index ? { ...r, notes: e.target.value } : r)) })} />
        {editable && <button className="icon-button danger" aria-label={tr('rental.removeRow')} title={tr('rental.removeRow')} onClick={() => setDraft(report, { rooms: draft.rooms.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>}
      </div>)}
      {editable && draft.rooms.length < RENTAL_LIMITS.rooms && <button className="btn btn-soft" onClick={() => setDraft(report, { rooms: [...draft.rooms, { room: '', state: 'good', notes: '' }] })}><Plus size={15} /> {tr('rental.addRoom')}</button>}
      <h4>{tr('rental.readings')}</h4>
      {draft.readings.map((reading, index) => <div key={index} className="rental-room">
        <input aria-label={tr('rental.meter')} placeholder={tr('rental.meterPlaceholder')} maxLength={RENTAL_LIMITS.meter} disabled={!editable} value={reading.meter || ''} onChange={e => setDraft(report, { readings: draft.readings.map((r, i) => (i === index ? { ...r, meter: e.target.value } : r)) })} />
        <DecimalInput decimals={3} aria-label={tr('rental.value')} min="0" disabled={!editable} value={reading.value ?? ''} onChange={e => setDraft(report, { readings: draft.readings.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)) })} />
        <input aria-label={tr('rental.unit')} placeholder={tr('rental.unitPlaceholder')} maxLength={RENTAL_LIMITS.unit} disabled={!editable} value={reading.unit || ''} onChange={e => setDraft(report, { readings: draft.readings.map((r, i) => (i === index ? { ...r, unit: e.target.value } : r)) })} />
        {editable && <button className="icon-button danger" aria-label={tr('rental.removeRow')} title={tr('rental.removeRow')} onClick={() => setDraft(report, { readings: draft.readings.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>}
      </div>)}
      {editable && draft.readings.length < RENTAL_LIMITS.readings && <button className="btn btn-soft" onClick={() => setDraft(report, { readings: [...draft.readings, { meter: '', value: '', unit: '' }] })}><Plus size={15} /> {tr('rental.addReading')}</button>}
      <Field label={tr('rental.reportNotes')}><textarea rows={3} maxLength={RENTAL_LIMITS.reportNotes} disabled={!editable} value={draft.notes || ''} onChange={e => setDraft(report, { notes: e.target.value })} /></Field>
      <h4>{tr('rental.photos')}</h4>
      <div className="project-photo-row">{photos.filter(p => p.report_id === report.id).map(photo => <figure key={photo.id}>
        {urls[photo.storage_path] ? <a href={urls[photo.storage_path]} target="_blank" rel="noopener noreferrer"><img src={urls[photo.storage_path]} alt={tr('rental.photoAlt', { report: tr('rental.report.' + kind) })} loading="lazy" /></a> : <div className="project-photo-missing"><Camera size={18} /></div>}
        {editable && <button className="icon-button danger" aria-label={tr('rental.deletePhoto')} title={tr('rental.deletePhoto')} onClick={() => removePhoto(photo)}><Trash2 size={13} /></button>}
      </figure>)}{!photos.some(p => p.report_id === report.id) && <span className="muted">—</span>}</div>
      {editable && <div className="extra-buttons rental-actions">
        <label className="btn btn-soft"><Camera size={15} /> {busy === 'photo' ? tr('general.loading') : tr('rental.addPhoto')}<input type="file" accept="image/jpeg,image/png,image/webp,.heic,.heif,image/heic,image/heif" hidden disabled={busy === 'photo'} onChange={e => { addPhoto(report, e.target.files?.[0]); e.target.value = ''; }} /></label>
        {drafts[report.id] && <button className="btn btn-primary" disabled={busy === 'report'} onClick={() => saveReport(report)}>{tr('rental.saveReport')}</button>}
        {!report[mySide] && <button className="btn btn-soft" onClick={() => sign(report)}><PenLine size={15} /> {tr('rental.sign')}</button>}
      </div>}
      {locked && <p className="muted"><Check size={14} /> {tr('rental.lockedHint')}</p>}
    </div>;
  }

  const comparison = reportOf('check_in') && reportOf('check_out') ? compareReports(reportOf('check_in'), reportOf('check_out')) : null;

  return <div className="extra-main rental">
    <div className="page-heading"><div><div className="eyebrow">{tr('rental.eyebrow')}</div><h1>{tr('nav.rental')}</h1><p>{tr('rental.help')}</p></div>
      {(demo || canWrite) && !missing && !showForm && <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={18} /> {tr('rental.new')}</button>}</div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('rental.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('rental.demo')}</p></div>}
    <div className="informative"><KeyRound size={17} /><p>{tr('rental.privacy')}</p></div>
    {invites.length > 0 && <section className="panel extra-panel rental-invites"><h2><Mail size={19} /> {tr('rental.invites')}</h2>
      {invites.map(invite => <div key={invite.id} className="extra-item"><div><b>{invite.property_label}</b><small>{[invite.property_address, tr('rental.from', { date: day(invite.start_on) }), invite.rent !== null && tr('rental.rentLine', { rent: money(Number(invite.rent)) })].filter(Boolean).join(' · ')}</small></div>
        <button className="btn btn-primary" onClick={() => accept(invite)}>{tr('rental.accept')}</button></div>)}
    </section>}
    {!missing && <div className="project-layout">
      <aside className="panel extra-panel project-list">
        {showForm && <form className="extra-form" onSubmit={createLease}>
          <h2>{tr('rental.new')}</h2>
          {properties.length > 0 && <Field label={tr('rental.property')}><select value={form.property_id} onChange={e => { const p = properties.find(x => x.id === e.target.value); setForm(f => ({ ...f, property_id: e.target.value, property_label: p?.label || f.property_label, property_address: p?.address || f.property_address })); }}>
            <option value="">{tr('rental.propertyNone')}</option>{properties.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>}
          <Field label={tr('rental.label')}><input required minLength={2} maxLength={RENTAL_LIMITS.label} value={form.property_label} placeholder={tr('rental.labelPlaceholder')} onChange={e => setForm(f => ({ ...f, property_label: e.target.value }))} /></Field>
          <Field label={tr('rental.address')}><input maxLength={RENTAL_LIMITS.address} value={form.property_address} onChange={e => setForm(f => ({ ...f, property_address: e.target.value }))} /></Field>
          <Field label={tr('rental.tenantEmail')}><input required type="email" autoComplete="off" value={form.tenant_email} placeholder={tr('ui.emailPlaceholder')} onChange={e => setForm(f => ({ ...f, tenant_email: e.target.value }))} /></Field>
          <div className="extra-row">
            <Field label={tr('rental.start')}><input required type="date" value={form.start_on} onChange={e => setForm(f => ({ ...f, start_on: e.target.value }))} /></Field>
            <Field label={tr('rental.end')}><input type="date" value={form.end_on} onChange={e => setForm(f => ({ ...f, end_on: e.target.value }))} /></Field>
          </div>
          <div className="extra-row">
            <Field label={tr('rental.rent')}><DecimalInput min="0" value={form.rent} onChange={e => setForm(f => ({ ...f, rent: e.target.value }))} /></Field>
            <Field label={tr('rental.deposit')}><DecimalInput min="0" value={form.deposit} onChange={e => setForm(f => ({ ...f, deposit: e.target.value }))} /></Field>
          </div>
          <p className="muted">{tr('rental.inviteHelp')}</p>
          <div className="extra-buttons"><button className="btn btn-primary" disabled={busy === 'lease'}>{tr('rental.create')}</button><button type="button" className="btn btn-soft" onClick={() => { setForm(blankLease()); setShowForm(false); }}>{tr('rental.cancel')}</button></div>
        </form>}
        <h2><KeyRound size={19} /> {tr('rental.asLandlord')}</h2>
        {loading ? <p className="muted">{tr('general.loading')}</p> : own.length ? own.map(l => listButton(l, true)) : <p className="muted">{tr('rental.noLeases')}</p>}
        {!demo && <><h2>{tr('rental.asTenant')}</h2>{rented.length ? rented.map(l => listButton(l, false)) : <p className="muted">{tr('rental.noRented')}</p>}</>}
      </aside>
      {lease && <section className="panel extra-panel project-detail">
        <div className="project-head">
          <div><h2>{lease.property_label}</h2><small>{[lease.property_address, tr(role === 'landlord' ? 'rental.youLandlord' : 'rental.youTenant')].filter(Boolean).join(' · ')}</small></div>
          {role === 'landlord' && (demo || canWrite) && <div className="extra-buttons">
            {lease.status === 'active' && <button className="btn btn-soft" onClick={endLease}>{tr('rental.end.action')}</button>}
            <button className="icon-button danger" aria-label={tr('rental.delete')} title={tr('rental.delete')} onClick={deleteLease}><Trash2 size={16} /></button>
          </div>}
        </div>
        <div className="project-tiles">
          <div><small>{tr('rental.statusLabel')}</small><b>{statusLabel(lease.status)}</b></div>
          <div><small>{tr('rental.period')}</small><b>{day(lease.start_on)}{lease.end_on ? ' – ' + day(lease.end_on) : ''}</b></div>
          <div><small>{tr('rental.rent')}</small><b>{lease.rent === null ? '—' : money(Number(lease.rent))}</b></div>
          <div><small>{tr('rental.deposit')}</small><b>{lease.deposit === null ? '—' : money(Number(lease.deposit))}</b></div>
        </div>
        {role === 'landlord' && <p className="muted">{tr(lease.status === 'invited' ? 'rental.waiting' : 'rental.tenantLine', { email: lease.tenant_email })}</p>}
        {lease.status === 'invited' ? <p className="muted">{tr('rental.reportsAfterAccept')}</p> : <>
          {REPORT_KINDS.map(reportBlock)}
          {comparison && (comparison.worse.length > 0 || comparison.usage.length > 0) && <div className="rental-compare"><h3>{tr('rental.compare')}</h3>
            {comparison.worse.map(w => <p key={w.room}>{tr('rental.worse', { room: w.room, from: tr('rental.state.' + w.from), to: tr('rental.state.' + w.to) })}</p>)}
            {comparison.usage.map(u => <p key={u.meter}>{tr('rental.usage', { meter: u.meter, used: u.used, unit: u.unit })}</p>)}
            <small className="muted">{tr('rental.compareHint')}</small>
          </div>}
        </>}
      </section>}
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.rental.json).
export default function Rental(props) {
  const { t } = useLanguage();
  const ready = useSection('rental');
  return ready ? <RentalSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}
