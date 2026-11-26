'use client';
// «Mostrate N di M» e «Mostra ancora …» per gli elenchi lunghi (prova con tanti dati del
// 26 novembre 2026): la pagina disegna poche righe alla volta e resta veloce sul telefono.
import { useLanguage } from './LanguageProvider';

export default function ShowMore({ shown, total, step = 50, onMore }) {
  const { t: tr } = useLanguage();
  if (total <= shown) return null;
  const next = Math.min(step, total - shown);
  return <p className="show-more"><small className="muted">{tr('general.shownOf', { shown, total })}</small>
    <button type="button" className="btn btn-soft" onClick={() => onMore(shown + next)}>{tr('general.showMore', { count: next })}</button></p>;
}
