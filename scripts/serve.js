// Kleiner lokaler Webserver für die App:  npm start  ->  http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
// Noch keine Daten da? Dann Demo-Daten erzeugen, damit die App etwas zeigt.
if (!existsSync(join(ROOT, 'data', 'latest.json'))) {
  console.log('Noch keine Daten vorhanden – erzeuge Demo-Daten (echte Daten: "npm run update").');
  spawnSync(process.execPath, [join(ROOT, '..', 'src', 'pipeline', 'run.js'), '--demo'], { stdio: 'inherit' });
}
const port = Number(process.env.PORT) || 8080;

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
  } catch { res.writeHead(404).end('Nicht gefunden'); }
}).listen(port, '0.0.0.0', () => {
  console.log(`\nApp läuft. Am Computer öffnen:  http://localhost:${port}`);
  const lan = Object.values(networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal);
  for (const i of lan) console.log(`Am Handy (gleiches WLAN):        http://${i.address}:${port}`);
  console.log('Beenden mit Strg+C.\n');
});
