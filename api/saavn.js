/**
 * Saket Music 18 — Vercel serverless proxy: GET /api/saavn?op=search&query=…
 *
 * Thin CORS-enabled router around saavn-core. All responses JSON.
 */
import { saavn, SaavnError, OP_CACHE } from './saavn-core.mjs';

export const config = { runtime: 'edge' };

const send = (body, status, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=60, s-maxage=1800, stale-while-revalidate=86400',
    ...headers,
  },
});

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
    });
  }
  if (req.method !== 'GET') return send({ error: 'GET only' }, 405);

  const { searchParams } = new URL(req.url);
  const op = searchParams.get('op');
  const params = {};
  for (const [k, v] of searchParams) {
    if (k !== 'op') params[k] = v;
  }

  try {
    if (!op) return send({ error: "missing ?op= (home|search|song|album|playlist|artist|reco|topSearches)" }, 400);
    const data = await saavn(op, params);
    return send({ ok: true, op, data }, 200, {
      'cache-control': `public, max-age=60, s-maxage=${OP_CACHE[op] ?? 600}, stale-while-revalidate=86400`,
    });
  } catch (e) {
    if (e instanceof SaavnError) return send({ ok: false, op, error: e.message }, e.status);
    return send({ ok: false, op, error: 'internal error' }, 500);
  }
}
