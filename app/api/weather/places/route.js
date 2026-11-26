// Ricerca del luogo del meteo per nome (città o paese), con Open-Meteo: solo per chi ha fatto
// l'accesso. Si restituiscono nome, regione e coordinate arrotondate a circa 1 km.
import { authenticatedUser, apiError } from '../../../../lib/server.mjs';
import { WEATHER, placesUrl, parsePlaces, cachedJson, WEATHER_CACHE } from '../../../../lib/weather.mjs';
export const runtime = 'nodejs';
const LANGS = new Set(['it', 'en', 'es', 'fr', 'de', 'pt']);
export async function GET(request) {
  const user = await authenticatedUser(request); if (!user) return apiError('weatherLogin', 401);
  const url = new URL(request.url);
  const name = String(url.searchParams.get('q') || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name.length < WEATHER.queryMin || name.length > WEATHER.queryMax) return apiError('weatherInvalid', 400);
  const lang = LANGS.has(url.searchParams.get('lang')) ? url.searchParams.get('lang') : 'it';
  try {
    return Response.json({ places: parsePlaces(await cachedJson(placesUrl(name, lang), WEATHER_CACHE.placesMs)) }, { headers: { 'Cache-Control': 'private, max-age=86400' } });
  } catch { return apiError('weatherUnavailable', 502); }
}
