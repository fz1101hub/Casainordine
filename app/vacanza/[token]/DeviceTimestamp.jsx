'use client';
import {useEffect, useState} from 'react';
import {formatTimestampForDevice} from '../../../lib/v20-timestamp.mjs';

// Il server conosce solo l'ora italiana. Nel browser, se il dispositivo segna un'altra ora
// (chi apre il link dall'estero), si aggiunge anche quella, con le etichette.
export default function DeviceTimestamp({value, locale, italian, italyLabel, deviceLabel}) {
  const [text, setText] = useState(italian);
  useEffect(() => {
    setText(formatTimestampForDevice(value, locale, {fallback: italian, italyLabel, deviceLabel}));
  }, [value, locale, italian, italyLabel, deviceLabel]);
  return <span>{text}</span>;
}
