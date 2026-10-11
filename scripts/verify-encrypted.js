// Sicherheitsnetz vor dem Veröffentlichen: Im Veröffentlichungsordner darf KEIN lesbarer Datensatz liegen.
// Erlaubt ist nur eine leere Fehlermeldung. Bricht mit Fehler ab -> es wird nichts veröffentlicht.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'data');
const bad = [];
if (existsSync(join(dir, 'bars'))) for (const f of readdirSync(join(dir, 'bars'))) if (!f.endsWith('.enc')) bad.push(`bars/${f}`);
const latest = join(dir, 'latest.json');
if (existsSync(latest)) {
  try { const j = JSON.parse(readFileSync(latest, 'utf8')); if ((j.stocks?.length ?? 0) > 0 || (j.tracked?.length ?? 0) > 0) bad.push('latest.json (enthält Aktien)'); }
  catch { bad.push('latest.json (unlesbar)'); }
}
if (bad.length) { console.error(`STOPP: Unverschlüsselte Daten im Veröffentlichungsordner: ${bad.join(', ')}`); process.exit(1); }
console.log('Prüfung ok: keine lesbaren Daten im Veröffentlichungsordner.');
