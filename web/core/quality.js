// Datenprüfung: findet fehlende Tage, Splits, ungewöhnliche Sprünge und kaputte Kerzen.
import { daysBetween } from './dates.js';
import { pct } from './indicators.js';

const SPLIT_RATIOS = [2, 3, 4, 5, 10, 1.5, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 10, 2 / 3];

export function checkDataQuality(bars, { settings, expectedDate = null, referencePrice = null }) {
  const q = settings.quality;
  const issues = [];
  const add = (code, text, severity = 'warn') => issues.push({ code, text, severity });

  if (!bars || bars.length === 0) {
    add('keine_daten', 'Keine Kursdaten erhalten.', 'error');
    return { ok: false, issues };
  }
  if (bars.length < q.minBars) add('zu_kurz', `Nur ${bars.length} Handelstage Historie (für SMA 200 sind mehr nötig).`);

  const broken = bars.filter((b) => ![b.o, b.h, b.l, b.c].every((x) => Number.isFinite(x) && x > 0) || b.h < b.l);
  if (broken.length) add('fehlerhafte_kerzen', `${broken.length} fehlerhafte Kerze(n), z. B. am ${broken[0].t}.`);

  let missing = 0;
  let firstMissing = null;
  for (let i = 1; i < bars.length; i++) {
    const gap = daysBetween(bars[i - 1].t, bars[i].t);
    if (gap > q.maxGapDays) { missing++; firstMissing ??= `${bars[i - 1].t} → ${bars[i].t}`; }
  }
  if (missing) add('fehlende_tage', `Fehlende Kurstage in den Daten (${firstMissing}).`);

  for (let i = 1; i < bars.length; i++) {
    const ratio = bars[i].c / bars[i - 1].c;
    const change = Math.abs(pct(bars[i].c, bars[i - 1].c));
    const looksLikeSplit = SPLIT_RATIOS.some((r) => Math.abs(ratio / r - 1) < 0.04);
    if (looksLikeSplit && change > 25) {
      add('split', `Möglicher Aktiensplit am ${bars[i].t} (Kurs ×${ratio.toFixed(2)}). Die Durchschnitte können verfälscht sein.`);
      break;
    }
    if (change > q.jumpPct) {
      add('sprung', `Ungewöhnlicher Kurssprung von ${change.toFixed(0)} % am ${bars[i].t}.`);
      break;
    }
  }

  if (expectedDate) {
    const age = daysBetween(bars[bars.length - 1].t, expectedDate);
    if (age > 3) add('veraltet', `Letzter Kurs ist vom ${bars[bars.length - 1].t} – neuere Daten fehlen.`);
  }

  if (referencePrice) {
    const dev = Math.abs(pct(bars[bars.length - 1].c, referencePrice));
    if (dev > q.maxPriceDeviationPct) add('abweichung', `Schlusskurs weicht ${dev.toFixed(1)} % vom Kurs der Screener-Quelle ab.`);
  }

  return { ok: issues.length === 0, issues };
}
