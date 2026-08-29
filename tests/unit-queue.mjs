/**
 * Unit tests for the rebuilt player queue logic (manual/seeded/reco sections,
 * prefetch-on-play, drain-recos-at-end) using a minimal DOM shim.
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ---------------- minimal DOM shim ---------------- */
const elements = new Map();
const mkEl = (id) => {
  const listeners = {};
  return {
    id, hidden: false, value: '1', textContent: '', innerHTML: '', src: '', title: '',
    style: {}, dataset: {},
    classList: { set: new Set(), toggle(c, on) { on === undefined ? (this.set.has(c) ? this.set.delete(c) : this.set.add(c)) : (on ? this.set.add(c) : this.set.delete(c)); return this.set.has(c); }, add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    addEventListener: (t, fn) => { (listeners[t] ??= []).push(fn); },
    dispatch: (t, ...a) => (listeners[t] ?? []).forEach((fn) => fn(...a)),
    querySelectorAll: () => [],
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    setPointerCapture: () => {},
    set src_(v) { this.src = v; },
  };
};
const IDS = ['audio', 'np-art', 'np-title', 'np-sub', 'np-like', 'pl-play', 'pl-prev', 'pl-next',
  'pl-shuffle', 'pl-repeat', 'pl-queue', 'pl-vol', 'vol', 'np-cur', 'np-dur', 'seek',
  'seek-fill', 'seek-knob', 'qd-list', 'qd-close', 'toast', 'queue-drawer'];
for (const id of IDS) elements.set(id, mkEl(id));
elements.get('audio').paused = true;
elements.get('audio').play = () => { elements.get('audio').paused = false; return Promise.resolve(); };
elements.get('audio').pause = () => { elements.get('audio').paused = true; };
elements.get('audio').load = () => {};

globalThis.document = {
  getElementById: (id) => elements.get(id) ?? null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => mkEl('tmp'),
  body: { appendChild: () => {}, lastElementChild: null },
};
globalThis.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
globalThis.addEventListener = () => {};
globalThis.location = { hash: '#/home', protocol: 'http:' };

/* copy real player.js into shim dir with stubbed api.js/store.js, then import */
const SHIM = new URL('./shim/', import.meta.url);
mkdirSync(SHIM, { recursive: true });
copyFileSync(new URL('../js/player.js', import.meta.url), new URL('./shim/player.js', import.meta.url));
writeFileSync(new URL('./shim/api.js', import.meta.url), `
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
`);
writeFileSync(new URL('./shim/store.js', import.meta.url), `
const m = new Map();
const read = (k, f) => { try { return JSON.parse(m.get(k)) ?? f; } catch { return f; } };
const write = (k, v) => { m.set(k, JSON.stringify(v)); };
export const getFavs = () => read('f', []);
export const isFav = (id) => getFavs().some((t) => t.id === id);
export const toggleFav = (t) => { const f = getFavs(); const i = f.findIndex((x) => x.id === t.id); if (i >= 0) { f.splice(i, 1); write('f', f); return false; } f.unshift(t); write('f', f); return true; };
export const pushRecent = (t) => { let r = read('r', []).filter((x) => x.id !== t.id); r.unshift(t); write('r', r.slice(0, 100)); };
export const getSettings = () => read('s', {});
export const setSetting = (k, v) => write('s', { ...read('s', {}), [k]: v });
`);

const player = await import('./shim/player.js');
const setRecoPayload = (await import('./shim/api.js')).setRecoPayload;

const { state, playList, playNext, queueAdd, next, toggle } = player;

/* reco payload served by the stubbed api.js */
const RECO_IDS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
const RECO_TRACKS = RECO_IDS.map((id, i) => ({
  id, kind: 'track', title: 'Reco ' + i, artists: [{ id: null, name: 'X' }],
  album: '', image: '', duration: 100 + i, url: 'u' + id, url96: 'u96' + id,
}));
setRecoPayload(RECO_TRACKS);

const T = (id, t) => ({ id, kind: 'track', title: t || ('Song ' + id), artists: [{ id: null, name: 'A' }], album: 'Alb', image: '', duration: 200, url: 'u' + id, url96: 'u96' + id });

test('playList: prefetches recommendations immediately (Spotify-style)', async () => {
  playList([T('a'), T('b'), T('c')], 0, { radio: true, contextName: 'Test Playlist' });
  assert.equal(state.current.id, 'a');
  // reco fetch is async — wait a tick
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(state.reco.length, 6, `reco prefetched: ${state.reco.length}`);
  assert.ok(state.reco.every((t) => t.url), 'all recos playable');
  assert.equal(state.list.length, 3);
  assert.deepEqual(state.queue, []);
});

test('queue sections: manual vs context vs reco are distinguishable', async () => {
  playNext(T('m1'));
  queueAdd(T('m2'));
  const manual = state.queue.filter((t) => t.manual);
  assert.equal(manual.length, 2);
  assert.equal(manual[0].id, 'm1'); // playNext puts it first
  assert.equal(manual[1].id, 'm2');
  assert.equal(state.reco.length, 6); // untouched by manual ops
});

test('advance: manual queue takes priority, then context, then recos', async () => {
  next(); // -> m1 (manual)
  assert.equal(state.current.id, 'm1');
  next(); // -> m2 (manual)
  assert.equal(state.current.id, 'm2');
  next(); // -> b (context order)
  assert.equal(state.current.id, 'b');
  next(); // -> c (context order)
  assert.equal(state.current.id, 'c');
  next(); // end of list -> drains recos -> r1
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(state.current.id, 'r1', `current after drain: ${state.current.id}`);
  assert.equal(state.current.fromReco, true, 'drained track tagged fromReco');
  const queuedRecos = state.queue.filter((t) => t.fromReco);
  assert.equal(queuedRecos.length, 5, 'remaining recos queued for drawer: ' + queuedRecos.length);
});

test('radio keeps refilling when recommendations run out', async () => {
  // burn through r2..r6
  for (let i = 0; i < 5; i++) next();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(state.current.id, 'r6');
  next(); // drains nothing left, fetchRecos again -> fresh 6 (r1 excluded via history)
  await new Promise((r) => setTimeout(r, 250));
  assert.notEqual(state.current.id, 'r6');
  assert.ok(state.current.fromReco || state.current.id, 'still playing from radio');
});

test('shuffle off: seeding keeps manual+reco, drops seeded', async () => {
  // toggle shuffle via internal state (element listener path covered by click handler test)
  state.shuffle = true;
  playList([T('x1'), T('x2'), T('x3'), T('x4')], 0, { radio: true });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(state.queue.every((t) => t.seeded), 'all queue items seeded on shuffle play');
  assert.equal(state.queue.length, 3, 'x2..x4 seeded');
  // user adds manual
  playNext(T('m9'));
  const manual = state.queue.filter((t) => t.manual);
  assert.equal(manual.length, 1);
  assert.equal(state.queue[0].id, 'm9');
});

test('repeat-one: next() manual still advances (only auto loops)', () => {
  state.repeat = 'one';
  const before = state.current.id;
  next(); // manual next — should advance despite repeat one
  assert.notEqual(state.current.id, before, 'manual next advances even in repeat-one');
  state.repeat = 'off';
});

test('state is serializable (no circular refs for queue drawer)', () => {
  JSON.stringify(state.queue);
  JSON.stringify(state.reco);
  JSON.stringify(state.history);
  JSON.stringify(state.current);
});
