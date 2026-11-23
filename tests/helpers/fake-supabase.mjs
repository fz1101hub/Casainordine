// Supabase finto per le prove delle API: un server HTTP locale che risponde come Auth, PostgREST e
// Storage per quello che usano le route di app/api. Le route girano senza modifiche, con il client
// Supabase vero: si controlla che cosa chiedono e che cosa cambia nei dati.
// Gestisce: utenti per token, filtri eq/neq/in/is/not.is/gte/gt/lte/lt, ordinamento, limit/range,
// conteggi (HEAD o count=exact), oggetti singoli, insert, upsert con on_conflict, update, delete,
// rpc con funzioni registrate, rimozione e elenco dei file, utenti per l'amministrazione.
import { createServer } from 'node:http';

const parseValue = v => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v);
const splitList = s => s.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''));
const same = (a, b) => (a === null || a === undefined ? b === null : String(a) === String(b));

function matches(row, col, expr) {
  const [op, ...rest] = expr.split('.');
  const raw = rest.join('.');
  const value = row[col];
  switch (op) {
    case 'eq': return same(value, parseValue(raw));
    case 'neq': return !same(value, parseValue(raw));
    case 'in': return splitList(raw).some(v => same(value, v));
    case 'is': return raw === 'null' ? value === null || value === undefined : same(value, parseValue(raw));
    case 'not': return !matches(row, col, raw);
    case 'gte': return value !== null && value !== undefined && String(value) >= raw;
    case 'gt': return value !== null && value !== undefined && String(value) > raw;
    case 'lte': return value !== null && value !== undefined && String(value) <= raw;
    case 'lt': return value !== null && value !== undefined && String(value) < raw;
    default: throw new Error(`filtro non gestito: ${col}=${expr}`);
  }
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

export async function startFakeSupabase() {
  const state = { tables: {}, tokens: new Map(), users: new Map(), rpc: {}, removed: [], files: {}, requests: [], deletedUsers: [] };
  const table = name => (state.tables[name] ||= []);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
    const send = (status, payload, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(payload === undefined ? '' : JSON.stringify(payload));
    };
    const path = url.pathname;
    state.requests.push({ method: req.method, path, query: url.search, body });
    // Auth
    if (path === '/auth/v1/user') {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const user = state.tokens.get(token);
      return user ? send(200, user) : send(401, { code: 401, msg: 'invalid JWT', error_code: 'bad_jwt' });
    }
    const admin = path.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
    if (admin) {
      const user = state.users.get(admin[1]);
      if (req.method === 'DELETE') { state.deletedUsers.push(admin[1]); state.users.delete(admin[1]); return send(200, {}); }
      return user ? send(200, user) : send(404, { code: 404, msg: 'User not found' });
    }
    // Storage
    const storage = path.match(/^\/storage\/v1\/object\/(list\/)?([^/]+)$/);
    if (storage) {
      if (storage[1]) return send(200, (state.files[storage[2]] || []).filter(f => f.name.startsWith(body?.prefix || '')).map(f => ({ name: f.name.slice((body?.prefix || '').length).replace(/^\//, ''), id: f.name })));
      if (req.method === 'DELETE') { state.removed.push(...(body?.prefixes || []).map(p => `${storage[2]}/${p}`)); return send(200, (body?.prefixes || []).map(name => ({ name }))); }
    }
    // RPC
    const rpc = path.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
    if (rpc) {
      const fn = state.rpc[rpc[1]];
      if (!fn) return send(404, { code: 'PGRST202', message: `function ${rpc[1]} not found` });
      try { return send(200, await fn(body || {}, state)); } catch (e) { return send(400, { code: e.code || 'P0001', message: e.message }); }
    }
    const rest = path.match(/^\/rest\/v1\/([^/]+)$/);
    if (!rest) return send(404, { message: `percorso non gestito: ${path}` });
    const name = rest[1], rows = table(name);
    const filters = [...url.searchParams.entries()].filter(([k]) => !RESERVED.has(k));
    const selected = () => rows.filter(r => filters.every(([col, expr]) => matches(r, col, expr)));
    const prefer = String(req.headers.prefer || '');
    const wantsObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
    const reply = (list, status = 200) => {
      const headers = { 'content-range': `0-${Math.max(list.length - 1, 0)}/${list.length}` };
      if (req.method === 'HEAD') { res.writeHead(status, { ...headers }); return res.end(); }
      if (wantsObject) return list.length === 1 ? send(status, list[0], headers) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      if (!prefer.includes('return=representation') && req.method !== 'GET') return send(status === 200 ? 204 : status, undefined, headers);
      return send(status, list, headers);
    };
    if (req.method === 'GET' || req.method === 'HEAD') {
      let list = selected();
      const order = url.searchParams.get('order');
      if (order) {
        const [col, dir] = order.split(',')[0].split('.');
        list = [...list].sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : 1) * (dir === 'desc' ? -1 : 1));
      }
      const offset = Number(url.searchParams.get('offset') || 0), limit = url.searchParams.get('limit');
      const range = String(req.headers.range || '').match(/^(\d+)-(\d+)$/);
      if (range) list = list.slice(Number(range[1]), Number(range[2]) + 1);
      else list = list.slice(offset, limit ? offset + Number(limit) : undefined);
      return reply(list);
    }
    if (req.method === 'POST') {
      const input = Array.isArray(body) ? body : [body];
      const conflict = url.searchParams.get('on_conflict');
      const out = [];
      for (const item of input) {
        const keys = (conflict || 'id').split(',');
        const existing = conflict || item.id ? rows.find(r => keys.every(k => item[k] !== undefined && same(r[k], item[k]))) : null;
        if (existing) {
          if (prefer.includes('resolution=merge-duplicates')) { Object.assign(existing, item); out.push(existing); continue; }
          if (prefer.includes('resolution=ignore-duplicates')) continue;
          return send(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
        }
        const row = { id: item.id || `${name}-${rows.length + 1}`, created_at: new Date().toISOString(), ...item };
        rows.push(row); out.push(row);
      }
      return reply(out, 201);
    }
    if (req.method === 'PATCH') { const list = selected(); for (const r of list) Object.assign(r, body); return reply(list); }
    if (req.method === 'DELETE') {
      const list = selected();
      state.tables[name] = rows.filter(r => !list.includes(r));
      return reply(list);
    }
    return send(405, { message: 'metodo non gestito' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, state,
    // Un utente con il suo token di accesso.
    addUser(id, email, { confirmed = true } = {}) {
      const user = { id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : null, app_metadata: {}, user_metadata: {} };
      state.tokens.set(`token-${id}`, user); state.users.set(id, user);
      return `token-${id}`;
    },
    rows: name => table(name),
    seed(name, list) { table(name).push(...list.map(r => ({ ...r }))); },
    touched: name => state.requests.some(r => r.path === `/rest/v1/${name}`),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
