/** Views: all screens rendered into #view. Hash router in app.js calls these. */
import { api, tryApi, fmtTime, fmtPlays, artistsLine, esc } from './api.js';
import * as store from './store.js';
import * as player from './player.js';
import { toastMsg } from './player.js';

const view = () => document.getElementById('view');

/* ================================================== shared bits */

const SKEL_CARDS = (n = 5) => `<div class="grid">${Array.from({ length: n }, () => '<div class="card skeleton skel-card"></div>').join('')}</div>`;
const SKEL_ROWS = (n = 8) => `<div class="tracks">${Array.from({ length: n }, () => '<div class="skeleton skel-row" style="margin:6px 0"></div>').join('')}</div>`;
const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

export function card(entity) {
  const art = entity.image || '/icons/favicon-64.png';
  const round = entity.kind === 'artist';
  const sub = entity.kind === 'artist'
    ? (entity.role || 'Artist')
    : entity.kind === 'album'
      ? `${entity.year || ''} ${entity.language || ''}`.trim() || entity.subtitle || ''
      : entity.subtitle || '';
  return `
    <div class="card ${round ? 'round' : ''}" data-kind="${entity.kind}" data-id="${esc(entity.id ?? entity.title)}">
      <div class="card-img">
        <img src="${esc(art)}" alt="${esc(entity.title || entity.name)}" loading="lazy" />
        <div class="play-overlay">${PLAY_SVG}</div>
      </div>
      <div class="card-title">${esc(entity.title || entity.name)}</div>
      <div class="card-sub">${esc(sub)}</div>
    </div>`;
}

function section(title, cards, { moreHref = null } = {}) {
  if (!cards?.length) return '';
  return `
    <div class="section">
      <div class="section-head">
        <span class="section-title">${esc(title)}</span>
        ${moreHref ? `<a class="section-more" href="${moreHref}">Show all</a>` : ''}
      </div>
      <div class="grid">${cards.join('')}</div>
    </div>`;
}

/** Track list rows. */
export function trackRows(tracks, { context = '', removeMode = false } = {}) {
  return tracks.map((t, i) => {
    const playing = player.state.current?.id === t.id;
    const saved = store.isFav(t.id);
    const secondBtn = removeMode
      ? `<button class="icon-btn" data-act="remove" title="Remove from this playlist"><svg viewBox="0 0 24 24"><path d="M6 7h12v13H6V7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg></button>`
      : `<button class="icon-btn" data-act="add" title="Add to playlist"><svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/></svg></button>`;
    return `
    <div class="track-row ${playing ? 'playing' : ''}" data-i="${i}" data-context="${esc(context)}">
      <div class="tr-index">
        <span class="num">${i + 1}</span>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h2.5v14H8V5zm5.5 0H16v14h-2.5V5z" opacity=".4"/><path d="M8 5h2.5v14H8V5z"/><path d="M13.5 5H16v14h-2.5V5z" opacity=".7"/></svg>
      </div>
      <div class="tr-main">
        <img class="tr-art" src="${esc(t.image || '/icons/favicon-64.png')}" alt="" loading="lazy" />
        <div class="tr-meta">
          <div class="tr-title">${esc(t.title)}</div>
          <div class="tr-sub"><a href="#/artist/${esc(t.artists?.[0]?.id ?? '')}" data-stop="1">${esc(artistsLine(t))}</a></div>
        </div>
      </div>
      <div class="tr-album">${esc(t.album || '')}</div>
      <div class="tr-plays">${fmtPlays(t.playCount)}</div>
      <div class="tr-dur">${fmtTime(t.duration)}</div>
      <div class="tr-actions">
        <button class="icon-btn like ${saved ? 'saved' : ''}" data-act="fav" title="Save to Favorites"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.7-10-9.3C.3 8 2.3 4.5 5.7 4.5c2 0 3.4 1.1 4.3 2.3l2 2.6 2-2.6c.9-1.2 2.3-2.3 4.3-2.3 3.4 0 5.4 3.5 3.7 7.2C19.5 16.3 12 21 12 21z"/></svg></button>
        ${secondBtn}
      </div>
    </div>`;
  }).join('');
}

