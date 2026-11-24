'use client';
// Scorte domestiche (Fase 2, 3.3): quantità con − e +, soglia di riordino e proposta per la lista
// della spesa. Nella lista va solo quello che la persona sceglie (niente aggiunte silenziose).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Minus, Plus, Pencil, Trash2, ShoppingBasket, Copy, Info } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { STOCK_UNITS, STOCK_LIMITS, normalizeStockItem, stockStatus, stepFor, adjustQuantity, shoppingProposal, sortStock, titleKey } from '../lib/stock.mjs';
import DecimalInput from './DecimalInput';

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const blank = () => ({ id: null, name: '', unit: 'pcs', quantity: '1', threshold: '1', usual_buy: '1', location: '' });
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

function StockSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, locale } = useLanguage();
  const [items, setItems] = useState([]), [shopping, setShopping] = useState([]);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [working, setWorking] = useState(false);
  const [form, setForm] = useState(blank());
  const writable = demo || canWrite;
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value) || 0);
  // «1 confezione», «2 confezioni»: il singolare solo per esattamente uno.
  const amount = (value, unit) => `${number(value)} ${tr((Number(value) === 1 ? 'stock.unitOne.' : 'stock.unit.') + unit)}`;

  const load = useCallback(async () => {
    if (demo || !client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const scope = query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user.id).is('home_id', null));
    const [stock, list] = await Promise.all([
      scope(client.from('home_stock_items').select('*')).order('name').limit(STOCK_LIMITS.perSpace),
      homeId ? client.from('home_shopping').select('title').eq('home_id', homeId).eq('checked', false).limit(300) : { data: [] },
    ]);
    setLoading(false);
    if (stock.error) {
      if (MISSING_TABLE.has(stock.error.code)) setMissing(true); else onNotify(friendlyError(stock.error, tr));
      return;
    }
    setMissing(false); setItems(stock.data || []); setShopping((list.data || []).map(row => row.title));
  }, [client, demo, homeId, user?.id]);
  useEffect(() => { setItems([]); setShopping([]); setForm(blank()); load(); }, [load]);

  const sorted = useMemo(() => sortStock(items), [items]);
  const proposal = useMemo(() => shoppingProposal(items, shopping), [items, shopping]);
  const toBuy = proposal.filter(entry => !entry.inList);

  async function save(event) {
    event.preventDefault();
    const result = normalizeStockItem(form);
    if (result.error) { onNotify(tr(result.error)); return; }
    if (!form.id && items.length >= STOCK_LIMITS.perSpace) { onNotify(tr('stock.error.limit')); return; }
    const value = result.value;
    if (demo) setItems(list => (form.id ? list.map(i => (i.id === form.id ? { ...i, ...value } : i)) : [...list, { ...value, id: uid() }]));
    else {
      setWorking(true);
      const { error } = form.id
        ? await client.from('home_stock_items').update(value).eq('id', form.id)
        : await client.from('home_stock_items').insert({ ...value, home_id: homeId || null });
      setWorking(false);
      if (error) { onNotify(friendlyError(error, tr)); return; }
      await load();
    }
    onNotify(tr(form.id ? 'stock.updated' : 'stock.saved'));
    setForm(blank());
  }

  // − e +: in un account passano dalla funzione del database, che non perde i tocchi fatti insieme.
  async function change(item, direction) {
    const delta = direction * stepFor(item.unit);
    let next = adjustQuantity(item.quantity, delta);
    if (!demo) {
      const { data, error } = await client.rpc('v46_adjust_stock', { p_item: item.id, p_delta: delta });
      if (error) { onNotify(friendlyError(error, tr)); return; }
      next = Number(data);
    }
    setItems(list => list.map(i => (i.id === item.id ? { ...i, quantity: next } : i)));
    if (direction < 0 && stockStatus({ ...item, quantity: next }) !== 'ok' && stockStatus(item) === 'ok') onNotify(tr('stock.nowLow', { name: item.name }));
  }

  function edit(item) {
    setForm({ id: item.id, name: item.name, unit: item.unit, quantity: String(item.quantity), threshold: String(item.threshold), usual_buy: String(item.usual_buy), location: item.location || '' });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(item) {
    if (!(await askConfirm(tr('stock.deleteConfirm'), { danger: true }))) return;
    if (!demo) {
      const { error } = await client.from('home_stock_items').delete().eq('id', item.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setItems(list => list.filter(i => i.id !== item.id));
    if (form.id === item.id) setForm(blank());
    onNotify(tr('stock.deleted'));
  }

  // Nella lista della spesa della casa: solo le scorte scelte, una volta sola.
  async function addToShopping(entries) {
    const rows = entries.filter(entry => !shopping.some(title => titleKey(title) === titleKey(entry.item.name)))
      .map(({ item }) => ({ home_id: homeId, title: item.name, quantity: amount(item.usual_buy, item.unit).slice(0, 40) }));
    if (!rows.length) return;
    const { error } = await client.from('home_shopping').insert(rows);
    if (error) { onNotify(friendlyError(error, tr)); return; }
    setShopping(list => [...list, ...rows.map(row => row.title)]);
    onNotify(rows.length === 1 ? tr('stock.addedOne', { name: rows[0].title }) : tr('stock.addedMany', { count: rows.length }));
  }

  // Senza una casa condivisa la lista della spesa non c'è: si copia il testo da incollare dove serve.
  async function copyList() {
    const text = proposal.map(({ item }) => `- ${item.name}: ${amount(item.usual_buy, item.unit)}`).join('\n');
    try { await navigator.clipboard.writeText(text); onNotify(tr('stock.copied')); }
    catch { onNotify(tr('stock.copyFailed')); }
  }

  const set = patch => setForm(f => ({ ...f, ...patch }));
  const statusLabel = status => tr('stock.status.' + status);

  return <div className="extra-main stock">
    <div className="page-heading"><div><div className="eyebrow">{tr('stock.eyebrow')}</div><h1>{tr('nav.stock')}</h1><p>{tr('stock.help')}</p></div></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('stock.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('stock.demo')}</p></div>}
    {!demo && !missing && !canWrite && <div className="informative"><Info size={17} /><p>{tr('stock.readOnly')}</p></div>}
    {!missing && <div className="extra-layout">
      <section className="panel extra-panel">
        <h2><Package size={19} /> {tr(form.id ? 'stock.edit' : 'stock.new')}</h2>
        {!writable ? <p className="muted">{tr('stock.readOnlyShort')}</p> :
        <form className="extra-form" onSubmit={save}>
          <Field label={tr('stock.name')}><input required minLength={2} maxLength={STOCK_LIMITS.name} value={form.name} placeholder={tr('stock.namePlaceholder')} onChange={e => set({ name: e.target.value })} /></Field>
          <div className="extra-row">
            <Field label={tr('stock.quantity')}><DecimalInput decimals={3} required min="0" max={STOCK_LIMITS.maxQuantity} value={form.quantity} onChange={e => set({ quantity: e.target.value })} /></Field>
            <Field label={tr('stock.unit')}><select value={form.unit} onChange={e => set({ unit: e.target.value })}>{STOCK_UNITS.map(unit => <option key={unit} value={unit}>{tr('stock.unit.' + unit)}</option>)}</select></Field>
          </div>
          <div className="extra-row">
            <Field label={tr('stock.threshold')}><DecimalInput decimals={3} required min="0" max={STOCK_LIMITS.maxQuantity} value={form.threshold} onChange={e => set({ threshold: e.target.value })} /></Field>
            <Field label={tr('stock.usualBuy')}><DecimalInput decimals={3} required min="0.01" max={STOCK_LIMITS.maxQuantity} value={form.usual_buy} onChange={e => set({ usual_buy: e.target.value })} /></Field>
          </div>
          <Field label={tr('stock.location')}><input maxLength={STOCK_LIMITS.location} value={form.location} placeholder={tr('stock.locationPlaceholder')} onChange={e => set({ location: e.target.value })} /></Field>
          <div className="extra-buttons">
            <button className="btn btn-primary" disabled={working}>{tr(form.id ? 'stock.update' : 'stock.save')}</button>
            {form.id && <button type="button" className="btn btn-soft" onClick={() => setForm(blank())}>{tr('stock.cancel')}</button>}
          </div>
        </form>}
      </section>
      <section className="panel extra-panel">
        {proposal.length > 0 && <div className="stock-proposal">
          <h2><ShoppingBasket size={19} /> {tr('stock.toBuy')}</h2>
          <p className="muted">{tr(homeId ? 'stock.proposalHelp' : 'stock.proposalHelpPersonal')}</p>
          <ul>{proposal.map(({ item, status, inList }) => <li key={item.id}>
            <span><b>{item.name}</b> · {amount(item.usual_buy, item.unit)} <span className={`extra-pill stock-${status}`}>{statusLabel(status)}</span></span>
            {homeId && canWrite && !demo && (inList ? <small className="muted">{tr('stock.inList')}</small>
              : <button className="btn btn-soft" onClick={() => addToShopping([{ item }])}><Plus size={15} /> {tr('stock.addToList')}</button>)}
          </li>)}</ul>
          <div className="extra-buttons">
            {homeId && canWrite && !demo && toBuy.length > 1 && <button className="btn btn-primary" onClick={() => addToShopping(toBuy)}>{tr('stock.addAll', { count: toBuy.length })}</button>}
            <button className="btn btn-soft" onClick={copyList}><Copy size={15} /> {tr('stock.copyList')}</button>
          </div>
        </div>}
        <h2>{tr('stock.list')}</h2>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !items.length ? <p className="muted">{tr('stock.empty')}</p> :
        <div className="extra-list">{sorted.map(item => {
          const status = stockStatus(item);
          return <div key={item.id} className={`extra-item stock-item stock-${status}`}>
            <div><b>{item.name} {status !== 'ok' && <span className={`extra-pill stock-${status}`}>{statusLabel(status)}</span>}</b>
              <small>{tr('stock.line', { quantity: amount(item.quantity, item.unit), threshold: amount(item.threshold, item.unit) })}{item.location ? ' · ' + item.location : ''}</small></div>
            {writable && <div className="stock-actions">
              <button className="icon-button" aria-label={tr('stock.less', { name: item.name })} title={tr('stock.less', { name: item.name })} disabled={Number(item.quantity) <= 0} onClick={() => change(item, -1)}><Minus size={16} /></button>
              <strong aria-live="polite">{number(item.quantity)}</strong>
              <button className="icon-button" aria-label={tr('stock.more', { name: item.name })} title={tr('stock.more', { name: item.name })} onClick={() => change(item, 1)}><Plus size={16} /></button>
              <button className="icon-button" aria-label={tr('stock.edit')} title={tr('stock.edit')} onClick={() => edit(item)}><Pencil size={15} /></button>
              <button className="icon-button danger" aria-label={tr('stock.delete')} title={tr('stock.delete')} onClick={() => remove(item)}><Trash2 size={15} /></button>
            </div>}
          </div>;
        })}</div>}
      </section>
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.stock.json).
export default function Stock(props) {
  const { t } = useLanguage();
  const ready = useSection('stock');
  return ready ? <StockSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}
