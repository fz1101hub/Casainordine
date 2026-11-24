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
  const [text, setText] = useState(() => formatNumberInput(value, language, decimals));
  const emitted = useRef(value);
  const lastLanguage = useRef(language);

  function message(result) {
    if (!result.error) return '';
    if (result.error === 'decimals') return t('number.decimals');
    if (result.error === 'min') return t('number.min', { min: formatNumberInput(min, language, decimals) });
    if (result.error === 'max') return t('number.max', { max: formatNumberInput(max, language, decimals) });
    return t('number.invalid', { example: formatNumberInput(decimals === 2 ? 12.5 : 1.5, language, decimals) });
  }

  // Un valore nuovo dal genitore (modulo svuotato, lettura della foto, modifica di una voce)
  // o una lingua diversa: si riscrive il testo.
  useEffect(() => {
    const languageChanged = lastLanguage.current !== language;
    lastLanguage.current = language;
    if (!languageChanged && sameNumber(value, emitted.current)) return;
    emitted.current = value;
    setText(formatNumberInput(value, language, decimals));
  }, [value, language, decimals]);

  useEffect(() => {
    const result = parseNumberInput(text, { lang: language, decimals, min, max });
    ref.current?.setCustomValidity(message(result));
  });

  function handleChange(event) {
    const raw = event.target.value;
    setText(raw);
    const result = parseNumberInput(raw, { lang: language, decimals, min, max });
    event.target.setCustomValidity(message(result));
    const out = result.value === null ? '' : result.value;
    emitted.current = out;
    onChange?.({ target: { value: out, name: rest.name }, currentTarget: { value: out, name: rest.name } });
  }

  function handleBlur(event) {
    const result = parseNumberInput(text, { lang: language, decimals, min, max });
    if (result.value && result.error !== 'invalid' && result.error !== 'decimals') setText(formatNumberInput(result.value, language, decimals));
    rest.onBlur?.(event);
  }

  return <input {...rest} ref={ref} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
    value={text} onChange={handleChange} onBlur={handleBlur} />;
}
