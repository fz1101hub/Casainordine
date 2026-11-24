import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';
import { processSummaries } from '../lib/summary-run.mjs';
import { emailLease, eligibleForEmailRetry, EMAIL_LEASE_MS } from '../lib/delivery-retry.mjs';

test('lease email: una richiesta ancora attiva non si ripete, una scaduta sì', () => {
  const now = Date.parse('2026-12-01T12:00:00Z');
  const pending = { error: emailLease(new Date(now - 2000)), sent_at: null };
  assert.equal(eligibleForEmailRetry(pending, { now }), false);
  pending.error = emailLease(new Date(now - EMAIL_LEASE_MS - 1000));
  assert.equal(eligibleForEmailRetry(pending, { now }), true);
  pending.sent_at = new Date(now).toISOString();
  assert.equal(eligibleForEmailRetry(pending, { now }), false);
});

test('riepilogo email fallito: secondo cron riprova, il terzo non duplica', async () => {
  const fake = await startFakeSupabase();
  try {
    const id = '11111111-1111-4111-8111-111111111111';
    const profile = { id, email: 'prova@example.org', summary_frequency: 'daily',
      summary_weekday: 1, summary_month_day: 1 };
    fake.seed('profiles', [profile]);
    fake.seed('bills', [{ id: '22222222-2222-4222-8222-222222222222', user_id: id, home_id: null,
      title: 'Luce', supplier: 'Test', amount: 12, due_date: '2026-12-11', paid_at: null }]);
    const admin = createClient(fake.url, 'service-test', { auth: { persistSession: false, autoRefreshToken: false } });
    let attempts = 0;
    const email = { send: async () => ++attempts === 1 ? { error: '503 provider offline' } : { sent: true } };
    const run = () => processSummaries(admin, [profile], {
      today: '2026-12-01', appUrl: 'https://casa.example', email,
      counts: { summaries_created: 0, summary_emails_sent: 0, summary_push_sent: 0, errors: [] }
    });
    await run();
    assert.equal(fake.rows('bill_summaries').length, 1);
    assert.match(fake.rows('bill_summaries')[0].email_error || '', /503 provider offline/);
    await run();
    assert.ok(fake.rows('bill_summaries')[0].email_sent_at);
    await run();
    assert.equal(attempts, 2);
  } finally { await fake.close(); }
});
