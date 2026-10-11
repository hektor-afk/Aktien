// Sortierung: Kaufsignal vor Fast vor Noch nicht; darin mehr grüne Kriterien,
// relative Stärke (3 und 6 Monate besser als S&P 500) und 6-Monats-Performance.
const GROUP = { kaufsignal: 0, fast: 1, noch_nicht: 2 };

export function compareStocks(a, b) {
  return (
    GROUP[a.signal.overall] - GROUP[b.signal.overall] ||
    b.signal.greens - a.signal.greens ||
    Number(b.rs.strong) - Number(a.rs.strong) ||
    Number(b.rs.partial) - Number(a.rs.partial) ||
    (b.perf6m ?? -Infinity) - (a.perf6m ?? -Infinity)
  );
}
