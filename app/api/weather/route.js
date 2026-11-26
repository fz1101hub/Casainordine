// Previsioni per il giardino (lib/weather.mjs): solo per chi ha fatto l'accesso, per coordinate
// arrotondate a circa 1 km. La richiesta a Open-Meteo parte da qui, non dal browser.
import { authenticatedUser, apiError } from '../../../lib/server.mjs';
import { roundCoords, forecastUrl, parseForecast, cachedJson, WEATHER_CACHE } from '../../../lib/weather.mjs';
export const runtime = 'nodejs';
export async function GET(request) {
  const user = await authenticatedUser(request); if (!user) return apiError('weatherLogin', 401);
  const url = new URL(request.url);
  const coords = roundCoords(url.searchParams.get('lat'), url.searchParams.get('lon'));
  if (!coords) return apiError('weatherInvalid', 400);
  try {
    const days = parseForecast(await cachedJson(forecastUrl(coords), WEATHER_CACHE.forecastMs));
    if (!days.length) return apiError('weatherUnavailable', 502);
    return Response.json({ days }, { headers: { 'Cache-Control': 'private, max-age=1800' } });
  } catch { return apiError('weatherUnavailable', 502); }
}
