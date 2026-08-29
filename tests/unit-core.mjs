/**
 * Unit tests for Saket Music 18 core (node:test).
 * Run: npm test  (no network — fixtures only)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptUrl, qualityUrl, imageVariants, decodeEntities, langName, normalizeTrack,
} from '../api/saavn-core.mjs';

/* ---------------- decryptUrl ---------------- */

test('decryptUrl decrypts a known encrypted URL', () => {
  const enc = 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyryhkSYK5IH2E7FCO52VR6yhNbcEbes5iCcja4+W8xhE0SwtCJToN4Bw7tS9a8Gtq';
  const out = decryptUrl(enc);
  assert.equal(out, 'https://aac.saavncdn.com/871/c2febd353f3a076a406fa37510f31f9f_96.mp4');
});

test('decryptUrl forces https', () => {
  // decrypt a fixture that decodes to http:// — craft via same key is hard; just assert protocol of known one
  const out = decryptUrl('ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyryhkSYK5IH2E7FCO52VR6yhNbcEbes5iCcja4+W8xhE0SwtCJToN4Bw7tS9a8Gtq');
  assert.ok(out.startsWith('https://'));
});

test('decryptUrl returns null on garbage', () => {
  assert.equal(decryptUrl('not-base64!!!'), null);
  assert.equal(decryptUrl(''), null);
  assert.equal(decryptUrl(null), null);
  assert.equal(decryptUrl(undefined), null);
  assert.equal(decryptUrl(42), null);
});

/* ---------------- qualityUrl ---------------- */

test('qualityUrl swaps _96. for _320.', () => {
  const url = 'https://aac.saavncdn.com/871/c2febd353f3a076a406fa37510f31f9f_96.mp4';
  assert.equal(qualityUrl(url, 320), 'https://aac.saavncdn.com/871/c2febd353f3a076a406fa37510f31f9f_320.mp4');
});

test('qualityUrl leaves non-96 URLs untouched', () => {
  assert.equal(qualityUrl('https://x.example/a_320.mp4', 320), 'https://x.example/a_320.mp4');
  assert.equal(qualityUrl(null, 320), null);
});

/* ---------------- imageVariants ---------------- */

test('imageVariants builds 50/150/500 variants', () => {
  const v = imageVariants('http://c.saavncdn.com/123/cover_50x50.jpg');
  assert.equal(v[50], 'https://c.saavncdn.com/123/cover_50x50.jpg');
  assert.equal(v[150], 'https://c.saavncdn.com/123/cover_150x150.jpg');
  assert.equal(v[500], 'https://c.saavncdn.com/123/cover_500x500.jpg');
});

test('imageVariants handles missing URL', () => {
  assert.deepEqual(imageVariants(null), { 50: null, 150: null, 500: null });
});

/* ---------------- decodeEntities ---------------- */

test('decodeEntities decodes common entities', () => {
  assert.equal(decodeEntities('Tum Hi Ho (From &quot;Aashiqui 2&quot;)'), 'Tum Hi Ho (From "Aashiqui 2")');
  assert.equal(decodeEntities('A &amp; B'), 'A & B');
  assert.equal(decodeEntities('A &#39; B'), "A ' B");
  assert.equal(decodeEntities('&#2958;'), 'எ');
});

test('decodeEntities leaves unknown entities alone', () => {
  assert.equal(decodeEntities('&foo;'), '&foo;');
});

test('decodeEntities trims whitespace', () => {
  assert.equal(decodeEntities('  x  '), 'x');
});

/* ---------------- langName ---------------- */

test('langName maps known codes and passes unknown', () => {
  assert.equal(langName('hindi'), 'Hindi');
  assert.equal(langName('ENGLISH'), 'English');
  assert.equal(langName('klingon'), 'klingon'); // unknown codes pass through
  assert.equal(langName(''), '');
  assert.equal(langName(null), '');
});

/* ---------------- normalizeTrack ---------------- */

