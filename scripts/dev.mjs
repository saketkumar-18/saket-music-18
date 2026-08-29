#!/usr/bin/env node
/**
 * Saket Music 18 — local dev server.
 * Serves ./public statically and /api/saavn through saavn-core (same code as Vercel).
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saavn, SaavnError } from '../api/saavn-core.mjs';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(DIR, '..');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/saavn') {
      const op = url.searchParams.get('op');
      const params = {};
      for (const [k, v] of url.searchParams) if (k !== 'op') params[k] = v;
      let status = 200;
      let body;
      try {
        if (!op) throw new SaavnError('missing op', 400);
        body = { ok: true, op, data: await saavn(op, params) };
      } catch (e) {
        status = e instanceof SaavnError ? e.status : 500;
        body = { ok: false, op, error: e.message };
      }
      const payload = JSON.stringify(body);
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
      });
      res.end(payload);
      return;
    }

    // static
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    path = normalize(path).replace(/^([/\\]|\.\.)+/, '');
    let file = join(ROOT, path);
    try {
      await readFile(file);
    } catch {
      // SPA fallback
      file = join(ROOT, 'index.html');
    }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Saket Music 18 dev server → http://127.0.0.1:${PORT}`);
});
