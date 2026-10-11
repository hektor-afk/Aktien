// Kalender der Quartalsberichte für Positionen und Watchlist.
import { daysBetween } from './dates.js';

export function earningsCalendar({ stocks, openTrades, watchlist, today, warnDays = 14 }) {
  const held = new Set(openTrades.map((t) => t.ticker));
  const watched = new Set(watchlist.map((w) => w.ticker));
  const out = [];
  for (const ticker of new Set([...held, ...watched])) {
    const s = stocks.find((x) => x.ticker === ticker);
    const e = s?.earnings;
    if (!e?.date) { out.push({ ticker, company: s?.company ?? '', date: null, days: null, held: held.has(ticker), warn: false, unknown: true }); continue; }
    const days = daysBetween(today, e.date);
    if (days < -1) continue; // schon vorbei
    out.push({ ticker, company: s.company, date: e.date, time: e.time ?? null, days, held: held.has(ticker), warn: days >= 0 && days <= warnDays, unknown: false });
  }
  return out.sort((a, b) => (a.unknown - b.unknown) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
