/** Local library: favorites, playlists, recents — persisted in localStorage. */

const K = {
  favs: 'sm18:favs',
  playlists: 'sm18:playlists',
  recents: 'sm18:recents',
  settings: 'sm18:settings',
};

const listeners = new Set();
export const onLibraryChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ }
  emit();
};

/** Slim serializable form of a track for storage. */
export const slim = (t) => t && {
  id: t.id, title: t.title, artists: t.artists, album: t.album, albumId: t.albumId,
  year: t.year, language: t.language, image: t.image, duration: t.duration,
  url: t.url, url96: t.url96, has320: t.has320, playCount: t.playCount,
};

/* ---------------- favorites ---------------- */
export const getFavs = () => read(K.favs, []);
export const isFav = (id) => getFavs().some((t) => t.id === id);
export function toggleFav(track) {
  const favs = getFavs();
  const i = favs.findIndex((t) => t.id === track.id);
  if (i >= 0) { favs.splice(i, 1); write(K.favs, favs); return false; }
  favs.unshift(slim(track)); write(K.favs, favs.slice(0, 2000)); return true;
}

/* ---------------- playlists ---------------- */
export const getPlaylists = () => read(K.playlists, []);
export function createPlaylist(name) {
  const pls = getPlaylists();
  const pl = { id: 'pl_' + Date.now().toString(36), name: name.trim() || 'New Playlist', items: [], createdAt: Date.now() };
  pls.unshift(pl); write(K.playlists, pls);
  return pl;
}
export function deletePlaylist(plid) {
  write(K.playlists, getPlaylists().filter((p) => p.id !== plid));
}
export function renamePlaylist(plid, name) {
  const pls = getPlaylists();
  const pl = pls.find((p) => p.id === plid);
  if (pl) { pl.name = name.trim() || pl.name; write(K.playlists, pls); }
}
export function getPlaylist(plid) { return getPlaylists().find((p) => p.id === plid); }
export function playlistHas(plid, trackId) { return !!getPlaylist(plid)?.items?.some((t) => t.id === trackId); }
export function addToPlaylist(plid, track) {
  const pls = getPlaylists();
  const pl = pls.find((p) => p.id === plid);
  if (!pl) return false;
  if (pl.items.some((t) => t.id === track.id)) return false;
  pl.items.push(slim(track));
  write(K.playlists, pls);
  return true;
}
export function removeFromPlaylist(plid, trackId) {
  const pls = getPlaylists();
  const pl = pls.find((p) => p.id === plid);
  if (!pl) return;
  pl.items = pl.items.filter((t) => t.id !== trackId);
  write(K.playlists, pls);
}

/* ---------------- recents ---------------- */
export const getRecents = () => read(K.recents, []);
export function pushRecent(track) {
  let r = getRecents().filter((t) => t.id !== track.id);
  r.unshift(slim(track));
  write(K.recents, r.slice(0, 100));
}

/* ---------------- settings ---------------- */
const defSettings = { volume: 1, shuffle: false, repeat: 'off' };
export const getSettings = () => ({ ...defSettings, ...read(K.settings, {}) });
export const setSetting = (k, v) => { write(K.settings, { ...getSettings(), [k]: v }); };
