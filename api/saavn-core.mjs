/**
 * Saket Music 18 — JioSaavn core library.
 *
 * Single source of truth for talking to the public JioSaavn web API and
 * normalizing its many response shapes into clean models. Used by:
 *   - api/saavn.js        (Vercel serverless function)
 *   - scripts/dev.mjs     (local dev server)
 *   - tests/*.mjs         (unit tests with fixtures + live integration)
 *
 * Every exported op returns plain JSON-safe objects. All media URLs are
 * decrypted server-side so the browser never deals with ciphertext.
 */
import CryptoJS from 'crypto-js';

const UPSTREAMS = ['https://www.jiosaavn.com/api.php'];
const DES_KEY = CryptoJS.enc.Utf8.parse('38346591');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TIMEOUT_MS = 10000;

export class SaavnError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'SaavnError';
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** DES-ECB decrypt of an encrypted_media_url -> https mp4 URL. */
export function decryptUrl(enc) {
  if (!enc || typeof enc !== 'string') return null;
  try {
    const bytes = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(enc) },
      DES_KEY,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
    );
    const url = bytes.toString(CryptoJS.enc.Utf8);
    if (!/^https?:\/\//.test(url)) return null;
    return url.replace(/^http:\/\//, 'https://');
  } catch {
    return null;
  }
}

/** Swap quality on a saavncdn URL: _96. -> _320. */
export function qualityUrl(url, quality) {
  if (!url) return null;
  return url.includes('_96.') ? url.replace('_96.', `_${quality}.`) : url;
}

