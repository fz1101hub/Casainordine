'use client';
// Finestre di conferma e di testo dell'app, al posto di window.confirm e window.prompt
// (secondo audit, A3). Hanno l'aspetto dell'app, i pulsanti nella lingua scelta, il focus
// gestito dal browser (<dialog> modale: Esc annulla, il resto della pagina non si raggiunge) e
// funzionano anche nell'app installata su iPhone, dove le finestre native sono scomode.
//
// Uso, da qualunque componente o funzione:
//   if (!(await askConfirm(testo))) return;
//   const valore = await askText(testo, { defaultValue: '10' }); // null se annullato
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from './LanguageProvider';

let show = null;
const queue = [];

function request(kind, message, options = {}) {
  return new Promise(resolve => {
    const item = { kind, message: String(message ?? ''), options, resolve };
    // Prima che la finestra sia pronta (o senza finestra, nei test) si ripiega su quelle native.
    if (!show) {
      if (typeof window === 'undefined') return resolve(kind === 'text' ? null : false);
      return resolve(kind === 'text' ? window.prompt(item.message, options.defaultValue ?? '') : window.confirm(item.message));
    }
    queue.push(item);
    if (queue.length === 1) show(item);
  });
}
export const askConfirm = (message, options) => request('confirm', message, options);
export const askText = (message, options) => request('text', message, options);

export function ConfirmHost() {
  const { t } = useLanguage();
  const dialog = useRef(null), input = useRef(null);
  const [item, setItem] = useState(null), [value, setValue] = useState('');
  useEffect(() => {
    show = next => { setItem(next); setValue(next.options.defaultValue ?? ''); };
    return () => { show = null; };
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!item || !node) return;
    if (!node.open) { try { node.showModal(); } catch { node.setAttribute('open', ''); } }
    // Testo: si scrive subito. Conferma: il focus va su «Annulla», la scelta prudente.
    requestAnimationFrame(() => (item.kind === 'text' ? input.current?.select() : node.querySelector('[data-cancel]')?.focus()));
  }, [item]);
  function close(result) {
    const current = queue.shift();
    dialog.current?.open && dialog.current.close();
    setItem(null);
    current?.resolve(result);
    if (queue.length) setTimeout(() => show?.(queue[0]), 0);
  }
  const cancel = () => close(item?.kind === 'text' ? null : false);
  return <dialog ref={dialog} className="app-dialog" aria-labelledby="app-dialog-message"
    onCancel={event => { event.preventDefault(); cancel(); }}
    onClick={event => { if (event.target === dialog.current) cancel(); }}>
    {item && <form method="dialog" onSubmit={event => { event.preventDefault(); close(item.kind === 'text' ? value : true); }}>
      <p id="app-dialog-message">{item.message}</p>
      {item.kind === 'text' && <input ref={input} value={value} onChange={event => setValue(event.target.value)} aria-labelledby="app-dialog-message" autoComplete="off"/>}
      <div className="app-dialog-actions">
        <button type="button" className="btn btn-soft" data-cancel onClick={cancel}>{t('general.cancel')}</button>
        <button type="submit" className={`btn ${item.options.danger ? 'btn-danger' : 'btn-primary'}`}>{item.options.confirmLabel || t('general.confirm')}</button>
      </div>
    </form>}
  </dialog>;
}
