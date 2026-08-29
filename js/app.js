/** App shell: hash router, topbar search, sidebar library, now-playing sync. */
import * as player from './player.js';
import { onPlayer, toastMsg } from './player.js';
import * as store from './store.js';
import { esc, artistsLine } from './api.js';
import {
  viewHome, viewSearch, viewSearchResults, viewAlbum, viewPlaylist,
  viewArtist, viewGenre, viewGenres, viewLibrary, viewFavs, viewUserPlaylist,
} from './views.js';

const view = () => document.getElementById('view');

/* ---------------- router ---------------- */
const ROUTES = [
  [/^\/?$/, () => viewHome(), 'home'],
  [/^\/search\/?(?:\?(.*))?$/, (m) => { const q = new URLSearchParams(m[1] || '').get('q'); if (q) return viewSearchResults(q); return viewSearch(); }, 'search'],
  [/^\/album\/([^/]+)$/, (m) => viewAlbum(m[1])],
  [/^\/playlist\/([^/]+)$/, (m) => viewPlaylist(m[1])],
  [/^\/artist\/([^/]+)$/, (m) => viewArtist(m[1])],
  [/^\/genre\/([^/]+)$/, (m) => viewGenre(decodeURIComponent(m[1]))],
  [/^\/genres$/, () => viewGenres()],
  [/^\/library$/, () => viewLibrary(), 'library'],
  [/^\/favs$/, () => viewFavs(), 'library'],
  [/^\/userpl\/([^/]+)$/, (m) => viewUserPlaylist(m[1]), 'library'],
];

let searchDebounce;
function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  let matched = false;
  for (const [re, fn, nav] of ROUTES) {
    const m = hash.match(re);
    if (m) {
      matched = true;
      if (nav) setActiveNav(nav);
      fn(m);
      break;
    }
  }
  if (!matched) viewHome();
  view().scrollTop = 0;
}

function setActiveNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  renderSidebar();
}

/* ---------------- topbar search ---------------- */
const input = document.getElementById('search-input');
input.addEventListener('input', () => {
  document.getElementById('search-clear').hidden = !input.value;
  clearTimeout(searchDebounce);
  const q = input.value.trim();
  if (!q) {
    if (location.hash.startsWith('#/search')) location.hash = '#/search';
    return;
  }
  searchDebounce = setTimeout(() => { location.hash = `#/search?q=${encodeURIComponent(q)}`; }, 350);
});
document.getElementById('search-clear').addEventListener('click', () => {
  input.value = '';
  document.getElementById('search-clear').hidden = true;
  location.hash = '#/search';
  input.focus();
});
// keep input in sync when arriving at search view
addEventListener('hashchange', () => {
  const m = location.hash.match(/#\/search\?q=(.*)$/);
  if (m) {
    const q = decodeURIComponent(m[1]);
    if (input.value.trim() !== q) input.value = q;
  }
});

/* ---------------- back/forward ---------------- */
document.getElementById('btn-back').addEventListener('click', () => history.back());
document.getElementById('btn-fwd').addEventListener('click', () => history.forward());
addEventListener('hashchange', () => {
  document.getElementById('btn-fwd').classList.toggle('dim', false);
});

/* ---------------- sidebar library ---------------- */
function renderSidebar() {
  const box = document.getElementById('side-lists');
  if (!box) return;
  const favs = store.getFavs();
  const pls = store.getPlaylists();
  const hash = location.hash;
  const activeId = (hash.match(/^#\/userpl\/(.+)$/) || [])[1];
  box.innerHTML = `
    <div class="side-item ${hash === '#/favs' ? 'active' : ''}" data-go="#/favs">
      <div class="si-icon" style="background:linear-gradient(135deg,#1ed760,#0c6b32);color:#000"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.7-10-9.3C.3 8 2.3 4.5 5.7 4.5c2 0 3.4 1.1 4.3 2.3l2 2.6 2-2.6c.9-1.2 2.3-2.3 4.3-2.3 3.4 0 5.4 3.5 3.7 7.2C19.5 16.3 12 21 12 21z"/></svg></div>
      <div class="si-meta"><div class="si-title">Favorites</div><div class="si-sub">Playlist · ${favs.length} songs</div></div>
    </div>
    ${pls.map((p) => `
      <div class="side-item ${activeId === p.id ? 'active' : ''}" data-go="#/userpl/${p.id}">
        <img src="${esc(p.items?.[0]?.image || '/icons/favicon-64.png')}" alt="" loading="lazy" />
        <div class="si-meta"><div class="si-title">${esc(p.name)}</div><div class="si-sub">Playlist · ${p.items?.length || 0} songs</div></div>
      </div>`).join('')}`;
  box.querySelectorAll('[data-go]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.dataset.go; });
  });
}
store.onLibraryChange(renderSidebar);

document.getElementById('btn-new-playlist').addEventListener('click', () => {
  const name = prompt('Name your playlist', 'My Playlist #' + (store.getPlaylists().length + 1));
  if (name === null) return;
  const pl = store.createPlaylist(name || 'My Playlist');
  toastMsg(`Playlist "${pl.name}" created`);
  location.hash = `#/userpl/${pl.id}`;
});

/* ---------------- now-playing sync ---------------- */
const np = {
  art: document.getElementById('np-art'),
  title: document.getElementById('np-title'),
  sub: document.getElementById('np-sub'),
  like: document.getElementById('np-like'),
};

onPlayer(() => {
  const t = player.state.current;
  if (!t) return;
  np.art.src = t.image || '/icons/favicon-64.png';
  np.title.textContent = t.title;
  np.sub.textContent = artistsLine(t);
  np.like.classList.toggle('saved', store.isFav(t.id));
  // live queue drawer: re-render whenever player state changes and drawer is open
  if (!document.getElementById('queue-drawer').hidden) player.renderQueue();
});

/* ---------------- PWA install prompt ---------------- */
let installEvent;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  const btn = document.getElementById('install-btn');
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    installEvent.prompt();
    await installEvent.userChoice;
    btn.hidden = true;
  });
});

/* ---------------- boot ---------------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

if (!location.hash) location.hash = '#/home';
route();
addEventListener('hashchange', route);
