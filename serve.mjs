// Mali Budget: a tiny local server with no dependencies.
// Serves the app from ./app and keeps a copy of your data in ./data/budget.json.
// It only listens on this computer (127.0.0.1 and ::1), never on your network.
//
//   node serve.mjs          start on http://localhost:4848
//   node serve.mjs --open   start and open your browser

import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, 'app');
const DATA_DIR = path.join(here, 'data');
const DATA_FILE = path.join(DATA_DIR, 'budget.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const PORT = Number(process.env.PORT) || 4848;
const URL_BASE = `http://localhost:${PORT}`;
const MAX_BODY = 25 * 1024 * 1024;
const KEEP_BACKUPS = 30;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map((h) => `http://${h}`));

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, file);
}

async function dailyBackup(text) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await writeAtomic(path.join(BACKUP_DIR, `budget-${day}.json`), text);
  const files = (await fs.readdir(BACKUP_DIR)).filter((f) => /^budget-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
    await fs.rm(path.join(BACKUP_DIR, old), { force: true });
  }
}

async function handleData(req, res) {
  if (req.method === 'GET') {
    try {
      const text = await fs.readFile(DATA_FILE, 'utf8');
      return send(res, 200, text, { 'Content-Type': MIME['.json'] });
    } catch (e) {
      if (e.code === 'ENOENT') return send(res, 204, '');
      throw e;
    }
  }
  if (req.method === 'PUT') {
    // Only this app (same origin, JSON body) may write. A JSON content type forces a CORS
    // preflight for any other website, which this server never approves.
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, 'Forbidden');
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, 'JSON only');
    const text = await readBody(req);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return send(res, 400, 'Invalid JSON');
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.transactions) || !Array.isArray(data.categories)) {
      return send(res, 400, 'Not a budget file');
    }
    await fs.mkdir(DATA_DIR, { recursive: true });
    await writeAtomic(DATA_FILE, text);
    await dailyBackup(text);
    return send(res, 200, JSON.stringify({ ok: true, savedAt: data.savedAt || null }), { 'Content-Type': MIME['.json'] });
  }
  if (req.method === 'DELETE') {
    const origin = req.headers.origin;
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return send(res, 403, 'Forbidden');
    await fs.rm(DATA_FILE, { force: true });
    return send(res, 200, '{"ok":true}', { 'Content-Type': MIME['.json'] });
  }
  return send(res, 405, 'Method not allowed', { Allow: 'GET, PUT, DELETE' });
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'Bad path');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return send(res, 404, 'Not found', { 'Content-Type': MIME['.txt'] });
  }
  if (!stat.isFile()) return send(res, 404, 'Not found', { 'Content-Type': MIME['.txt'] });
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-cache' };
  if (file.endsWith(`${path.sep}sw.js`)) headers['Service-Worker-Allowed'] = '/';
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

async function handler(req, res) {
  try {
    // Refuse requests that arrive under another host name (blocks DNS-rebinding tricks).
    if (!ALLOWED_HOSTS.has(String(req.headers.host || '').toLowerCase())) return send(res, 403, 'Forbidden');
    const { pathname } = new URL(req.url, URL_BASE);
    if (pathname === '/api/data') return await handleData(req, res);
    if (pathname === '/api/ping') return send(res, 200, '{"ok":true,"app":"mali-budget"}', { 'Content-Type': MIME['.json'] });
    return await serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, e.status === 413 ? 'Too large' : 'Server error');
    else res.end();
  }
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function alreadyRunning() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ping`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return j && j.app === 'mali-budget';
  } catch {
    return false;
  }
}

const wantOpen = process.argv.includes('--open');
const main = http.createServer(handler);

main.on('error', async (e) => {
  if (e.code === 'EADDRINUSE') {
    if (await alreadyRunning()) {
      console.log(`Mali Budget is already running at ${URL_BASE}`);
      if (wantOpen) openBrowser(URL_BASE);
      process.exit(0);
    }
    console.error(`Port ${PORT} is busy with another program. Try: set PORT=4849 and run again.`);
    process.exit(1);
  }
  throw e;
});

main.listen(PORT, '127.0.0.1', () => {
  // Also answer on IPv6 loopback so "localhost" works either way. Ignore if IPv6 is off.
  const v6 = http.createServer(handler);
  v6.on('error', () => {});
  v6.listen(PORT, '::1');
  console.log('');
  console.log('  Mali Budget is running');
  console.log(`  Open ${URL_BASE} in your browser`);
  console.log(`  Your data file: ${DATA_FILE}`);
  console.log('  Close this window (or press Ctrl+C) to stop.');
  console.log('');
  if (wantOpen) openBrowser(URL_BASE);
});
