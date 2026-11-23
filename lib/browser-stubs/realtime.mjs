// Sostituto vuoto di @supabase/realtime-js, solo per il browser (next.config.mjs, turbopack.resolveAlias).
// L'app non usa Realtime (canali e aggiornamenti in diretta): supabase-js crea comunque il client
// all'avvio e gli passa il token quando cambia, quindi bastano questi metodi. Così il browser non
// scarica realtime-js e phoenix (circa 56 kB). Un test controlla che l'app non usi i canali.
const disabled = () => new Error('Realtime non è attivo in Casa in Ordine');
export class RealtimeClient {
  constructor(endpoint, options = {}) { this.endpoint = endpoint; this.options = options; this.channels = []; }
  setAuth() { return Promise.resolve(); }
  channel() { throw disabled(); }
  getChannels() { return []; }
  removeChannel() { return Promise.resolve('ok'); }
  removeAllChannels() { return Promise.resolve([]); }
  connect() {}
  disconnect() {}
}
