// Grundrechenarten für Kursreihen. Alle Funktionen sind rein (ohne Nebenwirkung).

export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : null);

/** Prozentuale Veränderung von b nach a, z. B. pct(110, 100) = 10 */
export const pct = (a, b) => (b ? (a / b - 1) * 100 : null);

/** Einfacher gleitender Durchschnitt der `period` Werte bis einschließlich Index `end`. */
export function sma(values, period, end = values.length - 1) {
  if (end < 0 || end >= values.length || end + 1 < period) return null;
  let s = 0;
  for (let i = end - period + 1; i <= end; i++) s += values[i];
  return s / period;
}

/** Ganze SMA-Reihe (null, solange zu wenig Werte da sind). */
export function smaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= period) s -= values[i - period];
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}

/** Höchster Wert zwischen den Indizes from..to (inklusive). */
export function highest(values, from, to) {
  if (from < 0 || to >= values.length || from > to) return null;
  let m = -Infinity;
  for (let i = from; i <= to; i++) if (values[i] > m) m = values[i];
  return m;
}

export function lowest(values, from, to) {
  if (from < 0 || to >= values.length || from > to) return null;
  let m = Infinity;
  for (let i = from; i <= to; i++) if (values[i] < m) m = values[i];
  return m;
}

/** Ø-Volumen der `days` Handelstage VOR dem letzten Tag (der letzte Tag zählt nicht mit). */
export function avgVolumeBefore(bars, days) {
  const n = bars.length;
  if (n < days + 1) return null;
  return mean(bars.slice(n - 1 - days, n - 1).map((b) => b.v));
}

/** Schlusskurs am angegebenen Datum oder davor (für den Vergleich mit dem Index). */
export function closeOnOrBefore(bars, date) {
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].t <= date) return bars[i].c;
  return null;
}
