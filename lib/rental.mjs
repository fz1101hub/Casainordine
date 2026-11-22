// Profilo locatore/inquilino (Fase 2, 3.3): contratto d'affitto, verbali d'ingresso e d'uscita con
// stanze, letture e foto. Le due parti vedono solo il contratto e i verbali (regole nel database,
// migrate_v49_affitti.sql). Modulo senza testi: stati e tipi sono chiavi («rental.*»).

export const LEASE_STATUSES = Object.freeze(['invited', 'active', 'ended']);
export const REPORT_KINDS = Object.freeze(['check_in', 'check_out']);
export const ROOM_STATES = Object.freeze(['good', 'worn', 'damaged']);
export const RENTAL_LIMITS = Object.freeze({ label: 160, address: 300, notes: 1500, reportNotes: 3000, rooms: 40, room: 80, roomNotes: 500, readings: 12, meter: 60, unit: 10, maxAmount: 10000000 });

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const money = value => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Math.round(Number(String(value).replace(',', '.')) * 100) / 100;
  return Number.isFinite(n) && n >= 0 && n <= RENTAL_LIMITS.maxAmount ? n : NaN;
};

export function normalizeLease(input = {}) {
  const property_label = clean(input.property_label, RENTAL_LIMITS.label);
  if (property_label.length < 2) return { error: 'rental.error.label' };
  const tenant_email = clean(input.tenant_email, 254).toLowerCase();
  if (!EMAIL.test(tenant_email)) return { error: 'rental.error.email' };
  if (!ISO.test(input.start_on || '')) return { error: 'rental.error.start' };
  const end_on = ISO.test(input.end_on || '') ? input.end_on : null;
  if (end_on && end_on < input.start_on) return { error: 'rental.error.dates' };
  const rent = money(input.rent), deposit = money(input.deposit);
  if (Number.isNaN(rent) || Number.isNaN(deposit)) return { error: 'rental.error.amount' };
  return { value: { property_id: input.property_id || null, property_label, property_address: clean(input.property_address, RENTAL_LIMITS.address),
    tenant_email, start_on: input.start_on, end_on, rent, deposit, notes: String(input.notes ?? '').trim().slice(0, RENTAL_LIMITS.notes) } };
}

// Stanze del verbale: senza nome si scartano; stato noto (altrimenti «buono»).
export function normalizeRooms(rooms = []) {
  return (Array.isArray(rooms) ? rooms : []).map(room => ({
    room: clean(room?.room, RENTAL_LIMITS.room),
    state: ROOM_STATES.includes(room?.state) ? room.state : 'good',
    notes: String(room?.notes ?? '').trim().slice(0, RENTAL_LIMITS.roomNotes),
  })).filter(room => room.room).slice(0, RENTAL_LIMITS.rooms);
}

// Letture dei contatori: nome e numero non negativo.
export function normalizeReadings(readings = []) {
  return (Array.isArray(readings) ? readings : []).map(reading => {
    const raw = String(reading?.value ?? '').trim();
    const value = raw === '' ? NaN : Number(raw.replace(',', '.'));
    return { meter: clean(reading?.meter, RENTAL_LIMITS.meter), value: Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) / 1000 : null, unit: clean(reading?.unit, RENTAL_LIMITS.unit) };
  }).filter(reading => reading.meter && reading.value !== null).slice(0, RENTAL_LIMITS.readings);
}

// draft: nessuna firma; landlord / tenant: firmato solo da una parte; locked: firmato da entrambi.
export function reportState(report = {}) {
  if (report.landlord_signed_at && report.tenant_signed_at) return 'locked';
  if (report.landlord_signed_at) return 'landlord';
  if (report.tenant_signed_at) return 'tenant';
  return 'draft';
}

const RANK = { good: 0, worn: 1, damaged: 2 };
const key = text => String(text ?? '').toLocaleLowerCase('it').trim();
// Confronto ingresso → uscita: stanze peggiorate e consumi tra le due letture dello stesso contatore.
export function compareReports(checkIn = {}, checkOut = {}) {
  const before = new Map(normalizeRooms(checkIn.rooms).map(room => [key(room.room), room]));
  const worse = normalizeRooms(checkOut.rooms)
    .filter(room => before.has(key(room.room)) && RANK[room.state] > RANK[before.get(key(room.room)).state])
    .map(room => ({ room: room.room, from: before.get(key(room.room)).state, to: room.state }));
  const start = new Map(normalizeReadings(checkIn.readings).map(reading => [key(reading.meter), reading]));
  const usage = normalizeReadings(checkOut.readings).filter(reading => start.has(key(reading.meter)))
    .map(reading => ({ meter: reading.meter, unit: reading.unit || start.get(key(reading.meter)).unit, used: Math.round((reading.value - start.get(key(reading.meter)).value) * 1000) / 1000 }));
  return { worse, usage };
}

// Percorso di una foto nel bucket «lease-files»: cartella del contratto (lo controlla il database).
export function leasePhotoPath(leaseId, fileType, id = crypto.randomUUID()) {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[fileType];
  return extension ? `${leaseId}/${id}.${extension}` : '';
}
