// Menu laterale in gruppi (scelta dell'utente, 23 novembre 2026: «Raggruppa voci»).
// In alto le tre viste generali, in fondo le Impostazioni; il resto in quattro gruppi che si
// aprono e chiudono. Il gruppo della pagina aperta si apre da solo; gli altri restano come li ha
// lasciati la persona su questo dispositivo.
export const MENU_TOP = Object.freeze(['dashboard', 'overview', 'control']);
export const MENU_BOTTOM = Object.freeze(['settings']);
export const MENU_GROUPS = Object.freeze([
  { id: 'money', items: ['bills', 'utilities', 'payments', 'contracts', 'pagopa', 'budget', 'savings', 'insights', 'simulator', 'radar', 'fraud'] },
  { id: 'home', items: ['properties', 'maintenance', 'seasonal', 'professionals', 'projects', 'replacement', 'archive', 'inventory', 'tags', 'passport', 'rental', 'moving'] },
  { id: 'family', items: ['tasks', 'household', 'shopping', 'stock', 'vehicles', 'decisions', 'vacation', 'briefing', 'sos'] },
  { id: 'tools', items: ['alerts', 'automations', 'monitor', 'connect', 'offline', 'history'] },
]);
const STORAGE_KEY = 'cio-menu-groups';
const GROUP_IDS = new Set(MENU_GROUPS.map(g => g.id));

export function menuGroupOf(page) {
  return MENU_GROUPS.find(g => g.items.includes(page))?.id || null;
}

export function readOpenGroups(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(id => GROUP_IDS.has(id)) : [];
  } catch { return []; }
}

export function saveOpenGroups(storage, open) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify([...new Set(open)].filter(id => GROUP_IDS.has(id)))); } catch {}
}

export function toggleGroup(open, id) {
  return open.includes(id) ? open.filter(x => x !== id) : [...open, id];
}

// Aprendo una pagina il suo gruppo si apre (senza chiudere gli altri).
export function withPageGroup(open, page) {
  const group = menuGroupOf(page);
  return group && !open.includes(group) ? [...open, group] : open;
}
