// Relative Stärke: Wie viel besser (Prozentpunkte) läuft die Aktie als der S&P 500?
import { closeOnOrBefore, pct } from './indicators.js';

function perfOver(bars, days) {
  const n = bars.length;
  if (n <= days) return null;
  return { value: pct(bars[n - 1].c, bars[n - 1 - days].c), from: bars[n - 1 - days].t, to: bars[n - 1].t };
}

function benchPerf(bench, from, to) {
  const a = closeOnOrBefore(bench, from);
  const b = closeOnOrBefore(bench, to);
  return a && b ? pct(b, a) : null;
}

export function relativeStrength(stockBars, benchBars, { days3 = 63, days6 = 126 } = {}) {
  const calc = (days) => {
    const p = perfOver(stockBars, days);
    if (!p || !benchBars?.length) return { stock: p?.value ?? null, bench: null, diff: null };
    const b = benchPerf(benchBars, p.from, p.to);
    return { stock: p.value, bench: b, diff: b == null ? null : p.value - b };
  };
  const m3 = calc(days3);
  const m6 = calc(days6);
  return {
    m3, m6,
    strong: m3.diff != null && m6.diff != null && m3.diff > 0 && m6.diff > 0,
    partial: (m3.diff ?? 0) > 0 || (m6.diff ?? 0) > 0
  };
}
