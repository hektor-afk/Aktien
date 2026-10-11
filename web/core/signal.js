// Kaufsignal: 7 Kriterien, jedes mit Ampel (green / red / gray = Daten fehlen).
// Hier ändern, wenn du ein Kriterium anpassen willst. Werte stehen in config/defaults.js.
import { sma, highest, lowest, pct, avgVolumeBefore } from './indicators.js';
import { daysBetween } from './dates.js';
import { num, usd, percent, dateDe } from './format.js';

export const CRITERIA = ['trend', 'ausbruch', 'volumen', 'kerze', 'abstand', 'bericht', 'stop'];

const crit = (key, title, status, value, explain) => ({ key, title, status, value, explain });
const GRAY = (key, title, why) => crit(key, title, 'gray', 'keine Daten', why);

/**
 * @param bars  aufsteigend sortierte Tageskerzen [{t,o,h,l,c,v}]
 * @param opts  { settings, today (ISO), earningsDate (ISO|null) }
 */
export function evaluateSignal(bars, { settings, today, earningsDate = null }) {
  const s = settings.signal;
  const n = bars.length;
  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const last = bars[n - 1];
  const prev = bars[n - 2];
  const enough = n >= 2;

  const sma50 = sma(closes, s.smaFast);
  const sma200 = sma(closes, s.smaSlow);
  const sma50Old = sma(closes, s.smaFast, n - 1 - s.slopeDays);
  const sma200Old = sma(closes, s.smaSlow, n - 1 - s.slopeDays);

  // --- Ausbruchslevel bestimmen -------------------------------------------------
  const lookbackHigh = n > s.breakoutLookback ? highest(highs, n - 1 - s.breakoutLookback, n - 2) : null;
  const isBreakout = enough && lookbackHigh != null && last.c > lookbackHigh;

  let touchedSma50 = false;
  let reversal = false;
  if (enough && sma50 != null && n >= s.pullbackDays) {
    const minLow = lowest(lows, n - s.pullbackDays, n - 1);
    touchedSma50 = minLow <= sma50 * (1 + s.pullbackTouchPct / 100);
    reversal = last.c > last.o && last.c > prev.h && last.c > sma50;
  }
  const isPullback = !isBreakout && touchedSma50 && reversal;
  const mode = isBreakout ? 'ausbruch' : isPullback ? 'ruecksetzer' : null;
  const level = isBreakout ? lookbackHigh : isPullback ? prev.h : lookbackHigh;

  const entryMax = level != null ? level * (1 + s.maxExtendedPct / 100) : null;
  const entry = level != null ? Math.max(last.c, level) : last.c;
  const stop = enough ? Math.min(last.l, prev.l) * (1 - s.stopBufferPct / 100) : null;
  const stopPct = stop != null ? ((entry - stop) / entry) * 100 : null;

  const criteria = [];

  // 1) Trend
  {
    const T = 'Trend';
    if ([sma50, sma200, sma50Old, sma200Old].some((x) => x == null)) {
      criteria.push(GRAY('trend', T, 'Zu wenig Kurshistorie für SMA 200.'));
    } else {
      const aligned = last.c > sma50 && sma50 > sma200;
      const rising = sma50 > sma50Old && sma200 > sma200Old;
      criteria.push(crit('trend', T, aligned && rising ? 'green' : 'red',
        `Kurs ${num(last.c)} · SMA 50 ${num(sma50)} · SMA 200 ${num(sma200)}`,
        aligned && rising
          ? 'Kurs liegt über dem SMA 50, dieser über dem SMA 200, beide steigen: intakter Aufwärtstrend.'
          : !aligned
            ? 'Die Reihenfolge Kurs > SMA 50 > SMA 200 stimmt nicht – der Aufwärtstrend ist nicht sauber.'
            : 'Die Durchschnittslinien steigen nicht beide – der Trend verliert an Kraft.'));
    }
  }

  // 2) Ausbruch oder Rücksetzer
  {
    const T = 'Ausbruch oder Rücksetzer';
    if (lookbackHigh == null) criteria.push(GRAY('ausbruch', T, 'Zu wenig Kurshistorie.'));
    else if (isBreakout) {
      criteria.push(crit('ausbruch', T, 'green',
        `Schluss ${num(last.c)} über Hoch ${num(lookbackHigh)}`,
        `Der Schlusskurs liegt über dem Höchstkurs der letzten ${s.breakoutLookback} Handelstage (ca. 6 Wochen): Ausbruch.`));
    } else if (isPullback) {
      criteria.push(crit('ausbruch', T, 'green',
        `Rücksetzer auf SMA 50 (${num(sma50)}) mit Umkehr`,
        'Die Aktie ist bis an den SMA 50 zurückgekommen und dreht mit grüner Kerze nach oben: Rücksetzer mit Umkehr.'));
    } else {
      criteria.push(crit('ausbruch', T, 'red',
        `Hoch ${s.breakoutLookback} Tage: ${num(lookbackHigh)} · Schluss ${num(last.c)}`,
        'Weder Ausbruch über das Hoch der letzten Wochen noch Rücksetzer auf den SMA 50 mit Umkehr.'));
    }
  }

  // 3) Volumen
  const avgVol = avgVolumeBefore(bars, s.volumeAvgDays);
  const volFactor = avgVol ? last.v / avgVol : null;
  {
    const T = 'Volumen';
    if (volFactor == null || !last.v) criteria.push(GRAY('volumen', T, 'Kein Volumen oder zu wenig Historie.'));
    else {
      const ok = volFactor >= s.volumeFactor;
      criteria.push(crit('volumen', T, ok ? 'green' : 'red', `${num(volFactor, 1)}-faches Ø-Volumen`,
        ok ? `Heute wurde ${num(volFactor, 1)}-mal so viel gehandelt wie üblich – große Anleger sind dabei.`
           : `Nur ${num(volFactor, 1)}-faches Volumen. Gewünscht sind mindestens ${num(s.volumeFactor, 1)}-fach.`));
    }
  }

  // 4) Kerze
  const range = enough ? last.h - last.l : 0;
  const closePos = range > 0 ? (last.c - last.l) / range : null;
  {
    const T = 'Kerze';
    if (!enough || closePos == null) criteria.push(GRAY('kerze', T, 'Kerze nicht auswertbar.'));
    else {
      const green = last.c > last.o;
      const ok = green && closePos >= s.closeNearHighMin;
      criteria.push(crit('kerze', T, ok ? 'green' : 'red',
        `${green ? 'grün' : 'rot'} · Schluss bei ${num(closePos * 100, 0)} % der Tagesspanne`,
        ok ? 'Grüne Kerze, Schluss nahe dem Tageshoch: Käufer haben den Tag klar gewonnen.'
           : !green ? 'Rote Kerze: Verkäufer waren am Ende stärker.'
                    : 'Grün, aber der Schluss ist weit vom Tageshoch entfernt – Käufer haben nachgegeben.'));
    }
  }

  // 5) Abstand zum Ausbruchslevel
  const distancePct = level != null ? pct(last.c, level) : null;
  {
    const T = 'Nicht zu weit gelaufen';
    if (distancePct == null) criteria.push(GRAY('abstand', T, 'Kein Ausbruchslevel bestimmbar.'));
    else {
      const ok = distancePct >= 0 && distancePct <= s.maxExtendedPct;
      criteria.push(crit('abstand', T, ok ? 'green' : 'red',
        `${percent(distancePct, 1, true)} zum Level ${num(level)}`,
        ok ? `Der Kurs liegt höchstens ${s.maxExtendedPct} % über dem Ausbruchslevel – der Einstieg ist noch vernünftig.`
           : distancePct < 0 ? 'Der Kurs liegt noch unter dem Ausbruchslevel – es gibt (noch) keinen Ausbruch.'
                             : `Schon mehr als ${s.maxExtendedPct} % über dem Level – nicht hinterherlaufen.`));
    }
  }

  // 6) Quartalsbericht
  let daysToEarnings = null;
  {
    const T = 'Kein Quartalsbericht in Sicht';
    if (!earningsDate) criteria.push(GRAY('bericht', T, 'Termin des nächsten Quartalsberichts ist unbekannt.'));
    else {
      daysToEarnings = daysBetween(today, earningsDate);
      const soon = daysToEarnings >= 0 && daysToEarnings <= s.earningsBlockDays;
      criteria.push(crit('bericht', T, soon ? 'red' : 'green',
        `nächster Bericht ${dateDe(earningsDate)}${daysToEarnings >= 0 ? ` (in ${daysToEarnings} Tagen)` : ''}`,
        soon ? `Der Bericht kommt in ${daysToEarnings} Tagen. Berichte können den Kurs über Nacht stark bewegen – lieber abwarten.`
             : `Kein Bericht in den nächsten ${s.earningsBlockDays} Tagen.`));
    }
  }

  // 7) Stop-Loss
  {
    const T = 'Stop-Loss nah genug';
    if (stopPct == null) criteria.push(GRAY('stop', T, 'Stop nicht berechenbar.'));
    else {
      const ok = stopPct <= s.maxStopPct;
      criteria.push(crit('stop', T, ok ? 'green' : 'red',
        `Stop ${num(stop)} · ${percent(stopPct, 1)} unter Einstieg`,
        ok ? `Der Stop liegt höchstens ${s.maxStopPct} % unter dem Einstieg – das Risiko pro Aktie bleibt klein.`
           : `Der Stop wäre ${percent(stopPct, 1)} entfernt (mehr als ${s.maxStopPct} %). Zu riskant oder nur mit kleiner Stückzahl.`));
    }
  }

  const greens = criteria.filter((c) => c.status === 'green').length;
  const total = criteria.length;
  const overall = greens === total ? 'kaufsignal' : greens >= s.fastMin ? 'fast' : 'noch_nicht';
  const label = overall === 'kaufsignal' ? 'Kaufsignal' : overall === 'fast' ? `Fast (${greens} von ${total})` : 'Noch nicht';

  // Kurslücke: Eröffnung des letzten Handelstags über dem Einstiegsbereich
  const gapPct = enough ? pct(last.o, prev.c) : null;
  const gapAboveZone = Boolean(entryMax != null && enough && mode && last.o > entryMax);

  return {
    overall, label, greens, total, criteria, mode,
    level, entryMin: level, entryMax, entry, stop, stopPct,
    sma50, sma200, avgVolume: avgVol, volFactor, closePos, distancePct,
    daysToEarnings, gapPct, gapAboveZone
  };
}
