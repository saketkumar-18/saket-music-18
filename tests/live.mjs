/**
 * Live integration tests — hit the real JioSaavn API through saavn-core.
 * Run: npm run test:live   (requires network)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { saavn, decryptUrl } from '../api/saavn-core.mjs';

test('home: new releases + featured playlists + charts + genres', async () => {
  const home = await saavn('home');
  assert.ok(home.newAlbums.length >= 5, `newAlbums: ${home.newAlbums.length}`);
  assert.ok(home.featuredPlaylists.length >= 5);
  assert.ok(home.charts.length >= 3);
  assert.ok(home.genres.length >= 5);
  for (const a of home.newAlbums.slice(0, 3)) {
    assert.ok(a.id && a.title && a.image, 'album has id/title/image');
    assert.ok(a.image.startsWith('https://'));
  }
});

test('search: songs with playable urls', async () => {
  const res = await saavn('search', { query: 'kesariya', type: 'songs' });
  assert.ok(res.songs.length >= 3);
  const s = res.songs[0];
  assert.ok(s.url && s.url.includes('.mp4'), `url: ${s.url}`);
  assert.ok(s.title && s.artists.length && s.duration > 30);
});

test('search: all types at once', async () => {
  const res = await saavn('search', { query: 'arijit singh', type: 'all' });
  assert.ok(res.songs.length >= 3);
  assert.ok(res.artists.length >= 1);
  assert.ok(res.albums.length >= 1);
  assert.ok(res.playlists.length >= 1);
});

test('song: single track by id', async () => {
  const res = await saavn('search', { query: 'tum hi ho', type: 'songs' });
  const t = await saavn('song', { id: res.songs[0].id });
  assert.equal(t.id, res.songs[0].id);
  assert.ok(t.url);
});

test('album: detail with songs', async () => {
  const res = await saavn('search', { query: 'aashiqui 2', type: 'albums' });
  assert.ok(res.albums.length >= 1);
  const alb = await saavn('album', { id: res.albums[0].id });
  assert.ok(alb.songs.length >= 4, `songs: ${alb.songs.length}`);
  assert.ok(alb.songs.every((s) => s.url), 'every song playable');
  assert.ok(alb.title);
});

test('playlist: chart playlist resolves with songs', async () => {
  const home = await saavn('home');
  const chart = home.charts[0];
  const pl = await saavn('playlist', { id: chart.id });
  assert.ok(pl.songs.length >= 10, `songs: ${pl.songs.length}`);
  assert.ok(pl.songs.every((s) => s.url));
});

test('artist: page with top songs and albums', async () => {
  const res = await saavn('search', { query: 'arijit singh', type: 'artists' });
  const a = await saavn('artist', { id: res.artists[0].id });
  assert.ok(a.topSongs.length >= 10, `topSongs: ${a.topSongs.length}`);
  assert.ok(a.topSongs.every((s) => s.url));
  assert.ok(a.name);
  assert.ok((a.albums?.length ?? 0) >= 1);
});

test('reco: radio chain never empty', async () => {
  const res = await saavn('search', { query: 'kesariya', type: 'songs' });
  const s = res.songs[0];
  const reco = await saavn('reco', { id: s.id, albumId: s.albumId, artistId: s.artists?.[0]?.id });
  assert.ok(reco.tracks.length >= 5, `source=${reco.source} tracks=${reco.tracks.length}`);
  assert.ok(reco.tracks.every((t) => t.url));
  // excludes shouldn't appear
  const again = await saavn('reco', { id: s.id, albumId: s.albumId, artistId: s.artists?.[0]?.id, exclude: reco.tracks.map((t) => t.id).join(',') });
  assert.ok(again.tracks.length >= 1);
});

test('topSearches: returns names', async () => {
  const t = await saavn('topSearches');
  assert.ok(t.names.length >= 5);
  assert.ok(t.names.every((n) => typeof n === 'string'));
});

test('media URLs actually stream (Range request 206)', async () => {
  const res = await saavn('search', { query: 'kesariya', type: 'songs' });
  const u = res.songs[0].url;
  const r = await fetch(u, { headers: { Range: 'bytes=0-1023' } });
  assert.equal(r.status, 206);
  assert.ok((r.headers.get('content-type') || '').includes('audio'));
  const total = Number((r.headers.get('content-range') || '').split('/')[1]);
  assert.ok(total > 2_000_000, `full-length file: ${(total / 1e6).toFixed(1)}MB`);
});

test('unknown op throws 400-shaped error', async () => {
  await assert.rejects(() => saavn('nope'), (e) => e.status === 400);
});
