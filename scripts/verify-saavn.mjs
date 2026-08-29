#!/usr/bin/env node
/**
 * Saket Music 18 — live JioSaavn endpoint probe.
 *
 * Hits the public JioSaavn web API directly and prints a compact summary of
 * each response's shape (keys, sample item keys, decrypted media URL, HTTP
 * status of the audio CDN). Run before changing api/saavn.js, or as a
 * diagnostic when playback breaks:
 *
 *     node scripts/verify-saavn.mjs
 */
import crypto from 'node:crypto';

const BASE = 'https://www.jiosaavn.com/api.php';
const DES_KEY = Buffer.from('38346591', 'utf8');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const failures = [];
const ok = (name, cond, note = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? '  | ' + note : ''}`);
  if (!cond) failures.push(name);
};

async function api(call, params = {}) {
  const u = new URL(BASE);
  const qs = { __call: call, _format: 'json', _marker: '0', cc: 'in', includeMetaTags: '1', ...params };
  for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, String(v));
  const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.9' } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, json, text: json ? '' : text.slice(0, 160) };
}

const decryptUrl = (enc) => {
  try {
    const d = crypto.createDecipheriv('des-ecb', DES_KEY, null);
    return (d.update(enc, 'base64', 'utf8') + d.final('utf8')).replace(/^http:/, 'https:');
  } catch (e) { return 'ERR:' + e.message; }
};

const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).join(', ') : JSON.stringify(o)?.slice(0, 80) ?? String(o));
const firstKeys = (a) => (Array.isArray(a) && a.length ? keys(a[0]) : '(empty)');

async function headMedia(url) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-1023', 'User-Agent': UA } });
    return `${r.status} ${r.headers.get('content-type') ?? '?'} ${r.headers.get('content-range') ?? ''}`;
  } catch (e) { return 'ERR ' + e.message; }
}

console.log('== 1. autocomplete.get (search) ==');
const search = await api('autocomplete.get', { query: 'tum hi ho' });
ok('search HTTP 200', search.status === 200, `status=${search.status}`);
ok('search has songs.data', !!search.json?.songs?.data?.length, `n=${search.json?.songs?.data?.length}`);
const s0 = search.json?.songs?.data?.[0];
console.log('  song item keys:', keys(s0));
console.log('  song moreInfo keys:', keys(s0?.moreInfo));
ok('song has encrypted_media_url', !!(s0?.encrypted_media_url || s0?.moreInfo?.encrypted_media_url));
const pid = s0?.id;
const enc0 = s0?.encrypted_media_url || s0?.moreInfo?.encrypted_media_url;
const media0 = enc0 ? decryptUrl(enc0) : null;
console.log('  decrypted:', media0);
console.log('  artists data n=', search.json?.artists?.data?.length, 'first:', keys(search.json?.artists?.data?.[0]));
console.log('  albums  data n=', search.json?.albums?.data?.length, 'first:', keys(search.json?.albums?.data?.[0]));
console.log('  playlists data n=', search.json?.playlists?.data?.length, 'first:', keys(search.json?.playlists?.data?.[0]));
const artistId = search.json?.artists?.data?.[0]?.id ?? s0?.moreInfo?.artistMap?.primary_artists?.[0]?.id;
const albumId = search.json?.albums?.data?.[0]?.id;

console.log('\n== 2. media CDN check ==');
if (media0) {
  console.log('  96 :', await headMedia(media0));
  console.log('  320:', await headMedia(media0.replace('_96.', '_320.')));
}

console.log('\n== 3. song.getDetails ==');
const det = await api('song.getDetails', { pids: pid });
ok('details 200 + pid key', det.status === 200 && det.json && pid in det.json, `keys=${keys(det.json)}`);
const d0 = det.json?.[pid];
console.log('  detail keys:', keys(d0));
console.log('  320kbps flag:', d0?.['320kbps'], '| lyrics_id:', d0?.lyrics_id, '| duration:', d0?.duration);
if (d0?.lyrics_id) {
  const ly = await api('lyrics.getDetails', { lyrics_id: d0.lyrics_id });
  console.log('  lyrics:', ly.status, keys(ly.json)?.slice(0, 120));
}

console.log('\n== 4. content.getHomepageData ==');
const home = await api('content.getHomepageData', { api_version: '4', ctx: 'web3dot0' });
ok('homepage 200', home.status === 200);
const mods = home.json?.modules;
console.log('  top keys:', keys(home.json));
let probePlaylist;
if (Array.isArray(mods)) {
  console.log(`  modules: ${mods.length}`);
  for (const m of mods.slice(0, 10)) console.log('   -', m.id, '|', String(m.title || m.subtitle || '').slice(0, 40), '| type:', m.content?.type ?? m.type ?? '?', '| items:', m.content?.items?.length ?? '?');
  const songMod = mods.find((m) => (m.content?.type ?? m.type) === 'song');
  console.log('  song module item keys:', firstKeys(songMod?.content?.items), '| moreInfo keys:', keys(songMod?.content?.items?.[0]?.moreInfo));
  const plMod = mods.find((m) => (m.content?.type ?? m.type) === 'playlist');
  console.log('  playlist module item keys:', firstKeys(plMod?.content?.items), '| moreInfo:', keys(plMod?.content?.items?.[0]?.moreInfo)?.slice(0, 100));
  const albMod = mods.find((m) => (m.content?.type ?? m.type) === 'album');
  console.log('  album module item keys:', firstKeys(albMod?.content?.items));
  probePlaylist = plMod?.content?.items?.[0]?.id;
} else { console.log('  modules shape:', keys(mods)); }

console.log('\n== 5. content.getCharts ==');
const charts = await api('content.getCharts', { api_version: '4' });
console.log('  status', charts.status, 'keys:', keys(charts.json));
const chartList = charts.json?.charts ?? charts.json?.data;
console.log('  charts n=', Array.isArray(chartList) ? chartList.length : '?', 'first:', keys(chartList?.[0]));
const chartId = chartList?.[0]?.id;

console.log('\n== 6. album.getDetails ==');
const alb = await api('album.getDetails', { albumid: albumId });
ok('album 200', alb.status === 200 && !!alb.json?.songs, `keys=${keys(alb.json)?.slice(0, 100)}`);
console.log('  album songs n=', alb.json?.songs?.length, 'first song keys:', firstKeys(alb.json?.songs));
console.log('  first song has enc_media:', !!alb.json?.songs?.[0]?.encrypted_media_url);

console.log('\n== 7. artist page ==');
const art1 = await api('artist.getArtistPageDetails', { artistId, page: '0', n_song: '20', n_album: '10' });
console.log('  artist.getArtistPageDetails:', art1.status, keys(art1.json)?.slice(0, 140));
const art2 = await api('content.getArtistPageDetails', { artistId, page: '0', n_song: '20' });
console.log('  content.getArtistPageDetails:', art2.status, keys(art2.json)?.slice(0, 140));
const art = art2.json?.topSongs ? art2.json : art1.json?.topSongs ? art1.json : null;
ok('artist page usable', !!art, art ? 'topSongs n=' + (art.topSongs?.songs?.length ?? '?') : 'both failed');
console.log('  topSongs item keys:', firstKeys(art?.topSongs?.songs), '| albums keys:', keys(art?.albums)?.slice(0, 80));

console.log('\n== 8. playlist.getDetails (chart) ==');
const pl = await api('playlist.getDetails', { listid: chartId || probePlaylist });
ok('playlist 200 + songs', pl.status === 200 && !!pl.json?.songs, `keys=${keys(pl.json)?.slice(0, 100)}`);
console.log('  playlist songs n=', pl.json?.songs?.length, 'first keys:', firstKeys(pl.json?.songs));
console.log('  first has enc_media:', !!(pl.json?.songs?.[0]?.encrypted_media_url || pl.json?.songs?.[0]?.moreInfo?.encrypted_media_url));

console.log('\n== 9. content.getTopSearches (optional) ==');
const ts = await api('content.getTopSearches', { api_version: '4' });
console.log('  status:', ts.status, 'keys:', keys(ts.json)?.slice(0, 100));

console.log('\n== 10. search.getResults (optional deep search) ==');
const sr = await api('search.getResults', { q: 'arijit singh', page: '0', n: '20', api_version: '4' });
console.log('  status:', sr.status, 'keys:', keys(sr.json)?.slice(0, 100));

console.log('\n================================');
console.log(failures.length ? `FAILURES: ${failures.join(', ')}` : 'ALL CORE CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
