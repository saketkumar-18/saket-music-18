/** Player engine: audio element, queue, shuffle/repeat, autoplay radio, MediaSession. */
import { api, tryApi, fmtTime, artistsLine, esc } from './api.js';
import * as store from './store.js';

/* ------------ state ------------ */
const audio = document.getElementById('audio');
const els = {
  art: document.getElementById('np-art'),
  title: document.getElementById('np-title'),
  sub: document.getElementById('np-sub'),
  like: document.getElementById('np-like'),
  play: document.getElementById('pl-play'),
  prev: document.getElementById('pl-prev'),
  next: document.getElementById('pl-next'),
  shuffle: document.getElementById('pl-shuffle'),
  repeat: document.getElementById('pl-repeat'),
  queue: document.getElementById('pl-queue'),
  vol: document.getElementById('pl-vol'),
  volume: document.getElementById('vol'),
  cur: document.getElementById('np-cur'),
  dur: document.getElementById('np-dur'),
  seek: document.getElementById('seek'),
  seekFill: document.getElementById('seek-fill'),
  seekKnob: document.getElementById('seek-knob'),
};

export const state = {
  queue: [],          // manual + context-order upcoming (after current)
  reco: [],           // recommended tail (not yet in queue) — Spotify "Autoplay"
  history: [],        // played before current (for prev)
  current: null,      // track object
  index: -1,          // index within original list
  list: [],           // original play context (for repeat-all / shuffle / drawer)
  contextName: '',    // e.g. album/playlist name for the queue drawer
  shuffle: false,
  repeat: 'off',      // off | all | one
  loading: false,
  radio: true,        // autoplay enabled (Spotify default)
  radioBusy: false,
};

const listeners = new Set();
export const onPlayer = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(state));

/* ------------ persistence-backed settings ------------ */
(() => {
  const s = store.getSettings();
  state.shuffle = !!s.shuffle;
  state.repeat = s.repeat || 'off';
  audio.volume = Number.isFinite(s.volume) ? s.volume : 1;
})();

/* ------------ helpers ------------ */
const saveShuffle = () => store.setSetting('shuffle', state.shuffle);
const saveRepeat = () => store.setSetting('repeat', state.repeat);

const topUpHistory = (track) => { if (track) { state.history.push(track); if (state.history.length > 100) state.history.shift(); } };

function shuffleRest(list, currentIndex) {
  const rest = list.map((t, i) => (i === currentIndex ? null : t)).filter(Boolean);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return rest;
}

/* ------------ queue mgmt ------------ */

/**
 * Play a list of tracks at position. `contextName` labels the queue drawer
 * section ("Next from: …"). When radio is on, recommendations are prefetched
 * immediately so they show in the queue right away (Spotify behavior).
 */
export function playList(tracks, startIndex = 0, { radio = true, contextName = '' } = {}) {
  const list = tracks.filter((t) => t && t.id);
  if (!list.length) return;
  state.list = list;
  state.contextName = contextName || 'this playlist';
  state.index = Math.max(0, Math.min(startIndex, list.length - 1));
  state.queue = [];
  state.reco = [];
  state.history = [];
  state.radio = radio;
  if (state.shuffle) state.queue = shuffleRest(list, state.index).map((t) => ({ ...t, seeded: true }));
  loadCurrent();
  if (state.radio) fetchRecos(); // prefetch — shows in queue drawer immediately
}

/** Insert track as next up (after current). */
export function playNext(track) {
  if (!track?.id || state.current?.id === track.id) return;
  state.queue.unshift({ ...track, manual: true });
  toastMsg('Playing next');
  emit();
}

/** Append to end of queue. */
export function queueAdd(track) {
  if (!track?.id || state.current?.id === track.id) return;
  state.queue.push({ ...track, manual: true });
  toastMsg('Added to queue');
  emit();
}

/* ------------ recommendations (Spotify autoplay) ------------ */

