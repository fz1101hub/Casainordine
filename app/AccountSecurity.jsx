'use client';
import { useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { passwordTooShort, MIN_PASSWORD_LENGTH } from '../lib/password-policy.mjs';
import { forgetAccountOnDevice } from '../lib/account-device.js';

// «Password dimenticata?» nella schermata di accesso: manda il link di Supabase per una nuova
// password, che riporta all'app con l'evento PASSWORD_RECOVERY.
export function ForgotPasswordButton({ client, email, t, onMessage }) {
  const [pending, setPending] = useState(false);
  async function send() {
    const address = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { onMessage(t('account.forgotNeedEmail')); return; }
    setPending(true);
    // Stesso messaggio che l'indirizzo esista o no: non si rivela chi è registrato.
    await client.auth.resetPasswordForEmail(address, { redirectTo: window.location.origin }).catch(() => null);
    setPending(false);
    onMessage(t('account.resetSent'));
  }
  return <button type="button" className="link-button" onClick={send} disabled={pending}>{t('account.forgot')}</button>;
}

// Finestra per la nuova password: dopo il link ricevuto via email («recovery») oppure dopo un
// accesso con una password più corta di 8 caratteri («upgrade»).
export function PasswordRecoveryDialog({ client, t, onDone, reason = 'recovery' }) {
  const [password, setPassword] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('');
  async function save(e) {
    e.preventDefault(); setError('');
    if (passwordTooShort(password)) { setError(t('account.newPassword')); return; }
    setPending(true);
    try {
      const { error: err } = await client.auth.updateUser({ password });
      if (err) { setError(t('account.passwordFailed')); return; }
      onDone(t('account.passwordSaved'));
    } catch {
      // Anche un errore di rete deve lasciare la finestra utilizzabile e localizzata.
      setError(t('account.passwordFailed'));
    } finally {
      setPending(false);
    }
  }
  return <div className="modal-overlay"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
    <div className="modal-head"><div><h2 id="recovery-title"><KeyRound size={20}/> {t('account.newPasswordTitle')}</h2>{reason === 'upgrade' && <p>{t('account.passwordUpgrade')}</p>}</div></div>
    <form className="modal-form" onSubmit={save}>
      <label>{t('account.newPassword')}<input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required autoFocus value={password} onChange={e => setPassword(e.target.value)}/></label>
      {error && <p className="auth-error">{error}</p>}
      <button className="btn btn-primary full" disabled={pending}>{t('account.savePassword')}</button>
    </form>
  </div></div>;
}

// Cancellazione definitiva dell'account (impostazioni).
export function DeleteAccountPanel({ client, user, t, onNotify }) {
  const [confirm, setConfirm] = useState(''), [pending, setPending] = useState(false);
  const matches = confirm.trim().toLowerCase() === String(user?.email || '').trim().toLowerCase() && confirm.trim() !== '';
  async function remove(e) {
    e.preventDefault();
    if (!matches || pending) return;
    setPending(true);
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token || session.user?.id !== user?.id) { onNotify(t('account.deleteFailed')); setPending(false); return; }
      const response = await fetch('/api/account/delete', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_email: confirm.trim() }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        // L'account non esiste più: si tolgono dal dispositivo bozze, copie SOS e notifiche
        // dell'account, si esce solo da questo dispositivo e si ricarica.
        await forgetAccountOnDevice(user.id).catch(() => null);
        await client.auth.signOut({ scope: 'local' }).catch(() => null);
        try { Object.keys(localStorage).filter(k => /^sb-.+-auth-token/.test(k)).forEach(k => localStorage.removeItem(k)); } catch {}
        window.location.replace('/');
        return;
      }
      onNotify(body.error === 'accountOwner'
        ? t('account.deleteOwner', { homes: (body.homes || []).join(', ') })
        : body.error === 'accountLease'
          ? t('account.deleteLease', { leases: (body.leases || []).join(', ') })
          : t('account.deleteFailed'));
    } catch { onNotify(t('account.deleteFailed')); }
    setPending(false);
  }
  return <section className="panel settings-panel danger-panel"><div className="settings-heading"><span className="settings-icon"><Trash2 size={20}/></span><div><h2>{t('account.deleteTitle')}</h2><p>{t('account.deleteHelp')}</p></div></div>
    <form onSubmit={remove} className="delete-account-form">
      <label>{t('account.deleteConfirmLabel')}<input type="email" autoComplete="off" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={user?.email || ''}/></label>
      <button className="btn btn-danger" disabled={!matches || pending}>{t('account.deleteButton')}</button>
    </form>
  </section>;
}
