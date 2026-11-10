// Intestazioni di sicurezza per tutte le pagine e le API.
//
// Content-Security-Policy: script solo da questa origine (più gli script in linea che Next.js
// inserisce in ogni pagina), WebAssembly per l'OCR, connessioni solo verso l'app e Supabase.
// Uno script estraneo, anche se riuscisse a entrare, non potrebbe mandare dati altrove.
// PDF.js, Tesseract e i caratteri sono serviti dall'app stessa (scripts/copy-pdf-worker.mjs).
export function contentSecurityPolicy({ supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, vercelEnv = process.env.VERCEL_ENV } = {}) {
  let supabase = [];
  try {
    if (supabaseUrl) {
      const { origin, host } = new URL(supabaseUrl);
      supabase = [origin, `wss://${host}`];
    }
  } catch { /* URL non valido: solo l'app */ }
  // Le anteprime di Vercel aggiungono la barra dei commenti da vercel.live.
  const preview = vercelEnv === 'preview' ? ['https://vercel.live'] : [];
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...preview],
    'style-src': ["'self'", "'unsafe-inline'", ...preview],
    'img-src': ["'self'", 'data:', 'blob:', ...supabase.slice(0, 1), ...preview, ...(preview.length ? ['https://vercel.com'] : [])],
    'font-src': ["'self'", 'data:', ...preview],
    'connect-src': ["'self'", ...supabase, ...preview, ...(preview.length ? ['wss://ws-us3.pusher.com'] : [])],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'frame-src': preview.length ? preview : ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };
  return Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
