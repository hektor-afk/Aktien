// Verschlüsselt web/data: latest.json -> latest.enc, bars/*.json -> bars/*.enc. Klartext wird gelöscht.
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { encryptText, randomSalt, ITERATIONS } from '../../web/core/crypto.js';

export async function encryptDir(dir, password, iterations = ITERATIONS) {
  if (!password) throw new Error('Kein Passwort zum Verschlüsseln.');
  const salt = randomSalt(); // ein Salz je Lauf: der Browser rechnet den Schlüssel nur einmal
  const files = [];
  if (existsSync(join(dir, 'latest.json'))) files.push(['latest.json', 'latest.enc']);
  const barsDir = join(dir, 'bars');
  if (existsSync(barsDir)) for (const f of readdirSync(barsDir)) if (f.endsWith('.json')) files.push([`bars/${f}`, `bars/${f.replace(/\.json$/, '.enc')}`]);
  for (const [from, to] of files) {
    writeFileSync(join(dir, to), await encryptText(readFileSync(join(dir, from), 'utf8'), password, { salt, iterations }));
    rmSync(join(dir, from));
  }
  return files.length;
}

/** Datei laden, egal ob verschlüsselt oder nicht (für den Vergleich mit dem Vortag). */
export async function readSnapshotFile(dir, password, decryptText) {
  if (existsSync(join(dir, 'latest.enc')) && password) return JSON.parse(await decryptText(readFileSync(join(dir, 'latest.enc'), 'utf8'), password));
  if (existsSync(join(dir, 'latest.json'))) return JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8'));
  return null;
}
