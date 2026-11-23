// Supabase finto per le prove delle API: un server HTTP locale che risponde come Auth, PostgREST e
// Storage per quello che usano le route di app/api. Le route girano senza modifiche, con il client
// Supabase vero: si controlla che cosa chiedono e che cosa cambia nei dati.
// Gestisce: utenti per token, filtri eq/neq/in/is/not.is/gte/gt/lte/lt, ordinamento, limit/range,
// conteggi (HEAD o count=exact), oggetti singoli, insert, upsert con on_conflict, update, delete,
// rpc con funzioni registrate, rimozione e elenco dei file, utenti per l'amministrazione.
// Per il browser (scripts/prove-con-accesso.mjs): CORS, accesso con email e password (token in
// forma di JWT), uscita, caricamento e scaricamento dei file, porta fissa.
import { createServer } from 'node:http';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
// Token in forma di JWT (la firma non si controlla: il server finto riconosce i token che ha dato).
export const fakeJwt = (user, ttl = 3600) => {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: now + ttl, iat: now, session_id: `s-${user.id}` })}.firma`;
};

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

// Il client manda i file come FormData (multipart) o come corpo semplice.
function fileBytes(buffer, contentType) {
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return Object.assign(buffer, { type: contentType });
  const text = buffer.toString('latin1');
  for (const part of text.split(`--${boundary}`)) {
    const [head, ...rest] = part.split('\r\n\r\n');
    if (!/filename=|name=""/.test(head)) continue;
    const content = rest.join('\r\n\r\n').replace(/\r\n$/, '');
    return Object.assign(Buffer.from(content, 'latin1'), { type: head.match(/Content-Type:\s*(\S+)/i)?.[1] || '' });
  }
  return Object.assign(buffer, { type: contentType });
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

export async function startFakeSupabase({ port = 0, lenientRpc = false } = {}) {
  const state = { tables: {}, tokens: new Map(), users: new Map(), passwords: new Map(), rpc: {}, removed: [], files: {}, uploads: [], requests: [], deletedUsers: [], rejectKeys: new Set() };
  const table = name => (state.tables[name] ||= []);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
    const cors = { 'access-control-allow-origin': req.headers.origin || '*', 'access-control-allow-credentials': 'true',
      'access-control-allow-headers': req.headers['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
      'access-control-expose-headers': 'content-range, content-type, x-client-info' };
    const send = (status, payload, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...cors, ...headers });
      res.end(payload === undefined ? '' : JSON.stringify(payload));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const path = url.pathname;
    state.requests.push({ method: req.method, path, query: url.search, body: Buffer.isBuffer(body) ? '[file]' : body });
    // Auth
    if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const user = [...state.users.values()].find(u => u.email === body?.email);
      if (!user || state.passwords.get(user.id) !== body?.password) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      const access_token = fakeJwt(user);
      state.tokens.set(access_token, user);
      return send(200, { access_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r-${user.id}`, user });
    }
    if (path === '/auth/v1/logout') return send(204);
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
    // Storage: file singoli (caricamento e scaricamento)
    const object = path.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/);
    if (object && object[1] !== 'list' && ['GET', 'POST', 'PUT'].includes(req.method)) {
      const [, bucket, name] = object.map(decodeURIComponent);
      const files = (state.files[bucket] ||= []);
      if (req.method === 'GET') {
        const file = files.find(f => f.name === name);
        if (!file) return send(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        res.writeHead(200, { 'content-type': file.type || 'application/octet-stream', ...cors }); return res.end(file.bytes);
      }
      const bytes = fileBytes(Buffer.concat(chunks), req.headers['content-type'] || '');
      files.push({ name, bytes, type: bytes.type });
      state.uploads.push(`${bucket}/${name}`);
      return send(200, { Key: `${bucket}/${name}`, Id: name });
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
      if (!fn && lenientRpc) return send(200, null);
      if (!fn) return send(404, { code: 'PGRST202', message: `function ${rpc[1]} not found` });
      try { return send(200, await fn(body || {}, state)); } catch (e) { return send(400, { code: e.code || 'P0001', message: e.message }); }
    }
    const rest = path.match(/^\/rest\/v1\/([^/]+)$/);
    if (!rest) return send(404, { message: `percorso non gestito: ${path}` });
    // Chiave rifiutata (per esempio di un altro progetto).
    if (state.rejectKeys.has(req.headers.apikey)) return send(401, { message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' });
    const name = rest[1], rows = table(name);
    const filters = [...url.searchParams.entries()].filter(([k]) => !RESERVED.has(k));
    const selected = () => rows.filter(r => filters.every(([col, expr]) => matches(r, col, expr)));
    const prefer = String(req.headers.prefer || '');
    const wantsObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
    const reply = (list, status = 200) => {
      const headers = { 'content-range': `0-${Math.max(list.length - 1, 0)}/${list.length}` };
      if (req.method === 'HEAD') { res.writeHead(status, { ...cors, ...headers }); return res.end(); }
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
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, state,
    // Un utente con il suo token di accesso.
    addUser(id, email, { confirmed = true, password = null } = {}) {
      const user = { id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : null,
        app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
      state.tokens.set(`token-${id}`, user); state.users.set(id, user);
      if (password) state.passwords.set(id, password);
      return `token-${id}`;
    },
    addFile(bucket, name, bytes, type = 'application/octet-stream') { (state.files[bucket] ||= []).push({ name, bytes: Buffer.from(bytes), type }); },
    file: (bucket, name) => (state.files[bucket] || []).find(f => f.name === name),
    rows: name => table(name),
    seed(name, list) { table(name).push(...list.map(r => ({ ...r }))); },
    touched: name => state.requests.some(r => r.path === `/rest/v1/${name}`),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
