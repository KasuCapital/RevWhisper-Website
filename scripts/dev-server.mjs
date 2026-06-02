#!/usr/bin/env node
// Local dev server that mimics Vercel's cleanUrls + redirects from vercel.json.
// Run: node scripts/dev-server.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const requireFromRoot = createRequire(import.meta.url);

// Load .env.local (and .env) so /api/* handlers see the same env Vercel would in prod.
for (const envFile of ['.env', '.env.local']) {
  try {
    const raw = await readFile(join(ROOT, envFile), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = value;
    }
    console.log(`loaded ${envFile}`);
  } catch {}
}

let vercelConfig = { redirects: [], cleanUrls: false };
try {
  vercelConfig = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
} catch {}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function resolvePath(urlPath) {
  // Strip query/hash
  let p = urlPath.split('?')[0].split('#')[0];
  // Decode
  try { p = decodeURIComponent(p); } catch {}
  // Trim trailing slash (except root)
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);

  const abs = join(ROOT, p);

  // 1. Exact file match
  if (await exists(abs)) {
    const s = await stat(abs);
    if (s.isFile()) return abs;
    if (s.isDirectory()) {
      const idx = join(abs, 'index.html');
      if (await exists(idx)) return idx;
    }
  }
  // 2. cleanUrls: try .html
  if (vercelConfig.cleanUrls) {
    const html = `${abs}.html`;
    if (await exists(html)) return html;
  }
  return null;
}

async function handleApiRoute(urlPath, req, res) {
  // urlPath like "/api/form-webhook" → load <ROOT>/api/form-webhook.js
  const name = urlPath.replace(/^\/api\//, '').replace(/\/$/, '');
  if (!name || name.includes('..') || name.includes('/')) return false;
  const file = join(ROOT, 'api', `${name}.js`);
  if (!(await exists(file))) return false;

  let handler;
  try {
    // Bust the require cache so edits to handler files are picked up live.
    delete requireFromRoot.cache[requireFromRoot.resolve(file)];
    handler = requireFromRoot(file);
  } catch (err) {
    console.error(`api ${urlPath} load error:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Handler failed to load.' }));
    return true;
  }

  const fn = typeof handler === 'function' ? handler : handler && handler.default;
  if (typeof fn !== 'function') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Handler is not a function.' }));
    return true;
  }

  try {
    await fn(req, res);
  } catch (err) {
    console.error(`api ${urlPath} runtime error:`, err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Handler threw an error.' }));
    } else {
      res.end();
    }
  }
  console.log(`${res.statusCode || 200} ${req.method} ${urlPath} -> /api/${name}.js`);
  return true;
}

const server = createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // /api/* → invoke the matching serverless handler from the api/ dir
  if (urlPath.startsWith('/api/')) {
    const handled = await handleApiRoute(urlPath, req, res);
    if (handled) return;
  }

  // Honor vercel.json redirects
  for (const r of vercelConfig.redirects || []) {
    if (urlPath === r.source) {
      res.writeHead(r.permanent ? 308 : 307, { Location: r.destination });
      res.end();
      console.log(`${r.permanent ? 308 : 307} ${urlPath} -> ${r.destination}`);
      return;
    }
  }

  const file = await resolvePath(urlPath);
  if (!file) {
    const fourOhFour = join(ROOT, '404.html');
    if (await exists(fourOhFour)) {
      const body = await readFile(fourOhFour);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
    console.log(`404 ${urlPath}`);
    return;
  }

  const ext = extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const body = await readFile(file);
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
  console.log(`200 ${urlPath} -> ${file.replace(ROOT, '')}`);
});

server.listen(PORT, () => {
  console.log(`dev server: http://localhost:${PORT}  (cleanUrls=${!!vercelConfig.cleanUrls}, redirects=${vercelConfig.redirects?.length || 0})`);
});
