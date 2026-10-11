// Auswertung abgeschlossener Trades.
import { closedResult } from './portfolio.js';

export function tradeStats(closed) {
  const rows = [...closed].sort((a, b) => (a.closedAt < b.closedAt ? -1 : a.closedAt > b.closedAt ? 1 : 0))
    .map((t) => ({ t, ...closedResult(t) }));
  const n = rows.length;
  const wins = rows.filter((r) => r.value > 0);
  const losses = rows.filter((r) => r.value < 0);
  const sum = (a) => a.reduce((s, r) => s + r.value, 0);
  const avgWin = wins.length ? sum(wins) / wins.length : null;
  const avgLoss = losses.length ? Math.abs(sum(losses)) / losses.length : null;
  let cum = 0;
  const curve = rows.map((r) => ({ date: r.t.closedAt, ticker: r.t.ticker, value: r.value, cum: (cum += r.value) }));
  const rs = rows.map((r) => r.r).filter((x) => x != null);
  return {
    n, wins: wins.length, losses: losses.length,
    winRate: n ? (wins.length / n) * 100 : null,
    avgWin, avgLoss,
    payoff: avgWin != null && avgLoss ? avgWin / avgLoss : null,       // Chance-Risiko-Verhältnis
    total: sum(rows),
    expectancy: n ? sum(rows) / n : null,                               // Ø Ergebnis pro Trade
    avgR: rs.length ? rs.reduce((s, x) => s + x, 0) / rs.length : null,
    best: n ? Math.max(...rows.map((r) => r.value)) : null,
    worst: n ? Math.min(...rows.map((r) => r.value)) : null,
    curve
  };
}
