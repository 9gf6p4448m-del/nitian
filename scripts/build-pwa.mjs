import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const base = '/nitian/'
await mkdir('dist/icons', { recursive: true })
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp('public/icon.svg').resize(size, size).png().toFile(`dist/icons/${file}`)
}
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(e => e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))
  return nested.flat()
}
let commit = 'local'
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch { /* source archives have no Git metadata */ }
const assets = (await files('dist')).filter(f => !f.endsWith('sw.js') && !f.endsWith('version.json')).sort()
const hash = createHash('sha256')
for (const asset of assets) hash.update(await readFile(asset))
const version = `nitian-s0-${hash.digest('hex').slice(0, 12)}`
await writeFile('dist/version.json', JSON.stringify({ version, commit, builtAt: new Date().toISOString() }, null, 2))
const precache = [...assets.map(f => base + f.slice(5)), base + 'version.json', base]
const sw = `const CACHE = ${JSON.stringify(version)};
const BASE = ${JSON.stringify(base)};
const FILES = ${JSON.stringify(precache)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('nitian-s0-') && k !== CACHE).map(k => caches.delete(k)))),
  self.clients.claim()
])));
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(response => {
      if (!response.ok) throw new Error('Navigation unavailable');
      return response;
    }).catch(() => caches.open(CACHE).then(cache => cache.match(BASE + 'index.html'))));
    return;
  }
  if (!FILES.includes(url.pathname)) return;
  // These are allowlisted, same-origin static files. Use the canonical precache
  // key so Vary: Origin cannot miss on module/CSS requests during offline reload.
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(req)));
});
`
await writeFile('dist/sw.js', sw)
await writeFile('dist/.nojekyll', '')
console.log(`PWA ${version}: precached ${precache.length} URLs; source ${commit.slice(0, 8)}`)
