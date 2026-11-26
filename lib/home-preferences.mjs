// Per-user Home settings shared by the UI and Node tests. No personal data here.
// Il nome di ogni riquadro è nel dizionario: «home.widget.<id>» (five_minutes → briefing).
export const HOME_WIDGETS = Object.freeze([
  Object.freeze({ id: 'bills', page: 'bills' }),
  Object.freeze({ id: 'shopping', page: 'shopping' }),
  Object.freeze({ id: 'tasks', page: 'tasks' }),
  Object.freeze({ id: 'five_minutes', page: 'briefing' }),
  // Dal 26 novembre 2026 (migrate_v63): sezioni nuove, spenti di partenza.
  Object.freeze({ id: 'medicines', page: 'health' }),
  Object.freeze({ id: 'health', page: 'health' }),
  Object.freeze({ id: 'pets', page: 'pets' }),
  Object.freeze({ id: 'garden', page: 'garden' }),
  Object.freeze({ id: 'documents', page: 'iddocs' }),
  Object.freeze({ id: 'installments', page: 'installments' }),
  // Dal 26 novembre 2026 (migrate_v66): uscite di questo mese e del prossimo (previsione delle uscite).
  Object.freeze({ id: 'spending', page: 'insights' })
]);
export const DEFAULT_HOME_PREFERENCES = Object.freeze({
  widgets: Object.freeze(['bills', 'shopping', 'tasks', 'five_minutes']),
  layout: 'compact'
});
const allowed = new Set(HOME_WIDGETS.map(item => item.id));
export function normalizeHomePreferences(source) {
  const input = source?.widget_order ?? source?.widgets;
  const unique = [];
  if (Array.isArray(input)) {
    for (const id of input) if (typeof id === 'string' && allowed.has(id) && !unique.includes(id)) unique.push(id);
  }
  return {
    widgets: unique.length ? unique : [...DEFAULT_HOME_PREFERENCES.widgets],
    layout: source?.layout === 'expanded' ? 'expanded' : 'compact'
  };
}
export function moveHomeWidget(source, id, direction) {
  const current = normalizeHomePreferences(source);
  const from = current.widgets.indexOf(id), to = from + direction;
  if (!Number.isInteger(direction) || Math.abs(direction) !== 1 || from < 0 || to < 0 || to >= current.widgets.length) return current;
  const widgets = [...current.widgets];
  [widgets[from], widgets[to]] = [widgets[to], widgets[from]];
  return { ...current, widgets };
}
export function toggleHomeWidget(source, id) {
  const current = normalizeHomePreferences(source);
  if (!allowed.has(id)) return current;
  if (!current.widgets.includes(id)) return { ...current, widgets: [...current.widgets, id] };
  if (current.widgets.length === 1) return current; // Always show at least one widget.
  return { ...current, widgets: current.widgets.filter(item => item !== id) };
}
