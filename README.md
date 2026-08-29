# Saket Music 18 🎵

**A free, Spotify-style music streaming PWA.** Millions of full-length tracks served live from the JioSaavn catalog — new releases appear automatically, no account needed, no ads, no cost.

**Live:** [saket-music-18.vercel.app](https://saket-music-18.vercel.app)

## Features

| Feature | Details |
|---|---|
| 🔍 Universal search | Songs, albums, artists, playlists — the entire JioSaavn catalog |
| ▶️ Full-length playback | 320 kbps when available, automatic 96 kbps fallback, auto-skip dead streams |
| 📻 Autoplay radio | 3-tier recommendation chain (song → album → artist) keeps music flowing forever |
| ♥️ Favorites & playlists | Create playlists, like songs, all persisted locally |
| 🕐 Recently played | Auto-tracked history |
| 🔀 Shuffle / repeat | One/all/off, queue reordering |
| 📱 PWA | Installable, offline shell, media cached, MediaSession (lock-screen controls) |
| ⌨️ Keyboard | `Space` play/pause, `Alt+←/→` prev/next |
| 🌐 15+ languages | Hindi, English, Punjabi, Tamil, Telugu, Marathi, and more |

## Architecture

```
Browser ── /api/saavn?op=… ──> Vercel Edge Function ──> JioSaavn public API
                                    │
                                    └─ decrypts DES-ECB media URLs,
                                       normalizes ~6 response shapes
                                       into one clean model
```

- **Frontend** — vanilla ES modules, zero framework, ~40 KB gzipped. Spotify-style dark UI, fully responsive (mobile bottom-nav included).
- **API layer** — one edge function (`api/saavn.js`) with 8 ops: `home search song album playlist artist reco topSearches`. Responses normalized in `api/saavn-core.mjs` (single source of truth shared by prod, dev server, and tests).
- **Media** — streamed directly from the Saavn CDN to the browser (the proxy never relays audio — it only decrypts + normalizes metadata).
- **Storage** — favorites/playlists/recents/settings in `localStorage`; nothing leaves the device.

### Why an edge proxy?
1. JioSaavn's API has no CORS headers.
2. `encrypted_media_url` must be DES-ECB decrypted (key `38346591`, public knowledge) — done server-side so the client stays simple.
3. One place to normalize the API's many inconsistent shapes (3 different song formats, stringified `more_info`, HTML entities, …).

## Develop

```bash
npm install     # crypto-js only
npm run dev     # http://127.0.0.1:3000  (static + /api/saavn via scripts/dev.mjs)
```

## Test

```bash
npm test         # 36 unit tests — decrypt, normalizers, store logic (no network)
npm run test:live # 11 integration tests — real API: search, album, artist,
                  #   playlist, reco chain, Range-request full-length stream check
npm run verify:api # endpoint shape probe — run when the upstream API changes
```

## Deploy (Vercel)

```bash
vercel --prod
```

`vercel.json` pins edge runtime + cache headers; `api/` is auto-detected. Static assets at repo root.

## Project layout

```
api/saavn.js         # Vercel edge function (CORS + cache headers)
api/saavn-core.mjs   # core library: fetch, decrypt, normalize, 8 ops
scripts/dev.mjs      # local dev server (same core)
scripts/verify-saavn.mjs  # upstream API shape probe
js/                  # api, store, player (queue/radio/MediaSession), views, app
css/styles.css       # Spotify-style theme
tests/               # unit + live integration
icons/, sw.js, manifest.json   # PWA
```

## Ethics & legality

- This is a **client for a public catalog**, like a browser: it stores no music, mirrors nothing, and relays no audio. All playback is a direct browser↔CDN stream of what JioSaavn itself serves on its website.
- **No account is needed and none is bypassed** — the upstream API is the unauthenticated one the JioSaavn web player itself uses.
- For personal/educational use. If you are the catalog owner and object to third-party clients, this app can be taken down like any web page.
- No tracking, no ads, no data collection: everything lives in your browser's localStorage.

## License

MIT — Saket Kumar
