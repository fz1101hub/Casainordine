'use client';
// Campo per importi e quantità con la virgola o il punto (vedi lib/number-input.mjs).
// Al genitore passa { target: { value } } con il numero col punto («12.5»), come faceva l'input numerico,
// così i moduli esistenti non cambiano. Se il testo non è un numero valido il modulo non si invia
// e il browser mostra il motivo.
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from './LanguageProvider';
import { formatNumberInput, parseNumberInput, sameNumber } from '../lib/number-input.mjs';

export default function DecimalInput({ value, onChange, decimals = 2, min, max, step, type, inputMode, ...rest }) {
  const { language, t } = useLanguage();
  const ref = useRef(null);
  // text: ciò che si vede; value: il numero che quel testo vale (o l'ultimo arrivato dal genitore).
  const [shown, setShown] = useState(() => ({ text: formatNumberInput(value, language, decimals), value, language }));
  // Un valore nuovo dal genitore (modulo svuotato, lettura della foto, rata scelta) o un'altra lingua:
  // il testo si riscrive subito, nello stesso aggiornamento (stato derivato, senza effetti).
  if (shown.language !== language || !sameNumber(value, shown.value)) {
    setShown({ text: formatNumberInput(value, language, decimals), value, language });
  }
  const text = shown.text;

  function message(result) {
    if (!result.error) return '';
    if (result.error === 'decimals') return t('number.decimals');
    if (result.error === 'min') return t('number.min', { min: formatNumberInput(min, language, decimals) });
    if (result.error === 'max') return t('number.max', { max: formatNumberInput(max, language, decimals) });
    return t('number.invalid', { example: formatNumberInput(decimals === 2 ? 12.5 : 1.5, language, decimals) });
  }

  useEffect(() => {
    const result = parseNumberInput(text, { lang: language, decimals, min, max });
    ref.current?.setCustomValidity(message(result));
  });

  function handleChange(event) {
    const raw = event.target.value;
    const result = parseNumberInput(raw, { lang: language, decimals, min, max });
    event.target.setCustomValidity(message(result));
    const out = result.value === null ? '' : result.value;
    setShown({ text: raw, value: out, language });
    onChange?.({ target: { value: out, name: rest.name }, currentTarget: { value: out, name: rest.name } });
  }

  function handleBlur(event) {
    const result = parseNumberInput(text, { lang: language, decimals, min, max });
    if (result.value && result.error !== 'invalid' && result.error !== 'decimals') setShown(old => ({ ...old, text: formatNumberInput(result.value, language, decimals) }));
    rest.onBlur?.(event);
  }

  return <input {...rest} ref={ref} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
    value={text} onChange={handleChange} onBlur={handleBlur} />;
}