async function fetchRecos() {
  if (state.radioBusy) return;
  state.radioBusy = true;
  try {
    const t = state.current ?? state.list[state.index] ?? state.history[state.history.length - 1];
    if (!t) return;
    const exclude = [
      state.current?.id,
      ...state.queue.map((x) => x.id),
      ...state.reco.map((x) => x.id),
      ...state.history.slice(-25).map((x) => x.id),
    ].filter(Boolean);
    const res = await tryApi('reco', {
      id: t.id,
      albumId: t.albumId,
      artistId: t.artists?.[0]?.id,
      exclude: exclude.join(','),
    });
    if (res?.tracks?.length) {
      state.reco = res.tracks.slice(0, 30);
      emit();
    }
  } finally {
    state.radioBusy = false;
  }
}

/** Drain recommended tracks into the play queue, tagging them for the drawer. */
function drainRecos() {
  if (!state.reco.length) return false;
  for (const t of state.reco) { t.fromReco = true; state.queue.push(t); }
  state.reco = [];
  emit();
  return true;
}

/* ------------ playback control ------------ */

function loadCurrent() {
  const t = state.list[state.index];
  if (!t) return;
  state.current = t;
  state.loading = true;
  emit();

  audio.src = t.url || t.url96;
  audio.load();
  const pr = audio.play();
  if (pr) pr.catch(() => { /* autoplay policy: user gesture will resume */ });
  store.pushRecent(t);
  setMediaSession(t);

  // keep recommendations flowing while autoplay is running
  if (state.radio && state.reco.length < 5) fetchRecos();
}

function loadAs(t) {
  state.current = t;
  state.loading = true;
  emit();
  audio.src = t.url || t.url96;
  audio.load();
  const pr = audio.play();
  if (pr) pr.catch(() => {});
  store.pushRecent(t);
  setMediaSession(t);
  if (state.radio && state.reco.length < 5) fetchRecos();
}

function setMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: artistsLine(t), album: t.album,
      artwork: [{ src: t.image, sizes: '500x500', type: 'image/jpeg' }],
    });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack', next);
  } catch { /* unsupported */ }
}

export function toggle() { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); }

export function prev() {
  if (audio.currentTime > 3 || state.history.length === 0) { audio.currentTime = 0; return; }
  const t = state.history.pop();
  if (t) {
    if (state.current) state.queue.unshift(state.current);
    state.list = [t, ...state.list.slice(Math.max(0, state.index))];
    state.index = 0;
    loadCurrent();
  }
}

export function next() { advance(1); }

function advance(dir, { auto = false } = {}) {
  if (state.repeat === 'one' && auto) { audio.currentTime = 0; audio.play().catch(() => {}); return; }

  // 1) manual / seeded queue first
  if (state.queue.length) {
    const t = state.queue.shift();
    topUpHistory(state.current);
    loadAs(t);
    return;
  }
  // 2) sequential within original list
  if (state.index + dir < state.list.length && state.index + dir >= 0) {
    topUpHistory(state.current);
    state.index += dir;
    loadCurrent();
    return;
  }
  // 3) end of list: repeat-all wrap
  if (state.repeat === 'all' && state.list.length) {
    topUpHistory(state.current);
    state.index = dir === 1 ? 0 : state.list.length - 1;
    loadCurrent();
    return;
  }
  // 4) end of list + autoplay on: drain recommendations, else fetch more
  if (dir === 1 && state.radio) {
    if (drainRecos()) {
      const t = state.queue.shift();
      topUpHistory(state.current);
      loadAs(t);
      return;
    }
    topUpRadio(); // works for both manual next and track-end
  }
}

/** Radio fallback: fetch fresh recommendations and keep playing. */
async function topUpRadio() {
  if (state.radioBusy) return;
  await fetchRecos();
  if (state.reco.length) {
    drainRecos();
    advance(1, { auto: true });
  } else {
    emit(); // stop at end — nothing available
  }
}