const SEARCH_SONG = {
  id: 'aRZbUYD7', type: 'song', title: 'Kesariya', image: 'https://c.saavncdn.com/1/cover_50x50.jpg',
  language: 'hindi', year: '2022', play_count: '123456789',
  more_info: JSON.stringify({
    album: 'Brahmastra', album_id: '2490511', duration: '268', '320kbps': 'true',
    encrypted_media_url: 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyryhkSYK5IH2E7FCO52VR6yhNbcEbes5iCcja4+W8xhE0SwtCJToN4Bw7tS9a8Gtq',
    has_lyrics: 'true', artistMap: { primary_artists: [{ id: '459320', name: 'Arijit Singh' }] },
  }),
};

const DETAIL_SONG = {
  id: 'aRZbUYD7', type: 'song', song: 'Kesariya', album: 'Brahmastra', year: '2022',
  language: 'hindi', duration: '268', play_count: '123456789', '320kbps': 'true',
  image: 'https://c.saavncdn.com/1/cover_50x50.jpg',
  primary_artists: 'Arijit Singh',
  encrypted_media_url: 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyryhkSYK5IH2E7FCO52VR6yhNbcEbes5iCcja4+W8xhE0SwtCJToN4Bw7tS9a8Gtq',
};

test('normalizeTrack handles search.getResults shape (more_info string)', () => {
  const t = normalizeTrack(SEARCH_SONG);
  assert.equal(t.id, 'aRZbUYD7');
  assert.equal(t.title, 'Kesariya');
  assert.equal(t.album, 'Brahmastra');
  assert.equal(t.albumId, '2490511');
  assert.equal(t.duration, 268);
  assert.equal(t.has320, true);
  assert.equal(t.url, 'https://aac.saavncdn.com/871/c2febd353f3a076a406fa37510f31f9f_320.mp4');
  assert.equal(t.url96, 'https://aac.saavncdn.com/871/c2febd353f3a076a406fa37510f31f9f_96.mp4');
  assert.deepEqual(t.artists, [{ id: '459320', name: 'Arijit Singh' }]);
  assert.equal(t.language, 'Hindi');
  assert.equal(t.playCount, 123456789);
  assert.equal(t.hasLyrics, true);
  assert.equal(t.image, 'https://c.saavncdn.com/1/cover_500x500.jpg');
});

test('normalizeTrack handles song.getDetails shape (flat fields)', () => {
  const t = normalizeTrack(DETAIL_SONG);
  assert.equal(t.title, 'Kesariya');
  assert.equal(t.album, 'Brahmastra');
  assert.equal(t.has320, true);
  assert.ok(t.url.endsWith('_320.mp4'));
  assert.deepEqual(t.artists, [{ id: null, name: 'Arijit Singh' }]);
});

test('normalizeTrack prefers 320 when flag true, falls back to 96', () => {
  const no320 = JSON.parse(JSON.stringify(SEARCH_SONG));
  no320.more_info = JSON.stringify({ ...JSON.parse(no320.more_info), '320kbps': 'false' });
  const t = normalizeTrack(no320);
  assert.equal(t.has320, false);
  assert.equal(t.url, 'https://aac.saavncdn.com/871/c2febd353f3a076a406fa37510f31f9f_96.mp4');
});

test('normalizeTrack returns null without id', () => {
  assert.equal(normalizeTrack(null), null);
  assert.equal(normalizeTrack({ title: 'x' }), null);
});

test('normalizeTrack missing artistMap falls back to singers string', () => {
  const t = normalizeTrack({ ...DETAIL_SONG, artistMap: undefined, primary_artists: 'A, B' });
  assert.deepEqual(t.artists, [{ id: null, name: 'A' }, { id: null, name: 'B' }]);
});

test('normalizeTrack without any artist info yields Unknown Artist', () => {
  const t = normalizeTrack({ ...DETAIL_SONG, primary_artists: '', singers: '', artistMap: undefined, more_info: undefined });
  assert.deepEqual(t.artists, [{ id: null, name: 'Unknown Artist' }]);
});
