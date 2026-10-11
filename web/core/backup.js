// Datensicherung: eine JSON-Datei mit Positionen, Journal, Watchlist und Einstellungen.
export const BACKUP_VERSION = 1;

export const makeBackup = ({ trades, watchlist, risk, prefs }, now = new Date()) => ({
  app: 'aktien-app', version: BACKUP_VERSION, exportedAt: now.toISOString(), trades, watchlist, risk, prefs
});

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

export function parseBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('Die Datei ist keine gültige Sicherungsdatei (kein JSON).'); }
  if (!o || o.app !== 'aktien-app') throw new Error('Das ist keine Sicherungsdatei dieser App.');
  if (o.version > BACKUP_VERSION) throw new Error('Die Sicherung stammt aus einer neueren App-Version.');
  const trades = Array.isArray(o.trades) ? o.trades : [];
  const watchlist = Array.isArray(o.watchlist) ? o.watchlist : [];
  for (const [i, t] of trades.entries()) {
    if (!t || typeof t.ticker !== 'string' || ![t.entry, t.stop, t.shares].every(isNum) || !['open', 'closed'].includes(t.status)) {
      throw new Error(`Eintrag ${i + 1} bei den Trades ist unvollständig oder fehlerhaft.`);
    }
    if (t.status === 'closed' && !isNum(t.exit)) throw new Error(`Abgeschlossener Trade ${t.ticker} hat keinen Verkaufskurs.`);
  }
  for (const [i, w] of watchlist.entries()) if (!w || typeof w.ticker !== 'string') throw new Error(`Eintrag ${i + 1} der Watchlist ist fehlerhaft.`);
  return { trades, watchlist, risk: o.risk && typeof o.risk === 'object' ? o.risk : {}, prefs: o.prefs && typeof o.prefs === 'object' ? o.prefs : {}, exportedAt: o.exportedAt ?? null };
}
