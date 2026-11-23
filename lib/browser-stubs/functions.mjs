// Sostituto vuoto di @supabase/functions-js, solo per il browser: l'app non chiama Edge Functions.
// Esporta gli stessi nomi che supabase-js importa (un test lo controlla).
export class FunctionsError extends Error {
  constructor(message, name = 'FunctionsError', context) { super(message); this.name = name; this.context = context; }
}
export class FunctionsFetchError extends FunctionsError {}
export class FunctionsRelayError extends FunctionsError {}
export class FunctionsHttpError extends FunctionsError {}
export const FunctionRegion = Object.freeze({ Any: 'any' });
export class FunctionsClient {
  constructor(url) { this.url = url; }
  setAuth() {}
  async invoke() { return { data: null, error: new FunctionsError('Edge Functions non attive in Casa in Ordine') }; }
}