/** Produce {50,150,500} variants from any saavncdn artwork URL. */
export function imageVariants(url) {
  if (!url || typeof url !== 'string') return { 50: null, 150: null, 500: null };
  const https = url.replace(/^http:\/\//, 'https://');
  const make = (size) => https.replace(/(\d+x\d+)/, size);
  return { 50: make('50x50'), 150: make('150x150'), 500: make('500x500') };
}

const ENTITIES = {
  amp: '&', quot: '"', lt: '<', gt: '>', apos: "'", nbsp: ' ', hellip: '…',
  mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

/** Decode HTML entities the API leaves inside titles (&quot; etc). */
export function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .trim();
}

/** `more_info` arrives stringified in search results; parse defensively. */
function moreInfo(item) {
  const raw = item?.more_info ?? item?.moreInfo;
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

/** Build artist list from artistMap when present, else split name strings. */
function artistsFrom(item, mi) {
  const map = item?.artistMap ?? mi.artistMap;
  if (map?.primary_artists?.length) {
    const out = map.primary_artists.map((a) => ({ id: a.id || null, name: decodeEntities(a.name) }));
    if (map.featured_artists?.length) {
      for (const a of map.featured_artists) {
        if (!out.some((o) => o.name === a.name)) out.push({ id: a.id || null, name: decodeEntities(a.name) });
      }
    }
    return out.filter((a) => a.name);
  }
  const names = (item?.primary_artists || item?.singers || mi.artist || '') + '';
  const out = names.split(',').map((n) => decodeEntities(n)).filter(Boolean).map((name) => ({ id: null, name }));
  return out.length ? out : [{ id: null, name: 'Unknown Artist' }];
}

const LANG = {
  hindi: 'Hindi', english: 'English', punjabi: 'Punjabi', tamil: 'Tamil', telugu: 'Telugu',
  marathi: 'Marathi', gujarati: 'Gujarati', bengali: 'Bengali', kannada: 'Kannada',
  malayalam: 'Malayalam', bhojpuri: 'Bhojpuri', urdu: 'Urdu', odia: 'Odia', assamese: 'Assamese',
  nepali: 'Nepali', english_hindi: 'Eng & Hindi', instrumental: 'Instrumental',
};
export const langName = (code) => {
  const c = String(code || '').toLowerCase();
  if (!c) return '';
  return LANG[c] || decodeEntities(code) || '';
};

function toInt(v, fallback = 0) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback; }

/* ------------------------------------------------------------------ */
/* normalizers — one clean model per entity                            */
/* ------------------------------------------------------------------ */

/**
 * Accepts all three song shapes:
 *  a) search.getResults items   (title/image top-level, more_info string)
 *  b) song.getDetails values    (song field, encrypted_media_url top-level)
 *  c) album/playlist/artist song lists (same as b)
 */
export function normalizeTrack(item) {
  if (!item) return null;
  const mi = moreInfo(item);
  const id = item.id ?? item.object_id ?? null;
  if (!id) return null;

  const enc = item.encrypted_media_url || mi.encrypted_media_url;
  const url96 = decryptUrl(enc);
  const has320 = String(item['320kbps'] ?? mi['320kbps'] ?? 'false') === 'true' || (url96 && String(item['320kbps'] ?? '') === '1');
  const url320 = has320 ? qualityUrl(url96, 320) : null;
  const images = imageVariants(item.image || mi.album?.image);

  return {
    kind: 'track',
    id: String(id),
    title: decodeEntities(item.title || item.song),
    artists: artistsFrom(item, mi),
    album: decodeEntities(item.album || mi.album || ''),
    albumId: String(item.albumid || mi.album_id || item.entity_id || '') || null,
    year: String(item.year || mi.year || '') || null,
    language: langName(item.language || mi.language),
    image: images[500] || images[150],
    images,
    duration: toInt(item.duration || mi.duration),
    has320,
    url: url320 || url96,
    url96,
    playCount: toInt(item.play_count ?? mi.play_count ?? 0),
    hasLyrics: String(mi.has_lyrics ?? item.has_lyrics ?? '0') === '1' || mi.has_lyrics === 'true',
    explicit: String(item.explicit_content ?? mi.explicit_content ?? '0') !== '0',
  };
}

export function normalizeAlbum(item) {
  if (!item) return null;
  const mi = moreInfo(item);
  const images = imageVariants(item.image);
  return {
    kind: 'album',
    id: String(item.id ?? item.albumid ?? ''),
    title: decodeEntities(item.title || item.name || item.song),
    subtitle: decodeEntities(item.subtitle || item.description || ''),
    artists: artistsFrom(item, mi),
    year: String(item.year || mi.year || '') || null,
    language: langName(item.language || mi.language),
    image: images[500] || images[150],
    images,
    songCount: toInt(mi.song_count ?? item.song_count ?? item.list_count, 0),
    permaUrl: item.perma_url || item.url || null,
    explicit: String(item.explicit_content ?? '0') !== '0',
  };
}

export function normalizePlaylist(item) {
  if (!item) return null;
  const mi = moreInfo(item);
  const images = imageVariants(item.image);
  return {
    kind: 'playlist',
    id: String(item.id ?? item.listid ?? ''),
    title: decodeEntities(item.title || item.name || ''),
    subtitle: decodeEntities(item.subtitle || item.description || (mi.firstname ? `By ${decodeEntities(mi.firstname)}` : '')),
    image: images[500] || images[150],
    images,
    songCount: toInt(mi.song_count ?? item.list_count ?? item.list_count, 0),
    language: langName(item.language),
    permaUrl: item.perma_url || item.url || null,
  };
}

export function normalizeArtist(item) {
  if (!item) return null;
  const mi = moreInfo(item);
  const images = imageVariants(item.image);
  return {
    kind: 'artist',
    id: String(item.id ?? item.entity_id ?? ''),
    name: decodeEntities(item.title || item.name || ''),
    role: decodeEntities(item.subtitle || mi.dominantType || 'Artist'),
    image: images[500] || images[150],
    images,
    followers: toInt(mi.follower_count ?? item.follower_count, 0),
    isVerified: !!(mi.isVerified || item.isVerified),
    permaUrl: item.perma_url || item.url || null,
  };
}

export function normalizeGenre(item) {
  if (!item) return null;
  return {
    kind: 'genre',
    title: decodeEntities(item.title || item.tags || ''),
    tag: decodeEntities(item.tags || item.title || ''),
    image: (item.image || '').replace(/^http:\/\//, 'https://'),
  };
}

/* ------------------------------------------------------------------ */
/* upstream fetch                                                      */
/* ------------------------------------------------------------------ */

async function callUpstream(call, params = {}, attempt = 0) {
  const base = UPSTREAMS[attempt % UPSTREAMS.length];
  const u = new URL(base);
  const qs = {
    __call: call, _format: 'json', _marker: 0, cc: 'in', includeMetaTags: 1,
    ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)),
  };
  for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, String(v));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal });
    if (!res.ok) throw new SaavnError(`upstream ${res.status}`, 502);
    const json = await res.json();
    if (json && typeof json === 'object' && json.error) {
      throw new SaavnError(json.error.msg || 'upstream error', 502);
    }
    return json;
  } catch (e) {
    if (e instanceof SaavnError) throw e;
    if (attempt + 1 < UPSTREAMS.length * 2) return callUpstream(call, params, attempt + 1);
    throw new SaavnError(`upstream unreachable: ${e.message}`, 504);
  } finally {
    clearTimeout(timer);
  }
}

