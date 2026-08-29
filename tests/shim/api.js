
export async function api(op, params) { throw new Error('api:' + op); }
let recoPayload = null;
let gen = 0;
export function setRecoPayload(t) { recoPayload = t; }
export async function tryApi(op, params) {
  if (op === 'reco' && recoPayload) {
    // model the real API: excluded ids filtered. If everything the payload has
    // is excluded, the real 3-tier chain surfaces fresh catalog songs instead —
    // emulate that with a new id "generation".
    const excluded = new Set(String(params?.exclude ?? '').split(',').filter(Boolean));
    let tracks = recoPayload.filter((t) => !excluded.has(t.id));
    if (!tracks.length) {
      gen++;
      tracks = recoPayload.map((t) => ({ ...t, id: t.id + '_g' + gen, title: t.title + ' g' + gen }));
    }
    return { source: 'test', tracks };
  }
  return null;
}
export const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
export const artistsLine = (t) => (t?.artists?.length ? t.artists.map((a) => a.name).join(', ') : 'Unknown');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
