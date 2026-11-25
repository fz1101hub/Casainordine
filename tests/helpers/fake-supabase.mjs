// Supabase finto per le prove delle API: un server HTTP locale che risponde come Auth, PostgREST e
// Storage per quello che usano le route di app/api. Le route girano senza modifiche, con il client
// Supabase vero: si controlla che cosa chiedono e che cosa cambia nei dati.
// Gestisce: utenti per token, filtri eq/neq/in/is/not.is/gte/gt/lte/lt/like/ilike e or=(...), ordinamento, limit/range,
// conteggi (HEAD o count=exact), oggetti singoli, insert, upsert con on_conflict, update, delete,
// rpc con funzioni registrate, rimozione e elenco dei file, utenti per l'amministrazione.
// Per il browser (scripts/prove-con-accesso.mjs): CORS, accesso con email e password (token in
// forma di JWT), uscita, caricamento e scaricamento dei file, porta fissa.
// Con rls: true, per le richieste fatte con il token di un utente, una versione semplificata delle
// regole di accesso (ognuno vede il proprio spazio e le case di cui è membro) e le funzioni delle
// case (create_home, invite_home_member, accept_home_invite). Le regole vere sono provate a parte,
// sul database (scripts/db-tests.sh): qui servono solo a far comportare l'app come con Supabase.
import { createHash, randomBytes } from 'node:crypto';
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