/** Wire track rows after render. */
export function wireTracks(root, tracks, { context = '', removeMode = false, onRemove = null } = {}) {
  root.querySelectorAll('.track-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-stop]')) return;
      if (e.target.closest('.tr-actions')) return;
      const i = Number(row.dataset.i);
      if (tracks[i]) player.playList(tracks, i, { radio: true });
    });
  });
  root.querySelectorAll('[data-act="fav"]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(e.target.closest('.track-row').dataset.i);
      const t = tracks[i];
      const added = store.toggleFav(t);
      b.classList.toggle('saved', added);
      toastMsg(added ? 'Added to Favorites' : 'Removed from Favorites');
    });
  });
  root.querySelectorAll('[data-act="add"]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(e.target.closest('.track-row').dataset.i);
      openPlaylistPicker(tracks[i]);
    });
  });
  if (removeMode) {
    root.querySelectorAll('[data-act="remove"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = Number(e.target.closest('.track-row').dataset.i);
        if (onRemove) onRemove(i);
      });
    });
  }
}

export function wireCards(root) {
  root.querySelectorAll('.card').forEach((c) => {
    if (c.dataset.instant || c.dataset.userpl || c.dataset.q) return;
    c.addEventListener('click', () => {
      const { kind, id } = c.dataset;
      if (kind === 'album') location.hash = `#/album/${id}`;
      else if (kind === 'playlist') location.hash = `#/playlist/${id}`;
      else if (kind === 'artist') location.hash = `#/artist/${id}`;
      else if (kind === 'genre') location.hash = `#/genre/${encodeURIComponent(id)}`;
    });
  });
}

/* ================================================== playlist picker modal */

