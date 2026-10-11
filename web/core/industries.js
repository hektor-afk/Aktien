// Branchen-Kacheln: Treffer, Signale und Ø-Performance je Branche.
export function groupIndustries(stocks) {
  const map = new Map();
  for (const s of stocks) {
    const key = s.industry || 'Unbekannt';
    const g = map.get(key) ?? { industry: key, sector: s.sector || '', count: 0, signals: 0, fast: 0, perfSum: 0, perfN: 0, tickers: [] };
    g.count++;
    if (s.signal.overall === 'kaufsignal') g.signals++;
    if (s.signal.overall === 'fast') g.fast++;
    if (s.perf6m != null) { g.perfSum += s.perf6m; g.perfN++; }
    g.tickers.push(s.ticker);
    map.set(key, g);
  }
  return [...map.values()].map((g) => ({ ...g, avgPerf6m: g.perfN ? g.perfSum / g.perfN : null }));
}

export const sortIndustries = (list, by = 'count') =>
  [...list].sort(by === 'perf'
    ? (a, b) => (b.avgPerf6m ?? -Infinity) - (a.avgPerf6m ?? -Infinity) || b.count - a.count
    : (a, b) => b.count - a.count || (b.avgPerf6m ?? -Infinity) - (a.avgPerf6m ?? -Infinity));
