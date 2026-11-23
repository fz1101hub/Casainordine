'use client';
// «Stato della configurazione» in Impostazioni (scelta dell'utente, 23 novembre 2026): quali
// impostazioni del server ci sono e quali mancano, con i nomi delle variabili da aggiungere su
// Vercel. Mai i valori. Si controlla a richiesta (GET /api/status).
import { useState } from 'react';
import { CheckCircle2, CircleAlert, CircleDashed, ServerCog } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { apiErrorText, friendlyError, shownError } from '../lib/friendly-error.mjs';

const ICON = { ok: CheckCircle2, missing: CircleDashed, partial: CircleAlert, invalid: CircleAlert };
const TONE = { ok: 'green', missing: '', partial: 'amber', invalid: 'red' };

export default function ConfigStatus({ client, onNotify }) {
  const { t } = useLanguage();
  const [state, setState] = useState({ busy: false, items: null, checkedAt: null });
  async function check() {
    setState(s => ({ ...s, busy: true }));
    try {
      const { data: { session } } = await client.auth.getSession();
      const res = await fetch('/api/status', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw shownError(apiErrorText(body, t, 'config.failed'));
      setState({ busy: false, items: body.items || [], checkedAt: body.checked_at });
    } catch (error) {
      setState(s => ({ ...s, busy: false }));
      onNotify(t('config.failed') + ' ' + friendlyError(error, t));
    }
  }
  const required = state.items?.filter(i => i.level === 'required') || [];
  const ready = state.items && required.every(i => i.state === 'ok');
  return <section className="panel settings-panel config-status" aria-labelledby="config-status-title">
    <div className="settings-heading"><span className="settings-icon"><ServerCog size={20} /></span><div><h2 id="config-status-title">{t('config.title')}</h2><p>{t('config.help')}</p></div></div>
    <button className="btn btn-soft" onClick={check} disabled={state.busy}>{t(state.busy ? 'config.checking' : 'config.check')}</button>
    <div aria-live="polite">
      {state.items && <>
        <p className={`config-summary ${ready ? 'ok' : 'todo'}`}><b>{t(ready ? 'config.ready' : 'config.notReady')}</b></p>
        <ul className="config-list">
          {state.items.map(item => {
            const Icon = ICON[item.state] || CircleDashed;
            return <li key={item.key} className={`config-item state-${item.state}`}>
              <Icon size={18} aria-hidden="true" />
              <div>
                <b>{t('config.item.' + item.key)} <span className={`tag ${TONE[item.state] ? 'tag-' + TONE[item.state] : ''}`}>{t('config.state.' + item.state)}</span> <small className="config-level">{t('config.level.' + item.level)}</small></b>
                <small>{t('config.what.' + item.key)}</small>
                {item.missing.length > 0 && <small>{t(item.state === 'invalid' ? 'config.fix' : 'config.add')} {item.missing.map((name, i) => <span key={name}>{i ? ', ' : ''}<code>{name}</code></span>)}</small>}
              </div>
            </li>;
          })}
        </ul>
        <p className="muted config-note">{t('config.redeploy')}</p>
      </>}
    </div>
  </section>;
}