export function openPlaylistPicker(track) {
  const pls = store.getPlaylists();
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="pp-backdrop" data-close="1">
      <div class="pp-modal">
        <div class="pp-head">Add to playlist</div>
        <div class="pp-new">
          <input id="pp-new-name" placeholder="New playlist name…" maxlength="60" />
          <button id="pp-create" class="pill-btn">Create</button>
        </div>
        <div class="pp-list">
          ${pls.length ? pls.map((p) => `
            <div class="pp-item" data-plid="${p.id}">
              <img src="${esc(p.items?.[0]?.image || '/icons/favicon-64.png')}" alt="" />
              <div class="pp-meta"><b>${esc(p.name)}</b><span>${p.items?.length || 0} songs</span></div>
              <svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/></svg>
            </div>`).join('') : '<div class="pp-empty">No playlists yet</div>'}
        </div>
      </div>
    </div>`;
  const back = wrap.firstElementChild;
  document.body.appendChild(back);
  back.addEventListener('click', (e) => { if (e.target.dataset.close) back.remove(); });
  const done = (msg) => { toastMsg(msg); back.remove(); };
  back.querySelector('#pp-create').addEventListener('click', () => {
    const nameEl = back.querySelector('#pp-new-name');
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); return; }
    const pl = store.createPlaylist(name);
    store.addToPlaylist(pl.id, track);
    done(`Added to "${pl.name}"`);
  });
  back.querySelectorAll('.pp-item').forEach((it) => {
    it.addEventListener('click', () => {
      const plid = it.dataset.plid;
      const added = store.addToPlaylist(plid, track);
      done(added ? `Added to "${store.getPlaylist(plid)?.name}"` : 'Already in playlist');
    });
  });
  setTimeout(() => back.querySelector('#pp-new-name')?.focus(), 30);
}

/* ================================================== HOME */

export async function viewHome() {
  const v = view();
  v.innerHTML = `
    <div class="view-head" style="padding-top:12px">
      <div class="vh-meta">
        <div class="vh-type">Good ${greet()} · Saket Music 18</div>
        <div class="vh-title">Music for every mood</div>
      </div>
    </div>
    <div id="home-sections">${SKEL_CARDS(6)}</div>`;

  const home = await tryApi('home') ?? { newAlbums: [], featuredPlaylists: [], charts: [], genres: [] };
  const el = document.getElementById('home-sections');
  if (!el) return;

  const recent = store.getRecents().slice(0, 12);
  const recentCards = recent.length
    ? `<div class="section"><div class="section-head"><span class="section-title">Recently played</span></div>
        <div class="grid">${recent.map((t) => trackCard(t)).join('')}</div></div>`
    : '';

  el.innerHTML = `
    ${recentCards}
    ${section('New releases', home.newAlbums.slice(0, 10).map((a) => card(a)))}
    ${section('Featured playlists', home.featuredPlaylists.slice(0, 10).map((p) => card(p)))}
    ${section('Charts', home.charts.slice(0, 10).map((p) => card(p)))}
    ${section('Browse genres', home.genres.slice(0, 12).map((g) => card({ ...g, id: g.title, kind: 'genre' })), { moreHref: '#/genres' })}`;

  wireInstant(el, recent);
  wireCards(el);
}

function wireInstant(root, tracks) {
  root.querySelectorAll('[data-instant]').forEach((c) => {
    c.addEventListener('click', () => {
      const t = tracks.find((x) => x.id === c.dataset.instant);
      if (t) player.playList([t], 0, { radio: true });
    });
  });
}

function greet() {
  const h = new Date().getHours();
  return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
}

function trackCard(t) {
  return `
    <div class="card" data-instant="${esc(t.id)}">
      <div class="card-img">
        <img src="${esc(t.image || '/icons/favicon-64.png')}" alt="" loading="lazy" />
        <div class="play-overlay">${PLAY_SVG}</div>
      </div>
      <div class="card-title">${esc(t.title)}</div>
      <div class="card-sub">${esc(artistsLine(t))}</div>
    </div>`;
}

/* ================================================== SEARCH */

export async function viewSearch() {
  const v = view();
  const [tops, home] = await Promise.all([tryApi('topSearches'), tryApi('home')]);
  v.innerHTML = `
    <div class="view-head" style="padding-top:12px">
      <div class="vh-meta"><div class="vh-type">Search</div><div class="vh-title">Find any song</div></div>
    </div>
    ${tops?.names?.length ? `
    <div class="section"><div class="section-head"><span class="section-title">Trending searches</span></div>
      <div class="grid">${tops.names.map((n) => `
        <div class="card genre" data-q="${esc(n)}">
          <div class="card-img"><img src="${esc(genreArt(n))}" alt="" loading="lazy" /></div>
          <div class="card-title">${esc(n)}</div>
        </div>`).join('')}
      </div>
    </div>` : ''}
    <div class="section">
      <div class="section-head"><span class="section-title">Browse genres</span></div>
      <div class="grid">${(home?.genres ?? []).slice(0, 12).map((g) => card({ ...g, id: g.title, kind: 'genre' })).join('')}</div>
    </div>`;
  v.querySelectorAll('[data-q]').forEach((c) => {
    c.addEventListener('click', () => {
      const input = document.getElementById('search-input');
      input.value = c.dataset.q;
      input.dispatchEvent(new Event('input'));
    });
  });
  wireCards(v);
}

function genreArt(name) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const label = esc(String(name)).slice(0, 12).replace(/[<>&"]/g, '');
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="hsl(${h},52%,26%)"/><text x="150" y="160" font-size="30" font-family="sans-serif" fill="white" text-anchor="middle" font-weight="700">${label}</text></svg>`)}`;
}

/* ================================================== SEARCH RESULTS */

export async function viewSearchResults(q) {
  const v = view();
  v.innerHTML = `<div class="section"><div class="section-title">Results for “${esc(q)}”</div></div>${SKEL_CARDS(6)}`;
  const res = await tryApi('search', { query: q, type: 'all' }) ?? { songs: [], albums: [], artists: [], playlists: [] };
  if (!document.getElementById('view')) return;
  const songs = res.songs || [];
  const total = songs.length + (res.albums?.length || 0) + (res.artists?.length || 0) + (res.playlists?.length || 0);
  v.innerHTML = `
    <div class="view-head" style="padding-top:12px">
      <div class="vh-meta">
        <div class="vh-type">Search</div>
        <div class="vh-title">${esc(q)}</div>
        <div class="vh-sub">${total ? `${songs.length} songs · ${res.albums?.length || 0} albums · ${res.artists?.length || 0} artists · ${res.playlists?.length || 0} playlists` : ''}</div>
      </div>
    </div>
    ${songs.length ? `
    <div class="section">
      <div class="section-head"><span class="section-title">Songs</span></div>
      <div class="tracks">${trackRows(songs.slice(0, 10), { context: 'search' })}</div>
    </div>` : ''}
    ${section('Albums', (res.albums ?? []).slice(0, 12).map((a) => card(a)))}
    ${section('Artists', (res.artists ?? []).slice(0, 12).map((a) => card(a)))}
    ${section('Playlists', (res.playlists ?? []).slice(0, 12).map((p) => card(p)))}
    ${!total ? `<div class="empty"><div class="big">🔍</div><h3>Nothing found</h3><p>Try a different spelling or search in Hindi.</p></div>` : ''}`;
  wireTracks(v, songs.slice(0, 10), { context: 'search' });
  wireCards(v);
}

/* ================================================== header helper */

function detailHeader({ type, title, art, round = false, sub, actionsHtml }) {
  return `
    <div class="view-head">
      ${art ? `<img class="vh-art ${round ? 'round' : ''}" src="${esc(art)}" alt="" />` : ''}
      <div class="vh-meta">
        <div class="vh-type">${esc(type)}</div>
        <div class="vh-title">${esc(title)}</div>
        ${sub ? `<div class="vh-sub">${sub}</div>` : ''}
      </div>
    </div>
    <div class="vh-actions">
      <button class="big-play" data-act="playall">${PLAY_SVG}</button>
      ${actionsHtml || ''}
    </div>`;
}

/* ================================================== ALBUM */

export async function viewAlbum(id) {
  const v = view();
  v.innerHTML = SKEL_ROWS(8);
  const a = await tryApi('album', { id });
  if (!a) return notFound('Album');
  v.innerHTML = detailHeader({
    type: 'Album', title: a.title, art: a.image,
    sub: `${esc(artistsLine({ artists: a.artists }))}${a.year ? ' · ' + esc(a.year) : ''}${a.language ? ' · ' + esc(a.language) : ''} · ${a.songs?.length || 0} songs`,
  }) + `<div class="tracks">${trackRows(a.songs, { context: 'album:' + id })}</div>`;
  wireTracks(v, a.songs, { context: 'album:' + id });
  v.querySelector('[data-act="playall"]').addEventListener('click', () => player.playList(a.songs, 0, { radio: true }));
}

/* ================================================== PLAYLIST */

export async function viewPlaylist(id) {
  const v = view();
  v.innerHTML = SKEL_ROWS(8);
  const p = await tryApi('playlist', { id });
  if (!p) return notFound('Playlist');
  v.innerHTML = detailHeader({
    type: 'Playlist', title: p.title, art: p.image,
    sub: `${esc(p.subtitle || '')} · ${p.songs?.length || 0} songs`,
  }) + `<div class="tracks">${trackRows(p.songs, { context: 'playlist:' + id })}</div>`;
  wireTracks(v, p.songs, { context: 'playlist:' + id });
  v.querySelector('[data-act="playall"]').addEventListener('click', () => player.playList(p.songs, 0, { radio: true }));
}

/* ================================================== ARTIST */

export async function viewArtist(id) {
  const v = view();
  v.innerHTML = SKEL_ROWS(6);
  const a = await tryApi('artist', { id });
  if (!a) return notFound('Artist');
  const popular = a.topSongs ?? [];
  v.innerHTML = detailHeader({
    type: a.isVerified ? '✓ Verified Artist' : 'Artist', title: a.name, art: a.image, round: true,
    sub: `${fmtPlays(a.followers)} followers`,
  }) + `
    <div class="section"><div class="section-head"><span class="section-title">Popular</span></div>
      <div class="tracks">${trackRows(popular.slice(0, 10), { context: 'artist:' + id })}</div></div>
    ${section('Albums', (a.albums ?? []).slice(0, 12).map((al) => card(al)))}
    ${section('Fans also like', (a.similar ?? []).slice(0, 12).map((ar) => card(ar)))}`;
  wireTracks(v, popular, { context: 'artist:' + id });
  wireCards(v);
  v.querySelector('[data-act="playall"]').addEventListener('click', () => player.playList(popular, 0, { radio: true }));
}

/* ================================================== GENRE */

export async function viewGenre(tag) {
  const v = view();
  v.innerHTML = SKEL_CARDS(6);
  const res = await tryApi('search', { query: tag, type: 'playlists' });
  const pls = res?.playlists ?? [];
  v.innerHTML = `
    <div class="view-head" style="padding-top:12px">
      <div class="vh-meta"><div class="vh-type">Genre</div><div class="vh-title">${esc(tag)}</div>
      <div class="vh-sub">Curated playlists tagged “${esc(tag)}”</div></div>
    </div>
    ${section('Playlists', pls.slice(0, 18).map((p) => card(p)))}
    ${!pls.length ? `<div class="empty"><div class="big">🎧</div><h3>No playlists found</h3><p>Try another genre from Home.</p></div>` : ''}`;
  wireCards(v);
}

/* ================================================== ALL GENRES */

export async function viewGenres() {
  const v = view();
  const home = await tryApi('home');
  const genres = home?.genres ?? [];
  v.innerHTML = `
    <div class="view-head" style="padding-top:12px">
      <div class="vh-meta"><div class="vh-type">Browse</div><div class="vh-title">Genres</div></div>
    </div>
    ${section('All genres', genres.map((g) => card({ ...g, id: g.title, kind: 'genre' })))}`;
  wireCards(v);
}

/* ================================================== LIBRARY */

export async function viewLibrary() {
  const v = view();
  const favs = store.getFavs();
  const pls = store.getPlaylists();
  const recents = store.getRecents().slice(0, 20);
  v.innerHTML = `
    <div class="view-head" style="padding-top:12px">
      <div class="vh-meta"><div class="vh-type">Your Library</div><div class="vh-title">Saved & playlists</div></div>
    </div>
    ${section('Favorites', favs.slice(0, 12).map((t) => trackCard(t)), { moreHref: favs.length ? '#/favs' : null })}
    ${section('Your playlists', pls.map((p) => userPlaylistCard(p)))}
    ${section('Recently played', recents.map((t) => trackCard(t)))}
    ${!favs.length && !pls.length && !recents.length ? `<div class="empty"><div class="big">📚</div><h3>Nothing here yet</h3><p>Tap the ♥ on any song to save it, or create a playlist from the sidebar.</p></div>` : ''}`;

  wireInstant(v, [...favs, ...recents]);
  v.querySelectorAll('[data-userpl]').forEach((c) => {
    c.addEventListener('click', () => { location.hash = `#/userpl/${c.dataset.userpl}`; });
  });
}

