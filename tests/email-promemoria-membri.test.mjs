import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reminderEmailRecipients, wantsReminderEmail, EMAIL_ROLES } from '../lib/reminder-recipients.mjs';
import { TRANSLATIONS } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('bolletta personale: email solo a chi l’ha inserita', () => {
  assert.deepEqual(reminderEmailRecipients({ user_id: 'a', home_id: null }, [{ user_id: 'b', role: 'editor' }]), ['a']);
  assert.deepEqual(reminderEmailRecipients({ home_id: null }), []);
});

test('bolletta di casa: proprietario ed editor, senza lettori né doppioni', () => {
  const members = [
    { user_id: 'a', role: 'owner' }, { user_id: 'b', role: 'editor' }, { user_id: 'c', role: 'viewer' },
    { user_id: 'b', role: 'editor' }, { user_id: null, role: 'editor' }, null,
  ];
  assert.deepEqual(EMAIL_ROLES, ['owner', 'editor']);
  assert.deepEqual(reminderEmailRecipients({ user_id: 'x', home_id: 'h' }, members), ['a', 'b']);
  // Chi ha inserito la bolletta e poi è uscito dalla casa non è fra i membri: non la riceve.
  assert.equal(reminderEmailRecipients({ user_id: 'x', home_id: 'h' }, members).includes('x'), false);
});

test('ognuno sceglie: promemoria spenti o email spente bloccano l’email', () => {
  assert.equal(wantsReminderEmail({ email: 'a@x.it', reminders_enabled: true }), true);
  assert.equal(wantsReminderEmail({ email: 'a@x.it', reminders_enabled: true, reminder_emails: true }), true);
  assert.equal(wantsReminderEmail({ email: 'a@x.it', reminders_enabled: true, reminder_emails: false }), false);
  assert.equal(wantsReminderEmail({ email: 'a@x.it', reminders_enabled: false, reminder_emails: true }), false);
  assert.equal(wantsReminderEmail({ email: ' ', reminders_enabled: true }), false);
  assert.equal(wantsReminderEmail(null), false);
});

test('il cron manda una email per bolletta e persona, registrata prima dell’invio', () => {
  const cron = read('../app/api/cron/route.js');
  assert.match(cron, /reminderEmailRecipients\(bill,members\)/);
  assert.match(cron, /wantsReminderEmail\(profile\)/);
  assert.match(cron, /from\('reminder_email_log'\)\.upsert\(\{bill_id:bill\.id,user_id:userId,reminder_date:today\},\s*\{onConflict:'bill_id,user_id',ignoreDuplicates:true\}\)/);
  const upsert = cron.indexOf("from('reminder_email_log').upsert"), send = cron.indexOf('emailReminder(profile.email');
  assert.ok(upsert > 0 && send > upsert, 'la riga del registro si scrive prima dell’invio');
  // Lingua di chi riceve, non di chi ha inserito la bolletta.
  assert.match(cron, /user_language_preferences'\)\.select\('language'\)\.eq\('user_id',userId\)/);
  // Il promemoria nell'app resta di chi ha inserito la bolletta, uno al giorno.
  assert.match(cron, /onConflict:'bill_id,reminder_date',ignoreDuplicates:true/);
});

test('migrazione v50: scelta personale e registro solo per il server', () => {
  const sql = read('../supabase/migrate_v50_email_promemoria.sql');
  assert.match(sql, /add column if not exists reminder_emails boolean not null default true/);
  assert.match(sql, /grant update \(reminder_emails\) on public\.profiles to authenticated/);
  assert.match(sql, /primary key \(bill_id, user_id\)/);
  assert.match(sql, /references public\.bills\(id\) on delete cascade/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.reminder_email_log from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant [^;]*reminder_email_log to (anon|authenticated)/);
});

test('impostazioni: interruttore per le email, nelle 6 lingue', () => {
  const page = read('../app/page.jsx');
  assert.match(page, /toggleReminderEmails/);
  assert.match(page, /update\(\{reminder_emails:enabled\}\)/);
  assert.match(page, /disabled=\{!data\.profile\?\.reminders_enabled\}/);
  for (const key of ['settings.reminderEmails', 'settings.reminderEmailsHelp', 'settings.toggleReminderEmails']) {
    for (const [lang, dict] of Object.entries(TRANSLATIONS)) assert.ok(String(dict[key] || '').length > 5, `${key} in ${lang}`);
  }
});
