// Deine privaten Daten (Positionen, Watchlist, Einstellungen) liegen nur in diesem Browser (localStorage).
// Sie werden nirgendwohin gesendet. Datensicherung per Export/Import folgt in Stufe 3.
import { store, save } from './ui.js';
import { liveStock, liveTickers } from './live.js';

export const RISK_DEFAULTS = { capital: 10000, riskPerTradePct: 1, maxOpenRiskPct: 6, maxPositions: 6, maxPerIndustry: 2, fee: 0 };

export function getRisk(d) {
  const saved = store('risk', {}) || {};
  if (saved.riskPct != null && saved.riskPerTradePct == null) saved.riskPerTradePct = saved.riskPct; // ältere Version
  return { ...RISK_DEFAULTS, ...(d?.settings?.risk || {}), ...saved };
}
export const setRisk = (patch) => save('risk', { ...(store('risk', {}) || {}), ...patch });

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const list = (key) => store(key, []) || [];
export const trades = {
  all: () => list('trades'),
  open: () => list('trades').filter((t) => t.status === 'open'),
  closed: () => list('trades').filter((t) => t.status === 'closed'),
  add(t) { const x = { id: uid(), status: 'open', stop0: t.stop, ...t }; save('trades', [...list('trades'), x]); return x; },
  update(id, patch) { save('trades', list('trades').map((t) => (t.id === id ? { ...t, ...patch } : t))); },
  remove(id) { save('trades', list('trades').filter((t) => t.id !== id)); }
};

export const watch = {
  all: () => list('watchlist'),
  has: (ticker) => list('watchlist').some((w) => w.ticker === ticker),
  add(ticker, stock) {
    if (this.has(ticker)) return;
    save('watchlist', [...list('watchlist'), { ticker, addedAt: new Date().toISOString(), lastSignal: stock?.signal.overall ?? null, lastLabel: stock?.signal.label ?? null }]);
  },
  setEarnings(ticker, date) { save('watchlist', list('watchlist').map((w) => (w.ticker === ticker ? { ...w, earnings: date || null } : w))); },
  remove: (ticker) => save('watchlist', list('watchlist').filter((w) => w.ticker !== ticker)),
  ack(ticker, stock) { save('watchlist', list('watchlist').map((w) => (w.ticker === ticker ? { ...w, lastSignal: stock?.signal.overall ?? null, lastLabel: stock?.signal.label ?? null } : w))); }
};

// Snapshot (Nacht-Daten) und Live-Daten zusammenführen: ist die Live-Berechnung neuer, gilt sie.
const snapshotAll = (d) => [...d.stocks, ...(d.tracked || [])];
const pick = (snap, live) => (!live ? snap : !snap ? live : live.priceDate >= snap.priceDate ? { ...snap, ...live, inScreener: snap.inScreener } : snap);

export function allStocks(d) {
  const snaps = snapshotAll(d);
  const out = snaps.map((s) => pick(s, liveStock(s.ticker)));
  for (const t of liveTickers()) if (!snaps.some((s) => s.ticker === t)) out.push(liveStock(t));
  const manual = Object.fromEntries(watch.all().filter((w) => w.earnings).map((w) => [w.ticker, w.earnings]));
  return out.map((s) => (!s.earnings && manual[s.ticker] ? { ...s, earnings: { date: manual[s.ticker], time: null } } : s));
}
export const findStock = (d, ticker) => allStocks(d).find((s) => s.ticker === ticker.toUpperCase());

/** Alles, was automatisch aktuell gehalten wird: Watchlist + offene Positionen. */
export function trackedItems(d) {
  const w = watch.all();
  const tickers = [...new Set([...w.map((x) => x.ticker), ...trades.open().map((t) => t.ticker)])];
  return tickers.map((ticker) => ({
    ticker, snap: snapshotAll(d).find((s) => s.ticker === ticker),
    earnings: w.find((x) => x.ticker === ticker)?.earnings ?? null
  }));
}
