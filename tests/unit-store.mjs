/**
 * Unit tests for the browser-side store (localStorage-backed library).
 * Simulates localStorage with a Map since we run under node.
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ---- minimal browser shims for store.js ---- */
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};
const src = readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
const mod = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);

const { toggleFav, isFav, getFavs, createPlaylist, addToPlaylist, removeFromPlaylist, deletePlaylist, renamePlaylist, getPlaylist, getPlaylists, pushRecent, getRecents, getSettings, setSetting, onLibraryChange } = mod;

const TRACK = { id: 't1', title: 'Song A', artists: [{ id: 'a1', name: 'X' }], album: 'Alb', image: 'img', duration: 200, url: 'u', url96: 'u96' };
const TRACK2 = { id: 't2', title: 'Song B', artists: [], album: 'Alb2', image: 'img2', duration: 180, url: 'u2', url96: 'u2' };

test('favorites: toggle on/off persists', () => {
  backing.clear();
  assert.equal(isFav('t1'), false);
  assert.equal(toggleFav(TRACK), true);
  assert.equal(isFav('t1'), true);
  assert.equal(getFavs().length, 1);
  assert.equal(getFavs()[0].title, 'Song A');
  assert.equal(toggleFav(TRACK), false);
  assert.equal(isFav('t1'), false);
});

test('favorites: dedupes by id, newest first', () => {
  backing.clear();
  toggleFav(TRACK);
  toggleFav(TRACK2);
  toggleFav(TRACK); // off
  toggleFav(TRACK); // on again -> goes to front
  const favs = getFavs();
  assert.equal(favs.length, 2);
  assert.equal(favs[0].id, 't1');
});

test('playlists: create/add/remove/delete/rename', () => {
  backing.clear();
  const pl = createPlaylist('  Workout  ');
  assert.equal(pl.name, 'Workout');
  assert.equal(addToPlaylist(pl.id, TRACK), true);
  assert.equal(addToPlaylist(pl.id, TRACK), false); // dup
  assert.equal(getPlaylist(pl.id).items.length, 1);
  assert.equal(addToPlaylist(pl.id, TRACK2), true);
  removeFromPlaylist(pl.id, 't2');
  assert.equal(getPlaylist(pl.id).items.length, 1);
  renamePlaylist(pl.id, 'Gym');
  assert.equal(getPlaylist(pl.id).name, 'Gym');
  deletePlaylist(pl.id);
  assert.equal(getPlaylist(pl.id), undefined);
  assert.equal(getPlaylists().length, 0);
});

test('playlist name falls back when empty', () => {
  backing.clear();
  const pl = createPlaylist('   ');
  assert.equal(pl.name, 'New Playlist');
});

test('recents: newest first, dedupe, capped at 100', () => {
  backing.clear();
  pushRecent(TRACK);
  pushRecent(TRACK2);
  pushRecent(TRACK); // moves to front
  const r = getRecents();
  assert.equal(r[0].id, 't1');
  assert.equal(r.length, 2);
  for (let i = 0; i < 120; i++) pushRecent({ ...TRACK, id: 'x' + i });
  assert.equal(getRecents().length, 100);
});

test('settings: defaults + overrides persist', () => {
  backing.clear();
  assert.deepEqual(getSettings(), { volume: 1, shuffle: false, repeat: 'off' });
  setSetting('volume', 0.5);
  setSetting('shuffle', true);
  const s = getSettings();
  assert.equal(s.volume, 0.5);
  assert.equal(s.shuffle, true);
  assert.equal(s.repeat, 'off');
});

test('library change events fire on writes', () => {
  backing.clear();
  let fired = 0;
  const off = onLibraryChange(() => fired++);
  toggleFav(TRACK);
  createPlaylist('p');
  off();
  toggleFav(TRACK);
  assert.equal(fired, 2);
});

test('slim tracks keep only storage fields', () => {
  backing.clear();
  toggleFav({ ...TRACK, junk: 'should-not-persist' });
  const fav = getFavs()[0];
  assert.equal(fav.junk, undefined);
  assert.equal(fav.id, 't1');
  assert.ok('url' in fav && 'image' in fav && 'duration' in fav);
});