/* ------------ audio element events ------------ */
audio.addEventListener('timeupdate', () => {
  if (!state.loading) {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    els.seekFill.style.width = pct + '%';
    els.seekKnob.style.left = pct + '%';
    els.cur.textContent = fmtTime(audio.currentTime);
  }
});
audio.addEventListener('loadedmetadata', () => {
  state.loading = false;
  els.dur.textContent = fmtTime(audio.duration);
  emit();
});
audio.addEventListener('play', () => { els.play.classList.add('playing'); setPlaybackState(true); emit(); });
audio.addEventListener('pause', () => { els.play.classList.remove('playing'); setPlaybackState(false); emit(); });
audio.addEventListener('ended', () => advance(1, { auto: true }));
audio.addEventListener('error', () => {
  // 96kbps fallback, then skip
  if (state.current && !audio.src.endsWith(state.current.url96 || '\u0000') && state.current.url96) {
    audio.src = state.current.url96;
    audio.play().catch(() => {});
    return;
  }
  toastMsg('Track unavailable — skipping');
  setTimeout(() => advance(1, { auto: true }), 600);
});

function setPlaybackState(playing) {
  if (!('mediaSession' in navigator)) return;
  try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch {}
}

/* ------------ UI wiring ------------ */
els.play.addEventListener('click', toggle);
els.prev.addEventListener('click', prev);
els.next.addEventListener('click', next);

els.shuffle.addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  saveShuffle();
  const keep = state.queue.filter((t) => t.manual || t.fromReco); // user actions survive
  if (state.shuffle && state.list.length) {
    state.queue = [...keep, ...shuffleRest(state.list, state.index).map((t) => ({ ...t, seeded: true }))];
  } else {
    state.queue = keep;
  }
  els.shuffle.classList.toggle('active', state.shuffle);
  toastMsg(state.shuffle ? 'Shuffle on' : 'Shuffle off');
  emit();
});

els.repeat.addEventListener('click', () => {
  state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
  saveRepeat();
  els.repeat.classList.toggle('active', state.repeat !== 'off');
  els.repeat.title = `Repeat: ${state.repeat}`;
  toastMsg(state.repeat === 'off' ? 'Repeat off' : state.repeat === 'all' ? 'Repeat all' : 'Repeat one');
});

els.vol.addEventListener('click', () => {
  audio.muted = !audio.muted;
  els.vol.classList.toggle('muted', audio.muted);
  els.volume.value = audio.muted ? 0 : audio.volume;
});
els.volume.addEventListener('input', () => {
  audio.volume = Number(els.volume.value);
  store.setSetting('volume', audio.volume);
  if (audio.volume > 0) { els.vol.classList.remove('muted'); audio.muted = false; }
});

/* seek */
let seeking = false;
function seekFromEvent(e) {
  const rect = els.seek.getBoundingClientRect();
  const x = e.touches ? e.touches[0].clientX : e.clientX;
  const pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
  if (audio.duration) audio.currentTime = pct * audio.duration;
}
els.seek.addEventListener('pointerdown', (e) => { seeking = true; els.seek.setPointerCapture(e.pointerId); seekFromEvent(e); });
els.seek.addEventListener('pointermove', (e) => { if (seeking) seekFromEvent(e); });
els.seek.addEventListener('pointerup', () => { seeking = false; });

/* like button (player bar) */
els.like.addEventListener('click', () => {
  if (!state.current) return;
  const added = store.toggleFav(state.current);
  els.like.classList.toggle('saved', added);
  toastMsg(added ? 'Added to Favorites' : 'Removed from Favorites');
});

/* keyboard shortcuts */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.code === 'ArrowRight' && e.altKey) { e.preventDefault(); next(); }
  else if (e.code === 'ArrowLeft' && e.altKey) { e.preventDefault(); prev(); }
});

/* now-playing header links */
els.title.addEventListener('click', (e) => { e.preventDefault(); emit('np-title-click'); });
els.sub.addEventListener('click', (e) => { e.preventDefault(); emit('np-sub-click'); });

/* queue drawer toggle */
els.queue.addEventListener('click', () => {
  const d = document.getElementById('queue-drawer');
  d.hidden = !d.hidden;
  renderQueue();
});

