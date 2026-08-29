/** API client for /api/saavn with request-level dedupe and short memory cache. */
const BASE = '/api/saavn';
const inflight = new Map();
const memo = new Map(); // key -> {t, v}; 90s TTL
const TTL = 90_000;

export async function api(op, params = {}) {
  const qs = new URLSearchParams({ op, ...params });
  const key = qs.toString();
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const res = await fetch(`${BASE}?${key}`);
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
    return j.data;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  if (op !== 'reco') memo.set(key, { t: Date.now(), v: p });
  return p;
}

/** Fetch with graceful fallback: returns null on error (for non-critical calls). */
export async function tryApi(op, params = {}) {
  try { return await api(op, params); } catch { return null; }
}

export const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export const fmtPlays = (n) => {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B+`;
  if (n >= 1e8) return `${Math.round(n / 1e8)}00M+`;
  if (n >= 1e7) return `${Math.round(n / 1e7)}0M+`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M+`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

export const artistsLine = (track) => (track?.artists?.length ? track.artists.map((a) => a.name).join(', ') : 'Unknown');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