function userPlaylistCard(p) {
  return `
    <div class="card" data-userpl="${p.id}">
      <div class="card-img">
        <img src="${esc(p.items?.[0]?.image || '/icons/favicon-64.png')}" alt="" loading="lazy" />
        <div class="play-overlay">${PLAY_SVG}</div>
      </div>
      <div class="card-title">${esc(p.name)}</div>
      <div class="card-sub">${p.items?.length || 0} songs</div>
    </div>`;
}

/* ================================================== FAVORITES */

export async function viewFavs() {
  const v = view();
  const favs = store.getFavs();
  v.innerHTML = `
    <div class="view-head">
      <div class="vh-art" style="background:linear-gradient(135deg,#1ed760,#0c6b32);display:grid;place-items:center;font-size:3.4rem">♥</div>
      <div class="vh-meta">
        <div class="vh-type">Playlist</div>
        <div class="vh-title">Favorites</div>
        <div class="vh-sub">${favs.length} songs</div>
      </div>
    </div>
    <div class="vh-actions"><button class="big-play" data-playall="1">${PLAY_SVG}</button></div>
    ${favs.length ? `<div class="tracks">${trackRows(favs, { context: 'favs' })}</div>`
      : `<div class="empty"><div class="big">♥</div><h3>No favorites yet</h3><p>Tap the heart on any song.</p></div>`}`;
  wireTracks(v, favs, { context: 'favs' });
  v.querySelector('[data-playall]').addEventListener('click', () => player.playList(favs, 0, { radio: true }));
}

