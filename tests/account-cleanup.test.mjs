import test from 'node:test';
import assert from 'node:assert/strict';
import { queueAccountCleanup, discardAccountCleanup, finishAccountCleanup, runAccountCleanupJobs } from '../lib/account-deletion.mjs';

function fixture() {
  const jobs = new Map(), files = {
    'house-documents': ['a.pdf', 'condiviso.pdf'],
    'mail-bills': ['b.pdf']
  };
  let authStatus = 'present', failStorage = false, scans = 0;
  const admin = {
    auth: { admin: { async getUserById(id) {
      if (authStatus === 'present') return { data: { user: { id } }, error: null };
      if (authStatus === 'error') return { data: null, error: { status: 503, message: 'Auth temporarily unavailable' } };
      return { data: null, error: { status: 404, message: 'User not found' } };
    } } },
    from(table) {
      assert.equal(table, 'account_cleanup_jobs');
      const q = {
        select() { return q; }, eq(_, id) { q.id = id; return q; }, order() { return q; },
        async maybeSingle() { return { data: jobs.get(q.id) || null, error: null }; },
        async limit() { return { data: [...jobs.keys()].map(user_id => ({ user_id })), error: null }; },
        upsert: async row => { jobs.set(row.user_id, { ...row }); return { error: null }; },
        delete() { return { eq: async (_, id) => { jobs.delete(id); return { error: null }; } }; },
        update(patch) { return { eq: async (_, id) => { jobs.set(id, { ...jobs.get(id), ...patch }); return { error: null }; } }; },
      };
      return q;
    },
    storage: { from(bucket) {
      return {
        async list(folder, { offset = 0, limit = 100 }) {
          scans++;
          return { data: (files[bucket] || []).slice(offset, offset + limit).map(name => ({ name })), error: null };
        },
        async remove(paths) {
          if (failStorage) return { error: { message: 'Storage unavailable' } };
          for (const path of paths) files[bucket] = (files[bucket] || []).filter(name => path !== `u1/${name}`);
          return { error: null };
        },
      };
    } },
  };
  return { admin, jobs, files, status: value => { authStatus = value; }, storageFails: value => { failStorage = value; }, scans: () => scans };
}

test('un errore di Auth impedisce qualunque eliminazione da Storage', async () => {
  const f = fixture();
  await queueAccountCleanup(f.admin, 'u1', new Set(['u1/condiviso.pdf']));
  assert.equal(await finishAccountCleanup(f.admin, 'u1'), false);
  assert.equal(f.scans(), 0);
  f.status('error');
  await assert.rejects(finishAccountCleanup(f.admin, 'u1'), /Auth temporarily unavailable/);
  assert.equal(f.scans(), 0);
  await discardAccountCleanup(f.admin, 'u1');
  assert.equal(f.jobs.size, 0);
});

test('dopo Auth=404 elimina solo i file non condivisi e chiude la coda', async () => {
  const f = fixture();
  await queueAccountCleanup(f.admin, 'u1', new Set(['u1/condiviso.pdf']));
  f.status('deleted');
  assert.equal(await finishAccountCleanup(f.admin, 'u1'), true);
  assert.deepEqual(f.files, { 'house-documents': ['condiviso.pdf'], 'mail-bills': [] });
  assert.equal(f.jobs.size, 0);
});

test('Storage non disponibile: la richiesta resta in coda e il cron può riprenderla', async () => {
  const f = fixture();
  await queueAccountCleanup(f.admin, 'u1', new Set(['u1/condiviso.pdf']));
  f.status('deleted'); f.storageFails(true);
  await assert.rejects(finishAccountCleanup(f.admin, 'u1'), /Storage unavailable/);
  assert.equal(f.jobs.size, 1);
  f.storageFails(false);
  assert.deepEqual(await runAccountCleanupJobs(f.admin), { cleaned: 1, errors: [] });
  assert.equal(f.jobs.size, 0);
});