/* ================================================================
   Queue drawer — Spotify-style sections:
   Now playing | Next in queue | Next from: {context} | Recommended
   ================================================================ */

export function renderQueue() {
  const list = document.getElementById('qd-list');
  if (!list) return;

  const manual = state.queue.filter((t) => t.manual);
  const seeded = state.queue.filter((t) => t.seeded);
  const recoQueued = state.queue.filter((t) => t.fromReco);
  const queuedIds = new Set(state.queue.map((t) => t.id));
  const upcoming = state.shuffle
    ? [] // seeded items already represent shuffled context
    : state.list.slice(state.index + 1).filter((t) => !queuedIds.has(t.id));

  const row = (t, sec, arg) => `
    <div class="qd-item ${state.current?.id === t.id ? 'now' : ''}" data-sec="${sec}" data-arg="${arg}">
      <img src="${esc(t.image || '/icons/favicon-64.png')}" alt="" loading="lazy" />
      <div class="qd-meta">
        <div class="qd-t">${esc(t.title)}</div>
        <div class="qd-s">${esc(artistsLine(t))}</div>
      </div>
      <span class="qd-dur">${fmtTime(t.duration)}</span>
    </div>`;

  const section = (title, rowsHtml) => rowsHtml ? `<div class="qd-section">${esc(title)}</div>${rowsHtml}` : '';

  const contextTracks = seeded.length ? seeded : upcoming;
  const contextRows = contextTracks
    .map((t, i) => row(t, seeded.length ? 'seed' : 'list', seeded.length ? state.queue.indexOf(t) : state.index + 1 + i))
    .join('');
  const recoPool = recoQueued.concat(state.reco);
  const recoRows = recoPool
    .map((t, i) => row(t, 'reco', state.queue.indexOf(t) >= 0 ? 'q:' + state.queue.indexOf(t) : 'r:' + state.reco.indexOf(t)))
    .join('');

  const isEmpty = !state.current && !manual.length && !contextRows && !recoRows;

  list.innerHTML = `
    ${state.current ? `<div class="qd-section">Now playing</div>${row(state.current, 'now', 0)}` : ''}
    ${section('Next in queue', manual.map((t) => row(t, 'queue', state.queue.indexOf(t))).join(''))}
    ${section(`Next from: ${state.contextName || 'this playlist'}`, contextRows)}
    ${section(state.radio ? 'Recommended — autoplay' : 'Recommended', recoRows)}
    ${isEmpty ? '<div class="empty" style="padding:30px">Queue is empty — play something!</div>' : ''}`;

  list.querySelectorAll('.qd-item').forEach((el) => {
    el.addEventListener('click', () => {
      const { sec, arg } = el.dataset;
      const pullFromQueue = (t) => { state.queue = state.queue.filter((x) => x.id !== t.id); };
      topUpHistory(state.current);
      if (sec === 'now' || sec === undefined) return;
      if (sec === 'queue') {
        const t = state.queue[Number(arg)];
        if (t) { pullFromQueue(t); loadAs(t); }
      } else if (sec === 'seed') {
        const t = state.queue[Number(arg)];
        if (t) { pullFromQueue(t); loadAs(t); }
      } else if (sec === 'list') {
        const i = Number(arg);
        if (state.list[i]) { state.index = i; loadCurrent(); }
      } else if (sec === 'reco') {
        const [where, idx] = arg.split(':');
        const t = where === 'q' ? state.queue[Number(idx)] : state.reco[Number(idx)];
        if (t) { pullFromQueue(t); state.reco = state.reco.filter((x) => x.id !== t.id); loadAs(t); }
      }
      renderQueue();
    });
  });
}

document.getElementById('qd-close').addEventListener('click', () => { document.getElementById('queue-drawer').hidden = true; });

/* toast helper */
let toastTimer;
export function toastMsg(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

export const getAudio = () => audio;

/* initial UI state */
els.shuffle.classList.toggle('active', state.shuffle);
els.repeat.classList.toggle('active', state.repeat !== 'off');
els.volume.value = audio.muted ? 0 : audio.volume;
