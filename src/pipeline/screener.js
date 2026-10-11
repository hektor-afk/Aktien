// Screener-Kriterien lokal anwenden (unabhängig von der Datenquelle). Alle Werte kommen aus den Einstellungen.
// `skip`: Kriterien, deren Daten die Quelle nicht liefert (z. B. 'epsQoq') – sie werden dann nicht geprüft.
export function applyScreener(rows, f, { skip = [] } = {}) {
  const skipped = new Set(skip);
  const pass = (r) => {
    const needed = ['marketCap', 'price', 'avgVolume', 'epsQoq', 'salesQoq', 'perf6m', 'distHigh52'].filter((k) => !skipped.has(k));
    if (needed.some((k) => r[k] == null)) return false;
    if (f.aboveSma50 && !(r.distSma50 > 0)) return false;
    if (f.aboveSma200 && !(r.distSma200 > 0)) return false;
    return (
      r.marketCap > f.minMarketCapMrd * 1e9 &&
      r.price > f.minPrice &&
      r.avgVolume > f.minAvgVolume &&
      (skipped.has('epsQoq') || r.epsQoq > f.minEpsGrowthQoq) &&
      (skipped.has('salesQoq') || r.salesQoq > f.minSalesGrowthQoq) &&
      r.perf6m > f.minPerf6m &&
      r.distHigh52 >= -f.maxBelow52wHighPct
    );
  };
  return rows.filter(pass).sort((a, b) => b.perf6m - a.perf6m);
}
