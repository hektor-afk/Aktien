// Finviz-Elite-Export: URL bauen, CSV lesen, nach deinen Kriterien filtern.
import { parseEarningsDate } from '../../web/core/dates.js';

// Grobe Vorauswahl bei Finviz (US, nur Aktien, keine ETFs). Die exakten Schwellen
// prüfen wir danach selbst – so sind alle Werte in den Einstellungen frei änderbar.
export const FINVIZ_PREFILTER = 'geo_usa,ind_stocksonly,cap_smallover,sh_avgvol_o200,sh_price_o5';

// Spalten-Nummern des Finviz-Exports (Ticker, Firma, Sektor, Branche, Marktkap., EPS/Umsatz Q/Q,
// Performance Halbjahr, Abstand SMA 50/200, 52-Wochen-Hoch, Ø-Volumen, Kurs, Änderung, Volumen, Termin).
// Falls Finviz die Nummern ändert, hier anpassen – gelesen wird später über die Spaltennamen.
export const FINVIZ_COLUMNS = '1,2,3,4,6,22,23,45,53,54,57,63,65,66,67,68';

export function buildExportUrl({ token, filters = FINVIZ_PREFILTER, columns = FINVIZ_COLUMNS, tickers = null }) {
  if (!token) throw new Error('FINVIZ_TOKEN fehlt. Bitte in der Datei .env eintragen.');
  // Mit `tickers` werden gezielt diese Aktien abgefragt (Watchlist/Positionen), ohne Screener-Filter.
  const params = new URLSearchParams(tickers?.length
    ? { v: '152', t: tickers.join(','), c: columns, auth: token }
    : { v: '152', f: filters, c: columns, auth: token });
  return `https://elite.finviz.com/export.ashx?${params}`;
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "1.5B" -> 1.5e9, "12.3%" -> 12.3, "1,234,567" -> 1234567, "-" -> null */
export function parseNumber(raw) {
  if (raw == null) return null;
  const t = String(raw).trim().replace(/,/g, '').replace(/%$/, '');
  if (t === '' || t === '-') return null;
  const m = /^(-?\d*\.?\d+)([KMBT])?$/i.exec(t);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || '').toUpperCase()] ?? 1;
  return Number(m[1]) * mult;
}

const ALIASES = {
  ticker: ['ticker'],
  company: ['company'],
  sector: ['sector'],
  industry: ['industry'],
  marketCap: ['market cap'],
  epsQoq: ['eps growth quarter over quarter', 'eps q/q', 'eps growth qtr over qtr'],
  salesQoq: ['sales growth quarter over quarter', 'sales q/q', 'sales growth qtr over qtr'],
  perf6m: ['performance (half year)', 'perf half y', 'performance half year'],
  sma50: ['50-day simple moving average', 'sma50'],
  sma200: ['200-day simple moving average', 'sma200'],
  high52: ['52-week high', '52w high'],
  avgVolume: ['average volume', 'avg volume'],
  price: ['price'],
  change: ['change'],
  volume: ['volume'],
  earnings: ['earnings date', 'earnings']
};
const REQUIRED = ['ticker', 'price', 'marketCap', 'avgVolume', 'perf6m', 'sma50', 'sma200', 'high52'];

export function parseScreenerCsv(text, today) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('Finviz hat keine Tabelle geliefert (leere Antwort). Token und Abo prüfen.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [key, names] of Object.entries(ALIASES)) col[key] = header.findIndex((h) => names.includes(h));
  const missing = REQUIRED.filter((k) => col[k] < 0);
  if (missing.length) {
    throw new Error(`Im Finviz-Export fehlen Spalten: ${missing.join(', ')}. Gefunden: ${rows[0].join(' | ')}`);
  }
  const get = (r, k) => (col[k] >= 0 ? r[col[k]] : undefined);
  return rows.slice(1).map((r) => ({
    ticker: String(get(r, 'ticker')).trim(),
    company: get(r, 'company')?.trim() ?? '',
    sector: get(r, 'sector')?.trim() ?? '',
    industry: get(r, 'industry')?.trim() ?? '',
    marketCap: parseNumber(get(r, 'marketCap')),   // Finviz-Export: in Dollar
    price: parseNumber(get(r, 'price')),
    changePct: parseNumber(get(r, 'change')),
    volume: parseNumber(get(r, 'volume')),
    avgVolume: parseNumber(get(r, 'avgVolume')),
    epsQoq: parseNumber(get(r, 'epsQoq')),
    salesQoq: parseNumber(get(r, 'salesQoq')),
    perf6m: parseNumber(get(r, 'perf6m')),
    distSma50: parseNumber(get(r, 'sma50')),        // % Abstand; > 0 = Kurs darüber
    distSma200: parseNumber(get(r, 'sma200')),
    distHigh52: parseNumber(get(r, 'high52')),      // % Abstand; <= 0
    earnings: parseEarningsDate(get(r, 'earnings'), today)
  })).filter((r) => r.ticker);
}

/** Wendet die Screener-Kriterien an. Gibt Treffer (sortiert nach 6-Monats-Performance) zurück. */
export function applyScreener(rows, f) {
  const fail = (v) => v == null;
  const pass = (r) => {
    const needed = [r.marketCap, r.price, r.avgVolume, r.epsQoq, r.salesQoq, r.perf6m, r.distHigh52];
    if (needed.some(fail)) return false;
    if (f.aboveSma50 && !(r.distSma50 > 0)) return false;
    if (f.aboveSma200 && !(r.distSma200 > 0)) return false;
    return (
      r.marketCap > f.minMarketCapMrd * 1e9 &&
      r.price > f.minPrice &&
      r.avgVolume > f.minAvgVolume &&
      r.epsQoq > f.minEpsGrowthQoq &&
      r.salesQoq > f.minSalesGrowthQoq &&
      r.perf6m > f.minPerf6m &&
      r.distHigh52 >= -f.maxBelow52wHighPct
    );
  };
  return rows.filter(pass).sort((a, b) => b.perf6m - a.perf6m);
}

export async function fetchScreener({ token, today, fetchImpl = fetch }) {
  const res = await fetchImpl(buildExportUrl({ token }), { headers: { 'User-Agent': 'Mozilla/5.0 aktien-app' } });
  if (!res.ok) throw new Error(`Finviz-Abruf fehlgeschlagen (HTTP ${res.status}). Token/Abo prüfen.`);
  const text = await res.text();
  if (/<html/i.test(text.slice(0, 200))) throw new Error('Finviz hat eine Webseite statt der CSV geliefert. Token ungültig oder Abo abgelaufen?');
  return parseScreenerCsv(text, today);
}

/** Kennzahlen (Firma, Branche, Quartalstermin ...) für bestimmte Ticker, auch außerhalb des Screeners. */
export async function fetchTickerRows({ token, tickers, today, fetchImpl = fetch }) {
  const res = await fetchImpl(buildExportUrl({ token, tickers }), { headers: { 'User-Agent': 'Mozilla/5.0 aktien-app' } });
  if (!res.ok) throw new Error(`Finviz-Abruf für ${tickers.length} Ticker fehlgeschlagen (HTTP ${res.status})`);
  const text = await res.text();
  if (/<html/i.test(text.slice(0, 200))) throw new Error('Finviz hat eine Webseite statt der CSV geliefert.');
  return parseScreenerCsv(text, today);
}