// or=(a.ilike."*x*",b.eq.1,and(c.eq.2,d.is.null),e.in.(x,y)): basta una condizione; and(...)
// le vuole tutte (la ricerca usa ilike su più colonne, i pagamenti and/in annidati).
function splitTop(list) {
  const parts = []; let depth = 0, quoted = false, current = '';
  for (const ch of list) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth--;
    if (!quoted && depth === 0 && ch === ',') { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
}
function logic(row, expr, every) {
  const parts = splitTop(expr.replace(/^\(|\)$/g, ''));
  const test = part => {
    const nested = part.match(/^(and|or)\((.*)\)$/);
    if (nested) return logic(row, nested[2], nested[1] === 'and');
    const [col, ...rest] = part.split('.');
    return matches(row, col, rest.join('.').replace(/"/g, ''));
  };
  return every ? parts.every(test) : parts.some(test);
}
const anyOf = (row, expr) => logic(row, expr, false);

function matches(row, col, expr) {
  if (col === 'or') return anyOf(row, expr);
  if (col === 'and') return logic(row, expr, true);
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
    case 'ilike': case 'like': {
      // * e % qualsiasi testo, _ una lettera qualsiasi (come in PostgreSQL).
      const pattern = new RegExp(`^${raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*').replace(/_/g, '.')}$`, op === 'ilike' ? 'is' : 's');
      return value !== null && value !== undefined && pattern.test(String(value));
    }
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

// Collegamenti incorporati che l'app chiede (select con tabella(colonne)): colonna → tabella.
const EMBED = { homes: 'home_id', bills: 'bill_id' };

// latency: millisecondi di attesa per ogni richiesta (per le prove con molti dati: rete simulata).
// maxRows: come l'impostazione «Max rows» di Supabase (1000 sul progetto vero), nessuna risposta
// supera quel numero di righe, qualunque sia limit o range.
// maxUrl: lunghezza massima dell'indirizzo (Supabase: 16 KB fra indirizzo e intestazioni, poi errore 520).
// missingColumns: { tabella: [colonne] } che il database non ha ancora (migrazione non eseguita):
// chiederle o scriverle dà l'errore di PostgREST, con select=* non tornano.
// tokenTtl: durata dei token in secondi (le prove con l'orologio del browser spostato in avanti ne usano una più lunga).
export async function startFakeSupabase({ port = 0, lenientRpc = false, rls = false, latency = 0, maxRows = Infinity, maxUrl = Infinity, tokenTtl = 3600, missingColumns = {} } = {}) {
  const state = { tables: {}, tokens: new Map(), users: new Map(), passwords: new Map(), rpc: {}, removed: [], files: {}, uploads: [], requests: [], deletedUsers: [], rejectKeys: new Set() };
  const table = name => (state.tables[name] ||= []);
  const isOwner = (user, homeId) => table('homes').some(h => h.id === homeId && h.owner_id === user.id);
  const memberOf = (user, homeId) => table('home_members').some(m => m.home_id === homeId && m.user_id === user.id);
  // Regole di accesso semplificate.
  const visible = (name, row, user) => {
    if (name === 'homes') return memberOf(user, row.id);
    if (name === 'home_members') return memberOf(user, row.home_id);
    if (name === 'home_invites') return table('homes').some(h => h.id === row.home_id && h.owner_id === user.id) || row.email === user.email;
    if (name === 'profiles') return row.id === user.id;
    if (row.home_id) return memberOf(user, row.home_id);
    if ('user_id' in row) return row.user_id === user.id;
    return true;
  };
  const hash = v => createHash('sha256').update(v).digest('hex');
  const fail = (code, message) => Object.assign(new Error(message), { code });
  // Funzioni delle case, con gli stessi controlli essenziali di quelle vere.
  const homeRpc = {
    create_home: ({ home_name }, _s, user) => {
      const id = `10000000-0000-4000-8000-${String(table('homes').length + 1).padStart(12, '0')}`;
      table('homes').push({ id, name: home_name, owner_id: user.id, created_at: new Date().toISOString() });
      table('home_members').push({ home_id: id, user_id: user.id, email: user.email, role: 'owner', joined_at: new Date().toISOString() });
      return id;
    },
    invite_home_member: ({ target_home, invite_email, invite_role }, _s, user) => {
      if (!table('homes').some(h => h.id === target_home && h.owner_id === user.id)) throw fail('42501', 'Solo il proprietario può invitare');
      const secret = randomBytes(32).toString('hex');
      table('home_invites').push({ id: `inv-${table('home_invites').length + 1}`, home_id: target_home, email: String(invite_email).toLowerCase(), role: invite_role, token_hash: hash(secret), created_by: user.id, claimed_at: null, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString() });
      return secret;
    },
    accept_home_invite: ({ secret }, _s, user) => {
      const invite = table('home_invites').find(i => i.token_hash === hash(String(secret)) && !i.claimed_at);
      if (!invite || invite.email !== user.email) throw fail('42501', 'Invito non valido o destinato a un altro indirizzo');
      invite.claimed_at = new Date().toISOString();
      table('home_members').push({ home_id: invite.home_id, user_id: user.id, email: user.email, role: invite.role, joined_at: new Date().toISOString() });
      return invite.home_id;
    },
    change_home_member_role: ({ target_home, target_user, new_role }, _s, user) => {
      if (!isOwner(user, target_home)) throw fail('42501', 'Solo il proprietario cambia i ruoli');
      if (!['editor', 'viewer'].includes(new_role)) throw fail('22023', 'Ruolo non valido');
      for (const m of table('home_members')) if (m.home_id === target_home && m.user_id === target_user && m.role !== 'owner') m.role = new_role;
      return null;
    },
    remove_home_member: ({ target_home, target_user }, _s, user) => {
      if (!isOwner(user, target_home) || target_user === user.id) throw fail('42501', 'Operazione non consentita');
      state.tables.home_members = table('home_members').filter(m => !(m.home_id === target_home && m.user_id === target_user));
      return null;
    },
    leave_home: ({ target_home }, _s, user) => {
      if (isOwner(user, target_home)) throw fail('42501', 'Il proprietario non può lasciare la casa');
      state.tables.home_members = table('home_members').filter(m => !(m.home_id === target_home && m.user_id === user.id));
      return null;
    },
    delete_home: ({ target_home, confirm_name }, _s, user) => {
      const home = table('homes').find(h => h.id === target_home);
      if (!home || home.owner_id !== user.id || home.name !== confirm_name) throw fail('42501', 'Operazione non consentita');
      state.tables.homes = table('homes').filter(h => h.id !== target_home);
      state.tables.home_members = table('home_members').filter(m => m.home_id !== target_home);
      for (const name of Object.keys(state.tables)) if (name !== 'homes') state.tables[name] = state.tables[name].filter(r => r.home_id !== target_home);
      return null;
    },
    // Azioni fatte offline: una volta sola per persona e codice della bozza, come v20_apply_offline_*.
    v20_apply_offline_task: ({ p_client_id, title_text, due_on }, _s, user) => {
      const done = table('offline_import_log').find(l => l.user_id === user.id && l.client_id === p_client_id);
      if (done) return done.record_id;
      const id = `task-${table('house_tasks').length + 1}`;
      table('house_tasks').push({ id, user_id: user.id, home_id: null, title: String(title_text).trim(), due_date: due_on || null, done: false, created_at: new Date().toISOString() });
      table('offline_import_log').push({ user_id: user.id, client_id: p_client_id, record_id: id });
      return id;
    },
    v20_apply_offline_shopping: ({ p_client_id, p_title, p_home_id }, _s, user) => {
      const member = table('home_members').find(m => m.home_id === p_home_id && m.user_id === user.id);
      if (!member || !['owner', 'editor'].includes(member.role)) throw fail('42501', 'Non hai permessi di modifica');
      const done = table('offline_import_log').find(l => l.user_id === user.id && l.client_id === p_client_id);
      if (done) return done.record_id;
      const id = `shop-${table('home_shopping').length + 1}`;
      table('home_shopping').push({ id, home_id: p_home_id, created_by: user.id, title: String(p_title).trim(), quantity: '1', checked: false, created_at: new Date().toISOString() });
      table('offline_import_log').push({ user_id: user.id, client_id: p_client_id, record_id: id });
      return id;
    },
    revoke_home_invite: ({ invite_id }, _s, user) => {
      const invite = table('home_invites').find(i => i.id === invite_id);
      if (!invite || !isOwner(user, invite.home_id)) throw fail('42501', 'Operazione non consentita');
      state.tables.home_invites = table('home_invites').filter(i => i.id !== invite_id);
      return null;
    },
  };
  const server = createServer(async (req, res) => {
    if (latency) await new Promise(done => setTimeout(done, latency));
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
      const access_token = fakeJwt(user, tokenTtl);
      state.tokens.set(access_token, user);
      return send(200, { access_token, token_type: 'bearer', expires_in: tokenTtl, expires_at: Math.floor(Date.now() / 1000) + tokenTtl, refresh_token: `r-${user.id}`, user });
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
      if (req.method === 'DELETE') {
        // Come Supabase: dopo la cancellazione i token dell'utente non valgono più (getUser risponde 401).
        state.deletedUsers.push(admin[1]); state.users.delete(admin[1]);
        for (const [token, owner] of state.tokens) if (owner.id === admin[1]) state.tokens.delete(token);
        return send(200, {});
      }
      return user ? send(200, user) : send(404, { code: 404, msg: 'User not found' });
    }
    // Storage: collegamenti temporanei (createSignedUrls) e scaricamento con il collegamento.
    const sign = path.match(/^\/storage\/v1\/object\/sign\/([^/]+)(?:\/(.+))?$/);
    if (sign) {
      const [, bucket, name] = sign.map(v => (v === undefined ? v : decodeURIComponent(v)));
      if (req.method === 'POST' && !name) return send(200, (body?.paths || []).map(p => ({ path: p, signedURL: `/object/sign/${bucket}/${p}?token=finto`, error: (state.files[bucket] || []).some(f => f.name === p) ? null : 'Object not found' })));
      if (req.method === 'GET' && name) {
        const file = (state.files[bucket] || []).find(f => f.name === name);
        if (!file) return send(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        res.writeHead(200, { 'content-type': file.type || 'application/octet-stream', ...cors }); return res.end(file.bytes);
      }
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
      if (req.method === 'DELETE') {
        const names = new Set(body?.prefixes || []);
        state.removed.push(...[...names].map(p => `${storage[2]}/${p}`));
        if (state.files[storage[2]]) state.files[storage[2]] = state.files[storage[2]].filter(f => !names.has(f.name));
        return send(200, [...names].map(name => ({ name })));
      }
    }
    // RPC
    const rpc = path.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
    const caller = state.tokens.get(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (rpc) {
      if (rls && caller && homeRpc[rpc[1]] && !state.rpc[rpc[1]]) {
        try { return send(200, await homeRpc[rpc[1]](body || {}, state, caller)); } catch (e) { return send(400, { code: e.code || 'P0001', message: e.message }); }
      }
      const fn = state.rpc[rpc[1]];
      if (!fn && lenientRpc) return send(200, null);
      if (!fn) return send(404, { code: 'PGRST202', message: `function ${rpc[1]} not found` });
      try { return send(200, await fn(body || {}, state, caller)); } catch (e) { return send(400, { code: e.code || 'P0001', message: e.message }); }
    }
    if (String(req.url).length > maxUrl) return send(520, { message: 'Indirizzo troppo lungo' });
    const rest = path.match(/^\/rest\/v1\/([^/]+)$/);
    if (!rest) return send(404, { message: `percorso non gestito: ${path}` });
    // Chiave rifiutata (per esempio di un altro progetto).
    if (state.rejectKeys.has(req.headers.apikey)) return send(401, { message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' });
    const name = rest[1], rows = table(name);
    const filters = [...url.searchParams.entries()].filter(([k]) => !RESERVED.has(k));
    const selected = () => rows.filter(r => filters.every(([col, expr]) => matches(r, col, expr)) && (!rls || !caller || visible(name, r, caller)));
    // Collegamenti incorporati: select=...,homes(id,name) aggiunge la casa a ogni riga.
    const embeds = [...String(url.searchParams.get('select') || '').matchAll(/(\w+)(?:!\w+)?\(/g)].map(m => m[1]).filter(e => EMBED[e]);
    const withEmbeds = list => embeds.length ? list.map(r => ({ ...r, ...Object.fromEntries(embeds.map(e => [e, table(e).find(x => x.id === r[EMBED[e]]) || null])) })) : list;
    const prefer = String(req.headers.prefer || '');
    const wantsObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
    // total: righe che rispondono alla lettura prima di limit/range (come il conteggio di PostgREST).
    const reply = (list, status = 200, total = list.length, from = 0) => {
      const headers = { 'content-range': `${list.length ? `${from}-${from + list.length - 1}` : '*'}/${total}` };
      if (req.method === 'HEAD') { res.writeHead(status, { ...cors, ...headers }); return res.end(); }
      list = withEmbeds(list);
      if (wantsObject) return list.length === 1 ? send(status, list[0], headers) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      if (!prefer.includes('return=representation') && req.method !== 'GET') return send(status === 200 ? 204 : status, undefined, headers);
      return send(status, list, headers);
    };
    const absent = missingColumns[name] || [];
    if (absent.length) {
      const asked = String(url.searchParams.get('select') || '').split(',').map(c => c.trim().split(':').pop());
      const missing = asked.find(c => absent.includes(c));
      if (missing) return send(400, { code: '42703', message: `column ${name}.${missing} does not exist` });
      const written = [].concat(body || []).flatMap(r => (r && typeof r === 'object' ? Object.keys(r) : [])).find(c => absent.includes(c));
      if (written && req.method !== 'GET') return send(400, { code: 'PGRST204', message: `Could not find the '${written}' column of '${name}' in the schema cache` });
    }
    const strip = list => (absent.length ? list.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !absent.includes(k)))) : list);
    if (req.method === 'GET' || req.method === 'HEAD') {
      let list = strip(selected());
      const order = url.searchParams.get('order');
      if (order) {
        const [col, dir] = order.split(',')[0].split('.');
        list = [...list].sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : 1) * (dir === 'desc' ? -1 : 1));
      }
      const offset = Number(url.searchParams.get('offset') || 0), limit = url.searchParams.get('limit');
      const range = String(req.headers.range || '').match(/^(\d+)-(\d+)$/);
      const total = list.length, from = range ? Number(range[1]) : offset;
      if (range) list = list.slice(Number(range[1]), Number(range[2]) + 1);
      else list = list.slice(offset, limit ? offset + Number(limit) : undefined);
      return reply(list.slice(0, maxRows), 200, total, from);
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