/* ================================================== USER PLAYLIST detail */

export async function viewUserPlaylist(plid) {
  const v = view();
  const pl = store.getPlaylist(plid);
  if (!pl) return notFound('Playlist');
  const render = () => {
    const cur = store.getPlaylist(plid);
    v.innerHTML = detailHeader({
      type: 'Playlist', title: cur.name, art: cur.items?.[0]?.image || '/icons/favicon-64.png',
      sub: `${cur.items.length} songs · made by you`,
      actionsHtml: `
        <button class="icon-btn" data-rename="1" title="Rename"><svg viewBox="0 0 24 24"><path d="M3 17.2V21h3.8L18 9.8 14.2 6 3 17.2zM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.8-1.8z"/></svg></button>
        <button class="icon-btn" data-delete="1" title="Delete playlist"><svg viewBox="0 0 24 24"><path d="M6 7h12v13H6V7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg></button>`,
    }) + `
      <div class="tracks">${trackRows(cur.items, { context: 'pl:' + plid, removeMode: true })}</div>
      ${!cur.items.length ? `<div class="empty"><div class="big">➕</div><h3>Empty playlist</h3><p>Use the ＋ button on any song row to add songs.</p></div>` : ''}`;
    wireTracks(v, cur.items, {
      context: 'pl:' + plid,
      removeMode: true,
      onRemove: (i) => {
        store.removeFromPlaylist(plid, cur.items[i].id);
        toastMsg('Removed from playlist');
        render();
      },
    });
    v.querySelector('[data-act="playall"]').addEventListener('click', () => player.playList(cur.items, 0, { radio: false }));
    v.querySelector('[data-rename]').addEventListener('click', () => {
      const name = prompt('Rename playlist', cur.name);
      if (name && name.trim()) { store.renamePlaylist(plid, name); toastMsg('Renamed'); render(); }
    });
    v.querySelector('[data-delete]').addEventListener('click', () => {
      if (confirm(`Delete "${cur.name}"?`)) { store.deletePlaylist(plid); toastMsg('Playlist deleted'); location.hash = '#/library'; }
    });
  };
  render();
}

/* ================================================== not found */

function notFound(what) {
  view().innerHTML = `<div class="empty"><div class="big">🎵</div><h3>${esc(what)} not found</h3><p>It may have been removed upstream.</p></div>`;
}