const songsOf = (j) => j?.songs ?? [];
const firstSong = (arr) => arr?.find((x) => x?.type === 'song') ?? arr?.[0];

/* ------------------------------------------------------------------ */
/* public ops                                                          */
/* ------------------------------------------------------------------ */

async function opHome() {
  const j = await callUpstream('content.getHomepageData', { api_version: 4, ctx: 'web3dot0' });
  return {
    newAlbums: (j.new_albums ?? []).map(normalizeAlbum).filter(Boolean),
    featuredPlaylists: (j.featured_playlists ?? []).map(normalizePlaylist).filter(Boolean),
    charts: (j.charts ?? []).map(normalizePlaylist).filter(Boolean),
    genres: (j.genres ?? []).map(normalizeGenre).filter(Boolean),
  };
}

async function opSearch({ query, type = 'all', page = 0, n = 30 }) {
  if (!query) throw new SaavnError('query required', 400);
  const p = { q: query, page: Number(page), n: Number(n), api_version: 4 };
  const out = { songs: [], albums: [], artists: [], playlists: [] };
  const want = type === 'all' ? ['songs', 'albums', 'artists', 'playlists'] : [type];
  const tasks = [];
  const calls = {
    songs: () => callUpstream('search.getResults', p).then((j) => {
      out.songs = (j.results ?? []).filter((x) => x?.type === 'song').map(normalizeTrack).filter(Boolean);
    }),
    albums: () => callUpstream('search.getAlbumResults', p).then((j) => {
      out.albums = (j.results ?? []).filter((x) => x?.type === 'album').map(normalizeAlbum).filter(Boolean);
    }),
    artists: () => callUpstream('search.getArtistResults', p).then((j) => {
      out.artists = (j.results ?? []).filter((x) => x?.type === 'artist').map(normalizeArtist).filter(Boolean);
    }),
    playlists: () => callUpstream('search.getPlaylistResults', p).then((j) => {
      out.playlists = (j.results ?? []).filter((x) => x?.type === 'playlist').map(normalizePlaylist).filter(Boolean);
    }),
  };
  for (const t of want) tasks.push(calls[t]().catch(() => {}));
  await Promise.all(tasks);
  return out;
}

async function opSong({ id }) {
  if (!id) throw new SaavnError('id required', 400);
  const j = await callUpstream('song.getDetails', { pids: id });
  const raw = j?.[id] ?? Object.values(j ?? {})[0];
  const track = normalizeTrack(raw);
  if (!track) throw new SaavnError('song not found', 404);
  return track;
}

async function opAlbum({ id }) {
  if (!id) throw new SaavnError('id required', 400);
  const j = await callUpstream('content.getAlbumDetails', { albumid: id });
  const songs = songsOf(j).map(normalizeTrack).filter(Boolean);
  const mi = moreInfo(j);
  return {
    ...normalizeAlbum({ ...j, image: j.image, more_info: { ...mi, song_count: songs.length } }),
    artists: artistsFrom(j, mi),
    songs,
  };
}

