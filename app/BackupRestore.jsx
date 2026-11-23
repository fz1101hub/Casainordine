'use client';
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { friendlyError } from '../lib/friendly-error.mjs';
import { readBackup, restorePlan, stableCopyIds, isCopy, existingCounts, existingDocumentIds, previewBySection, runRestore, restoreTotals, RestoreFileError, SKIP_REASONS } from '../lib/backup-restore.mjs';

const MAX_BYTES = 20 * 1024 * 1024;
// Backup .zip con i file (lib/backup-files.mjs, caricato solo quando serve): si legge tutto in memoria.
const MAX_ZIP_BYTES = 400 * 1024 * 1024;
const looksLikeZip = file => /\.zip$/i.test(file.name || '') || /zip/.test(file.type || '');

// «Ripristina da backup» in Notifiche e backup: legge il file (.json, o .zip con i documenti), mostra
// cosa contiene e quante voci ci sono già, poi aggiunge solo ciò che manca nello spazio attivo
// (lib/backup-restore.mjs).
export default function BackupRestore({ client, user, homeId, canWrite, onNotify = () => {}, onRefresh = () => {} }) {
  const { t: tr, date: localDate } = useLanguage();
  const [state, setState] = useState({ stage: 'idle' });
  const busy = state.stage === 'reading' || state.stage === 'running';

  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    const zip = looksLikeZip(file);
    if (file.size > (zip ? MAX_ZIP_BYTES : MAX_BYTES)) { onNotify(tr(zip ? 'extra.restore.error.tooBigZip' : 'extra.restore.error.tooBig')); return; }
    setState({ stage: 'reading' });
    try {
      let backup;
      if (zip) {
        const { readBackupBytes } = await import('../lib/backup-files.mjs');
        const { text, files } = readBackupBytes(new Uint8Array(await file.arrayBuffer()));
        backup = { ...readBackup(text), files };
      } else backup = readBackup(await file.text());
      const target = { homeId: homeId || null, userId: user?.id };
      // Spese divise: solo se chi ha pagato e chi divide sono ancora nella casa.
      let members = null;
      if (homeId) { const { data, error } = await client.from('home_members').select('user_id').eq('home_id', homeId); if (error) throw error; members = (data || []).map(m => m.user_id); }
      const copyIds = isCopy(backup, target) ? await stableCopyIds(backup, target) : null;
      const plan = restorePlan(backup, target, { copyIds, existingDocuments: await existingDocumentIds(client, backup, target), members });
      if (!plan.steps.length) { setState({ stage: 'idle' }); onNotify(tr('extra.restore.nothing')); return; }
      const existing = await existingCounts(client, plan);
      setState({ stage: 'preview', backup, plan, rows: previewBySection(plan, existing), otherSpace: plan.copy });
    } catch (e) {
      setState({ stage: 'idle' });
      onNotify(e instanceof RestoreFileError ? tr('extra.restore.error.' + e.message) : tr('extra.restore.failed', { error: friendlyError(e, tr) }));
    }
  }

  async function restore() {
    const plan = state.plan;
    setState(s => ({ ...s, stage: 'running', done: 0, total: plan.steps.length }));
    try {
      const result = await runRestore(client, plan, { onProgress: p => setState(s => ({ ...s, done: p.done })) });
      setState(s => ({ ...s, stage: 'done', totals: restoreTotals(result), quotaFull: Boolean(result.home_documents?.quotaFull),
        needsUpdate: Object.values(result).some(c => c.needsUpdate) }));
      onRefresh();
    } catch (e) {
      setState(s => ({ ...s, stage: 'preview' }));
      onNotify(tr('extra.restore.failed', { error: friendlyError(e, tr) }));
    }
  }

  const space = tr(homeId ? 'extra.restore.space.home' : 'extra.restore.space.personal');
  const skipped = SKIP_REASONS.filter(r => state.plan?.skipped?.[r]).map(r => tr('extra.restore.reason.' + r));
  return <div className="restore-box">
    <label className={`btn btn-soft upload-label${!canWrite || busy ? ' disabled' : ''}`}>
      <RotateCcw size={15} aria-hidden="true" /> {tr(state.stage === 'reading' ? 'extra.restore.reading' : 'extra.restore.button')}
      <input type="file" accept="application/json,.json,application/zip,.zip" hidden disabled={!canWrite || busy} onChange={choose} />
    </label>
    {!canWrite && <small>{tr('extra.restore.readOnly')}</small>}
    {(state.stage === 'preview' || state.stage === 'running' || state.stage === 'done') && <section className="restore-preview" aria-labelledby="restore-title">
      <h3 id="restore-title">{tr('extra.restore.title')}</h3>
      {state.backup?.exportedAt && <p>{tr('extra.restore.from', { date: localDate(state.backup.exportedAt.slice(0, 10)) })}</p>}
      <p><b>{tr('extra.restore.target', { space })}</b> {tr('extra.restore.intro')}</p>
      {state.otherSpace && <p className="extra-alert">{tr('extra.restore.otherSpace')}</p>}
      <ul>{state.rows.map(r => <li key={r.section}><b>{tr('nav.' + r.section)}</b>: {tr('extra.restore.row', { total: r.total, present: r.present })}</li>)}</ul>
      {skipped.length > 0 && <p><small>{tr('extra.restore.skipped', { list: skipped.join(' · ') })}</small></p>}
      {state.stage === 'preview' && <div className="extra-buttons">
        <button type="button" className="btn btn-primary" onClick={restore}>{tr('extra.restore.confirm')}</button>
        <button type="button" className="btn btn-soft" onClick={() => setState({ stage: 'idle' })}>{tr('general.cancel')}</button>
      </div>}
      {state.stage === 'running' && <p role="status">{tr('extra.restore.running', { done: state.done, total: state.total })}</p>}
      {state.stage === 'done' && <><p role="status"><b>{tr('extra.restore.done', state.totals)}</b></p>
        {state.quotaFull && <p className="extra-alert">{tr('extra.restore.quotaFull')}</p>}
        {state.needsUpdate && <p className="extra-alert">{tr('extra.restore.needsUpdate')}</p>}
        <button type="button" className="btn btn-soft" onClick={() => setState({ stage: 'idle' })}>{tr('extra.restore.close')}</button></>}
    </section>}
  </div>;
}
