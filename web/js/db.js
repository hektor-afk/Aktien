// Deine privaten Daten (Positionen, Watchlist, Einstellungen) liegen nur in diesem Browser (localStorage).
// Sie werden nirgendwohin gesendet. Datensicherung per Export/Import folgt in Stufe 3.
import { store, save } from './ui.js';

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
  remove: (ticker) => save('watchlist', list('watchlist').filter((w) => w.ticker !== ticker)),
  ack(ticker, stock) { save('watchlist', list('watchlist').map((w) => (w.ticker === ticker ? { ...w, lastSignal: stock?.signal.overall ?? null, lastLabel: stock?.signal.label ?? null } : w))); }
};

export const allStocks = (d) => [...d.stocks, ...(d.tracked || [])];
export const findStock = (d, ticker) => allStocks(d).find((s) => s.ticker === ticker.toUpperCase());