async function opPlaylist({ id }) {
  if (!id) throw new SaavnError('id required', 400);
  const j = await callUpstream('playlist.getDetails', { listid: id });
  const songs = songsOf(j).map(normalizeTrack).filter(Boolean);
  const mi = moreInfo(j);
  return {
    ...normalizePlaylist({ ...j, more_info: { ...mi, song_count: songs.length || toInt(j.list_count) } }),
    songs,
  };
}

async function opArtist({ id }) {
  if (!id) throw new SaavnError('id required', 400);
  const j = await callUpstream('artist.getArtistPageDetails', { artistId: id, page: 0, n_song: 50, n_album: 30 });
  const mi = moreInfo(j);
  const head = normalizeArtist({ ...j, more_info: mi });
  return {
    ...head,
    topSongs: (j.topSongs?.songs ?? []).map(normalizeTrack).filter(Boolean),
    albums: (j.topAlbums?.albums ?? []).map(normalizeAlbum).filter(Boolean),
    similar: (j.similarArtists ?? []).map(normalizeArtist).filter(Boolean).slice(0, 12),
  };
}

/**
 * Radio / autoplay: given the current track, produce more playable tracks.
 * Chain: song reco -> album reco songs -> artist top songs. Never empty-ish.
 */
async function opReco({ id, albumId, artistId, exclude = [] }) {
  const excluded = (Array.isArray(exclude) ? exclude : String(exclude).split(',')).map(String).filter(Boolean);
  const seen = new Set(excluded);
  const take = (tracks, limit = 24) => {
    const out = [];
    for (const t of tracks) {
      if (!t?.url || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= limit) break;
    }
    return out;
  };

  // 1) song-based recommendations
  if (id) {
    try {
      const j = await callUpstream('reco.getreco', { pid: id });
      const list = Array.isArray(j) ? j : Object.values(j ?? {})[0] ?? [];
      const tracks = take(list.map(normalizeTrack).filter(Boolean));
      if (tracks.length >= 5) return { source: 'song-reco', tracks };
    } catch { /* fall through */ }
  }

  // 2) album-based recommendations
  if (albumId) {
    try {
      const j = await callUpstream('reco.getAlbumReco', { albumid: albumId });
      const albums = (Array.isArray(j) ? j : []).map((a) => a?.id).filter(Boolean).slice(0, 8);
      const batches = await Promise.all(albums.map((aid) => opAlbum({ id: aid }).catch(() => null)));
      const merged = batches.flatMap((b) => b?.songs ?? []);
      const tracks = take(merged);
      if (tracks.length >= 5) return { source: 'album-reco', tracks };
    } catch { /* fall through */ }
  }

  // 3) artist top songs
  if (artistId) {
    try {
      const j = await callUpstream('artist.getArtistPageDetails', { artistId, page: 0, n_song: 50, n_album: 0 });
      const tracks = take((j.topSongs?.songs ?? []).map(normalizeTrack).filter(Boolean));
      if (tracks.length) return { source: 'artist', tracks };
    } catch { /* fall through */ }
  }
  return { source: 'none', tracks: [] };
}

async function opTopSearches() {
  const j = await callUpstream('content.getTopSearches', { api_version: 4 });
  const names = (Array.isArray(j) ? j : []).map((s) => decodeEntities(typeof s === 'string' ? s : s?.title)).filter(Boolean);
  return { names: names.slice(0, 12) };
}

const OPS = {
  home: opHome, search: opSearch, song: opSong, album: opAlbum,
  playlist: opPlaylist, artist: opArtist, reco: opReco, topSearches: opTopSearches,
};

/** Cache lifetimes per op (edge + browser), in seconds. */
export const OP_CACHE = {
  home: 3600, search: 120, song: 3600, album: 3600, playlist: 3600,
  artist: 3600, reco: 1800, topSearches: 1800,
};

/**
 * Run an op: saavn('search', { query: 'kesariya', type: 'songs' }).
 * Returns the normalized payload. Throws SaavnError on failure.
 */
export async function saavn(op, params = {}) {
  const fn = OPS[op];
  if (!fn) throw new SaavnError(`unknown op '${op}'`, 400);
  return fn(params);
}
