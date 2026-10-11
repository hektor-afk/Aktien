// Screener-Daten vom TradingView-Scanner (kostenlos, ohne Schlüssel). Inoffizielle Schnittstelle:
// Feldnamen können sich ändern. Unbekannte Felder werden erkannt, gemeldet und umgangen.
import { isoDate } from '../../web/core/dates.js';

const URL_SCAN = 'https://scanner.tradingview.com/america/scan';

// Spalten, die wir anfordern (Reihenfolge = Reihenfolge der Antwort).
// Hier ändern, falls TradingView ein Feld umbenennt.
export const COLUMNS = [
  'name', 'description', 'close', 'change', 'volume', 'market_cap_basic', 'sector', 'industry',
  'Perf.6M', 'SMA50', 'SMA200', 'price_52_week_high', 'average_volume_30d_calc',
  'earnings_per_share_diluted_yoy_growth_fq', 'total_revenue_yoy_growth_fq', 'earnings_release_next_date'
];

// Wenn ein Feld fehlt: was ist verzichtbar, und welches Kriterium entfällt dann?
const OPTIONAL = {
  description: null, sector: null, industry: null, change: null, volume: null, earnings_release_next_date: null,
  earnings_per_share_diluted_yoy_growth_fq: 'epsQoq', total_revenue_yoy_growth_fq: 'salesQoq'
};
const ALTERNATIVES = { average_volume_30d_calc: ['average_volume_60d_calc', 'average_volume_90d_calc'] };

/** Anfrage bauen. Mit `tickers` werden gezielt diese Aktien abgefragt (Watchlist/Positionen), sonst der Screener. */
export function buildPayload({ settings, columns = COLUMNS, tickers = null, limit = 300 }) {
  const base = {
    markets: ['america'],
    symbols: { query: { types: [] }, tickers: [] },
    options: { lang: 'en' },
    columns,
    sort: { sortBy: 'Perf.6M', sortOrder: 'desc' },
    range: [0, tickers ? Math.max(tickers.length * 3, 30) : limit]
  };
  if (tickers?.length) {
    return { ...base, filter: [{ left: 'name', operation: 'in_range', right: tickers }, { left: 'type', operation: 'in_range', right: ['stock'] }] };
  }
  const f = settings.screener;
  const filter = [
    { left: 'type', operation: 'in_range', right: ['stock'] },
    { left: 'subtype', operation: 'in_range', right: ['common'] },           // keine ETFs, Fonds, Vorzugsaktien
    { left: 'exchange', operation: 'in_range', right: ['NYSE', 'NASDAQ', 'AMEX'] },
    { left: 'market_cap_basic', operation: 'greater', right: f.minMarketCapMrd * 1e9 },
    { left: 'close', operation: 'greater', right: f.minPrice },
    { left: 'Perf.6M', operation: 'greater', right: f.minPerf6m }
  ];
  if (columns.includes('average_volume_30d_calc')) filter.push({ left: 'average_volume_30d_calc', operation: 'greater', right: f.minAvgVolume });
  if (f.aboveSma50) filter.push({ left: 'close', operation: 'greater', right: 'SMA50' });
  if (f.aboveSma200) filter.push({ left: 'close', operation: 'greater', right: 'SMA200' });
  return { ...base, filter };
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const dist = (a, b) => (num(a) != null && num(b) ? (a / b - 1) * 100 : null);
const dateFromUnix = (s) => (num(s) ? { date: isoDate(new Date(s * 1000)).replace(/^(\d{4}-\d{2}-\d{2}).*$/, '$1'), time: null } : null);

/** Antwort von TradingView in unser Zeilenformat umwandeln. */
export function parseScan(json, columns) {
  if (!json || !Array.isArray(json.data)) throw new Error('TradingView hat eine unerwartete Antwort geliefert.');
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  return json.data.map((r) => {
    const v = (c) => (c in idx ? r.d[idx[c]] : null);
    const price = num(v('close'));
    const earnTs = v('earnings_release_next_date');
    return {
      ticker: String(v('name') ?? r.s?.split(':')[1] ?? '').trim(),
      company: v('description') ?? '',
      sector: v('sector') ?? '',
      industry: v('industry') ?? '',
      marketCap: num(v('market_cap_basic')),
      price,
      changePct: num(v('change')),
      volume: num(v('volume')),
      avgVolume: num(v('average_volume_30d_calc') ?? v('average_volume_60d_calc') ?? v('average_volume_90d_calc')),
      epsQoq: num(v('earnings_per_share_diluted_yoy_growth_fq')),
      salesQoq: num(v('total_revenue_yoy_growth_fq')),
      perf6m: num(v('Perf.6M')),
      distSma50: dist(price, v('SMA50')),
      distSma200: dist(price, v('SMA200')),
      distHigh52: dist(price, v('price_52_week_high')),
      earnings: dateFromUnix(earnTs)
    };
  }).filter((r) => r.ticker);
}

/** Anfrage senden. Meldet TradingView ein unbekanntes Feld, wird es ersetzt oder weggelassen (max. 6 Versuche). */
async function scan({ settings, tickers, fetchImpl = fetch }) {
  let columns = [...COLUMNS];
  const unavailable = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    let res;
    try {
      res = await fetchImpl(URL_SCAN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://www.tradingview.com', 'User-Agent': 'Mozilla/5.0 aktien-app' },
        body: JSON.stringify(buildPayload({ settings, columns, tickers }))
      });
    } catch (e) {
      throw new Error(`TradingView ist nicht erreichbar (${e.cause?.code ?? e.message}). Internetverbindung oder Sperre prüfen.`);
    }
    if (res.ok) return { rows: parseScan(await res.json(), columns), unavailable };
    const body = await res.text().catch(() => '');
    const bad = /(?:field|column|symbol)s?[^A-Za-z0-9_.]{0,6}([A-Za-z0-9_.]+)/i.exec(body)?.[1];
    const col = bad && columns.find((c) => c === bad);
    if (res.status === 400 && col) {
      if (ALTERNATIVES[col]?.length) { columns = columns.map((c) => (c === col ? ALTERNATIVES[col][0] : c)); ALTERNATIVES[col] = ALTERNATIVES[col].slice(1); continue; }
      if (col in OPTIONAL) { columns = columns.filter((c) => c !== col); if (OPTIONAL[col]) unavailable.push(OPTIONAL[col]); continue; }
      throw new Error(`TradingView kennt das Feld "${col}" nicht mehr. Bitte COLUMNS in src/pipeline/tradingview.js anpassen.`);
    }
    if (res.status === 429) throw new Error('TradingView begrenzt die Abrufe gerade (HTTP 429). Später erneut versuchen.');
    if (res.status === 403) throw new Error('TradingView hat den Abruf abgelehnt (HTTP 403). Eventuell werden Server dieses Anbieters blockiert.');
    throw new Error(`TradingView-Abruf fehlgeschlagen (HTTP ${res.status}). ${body.slice(0, 160)}`);
  }
  throw new Error('TradingView-Abruf nach mehreren Versuchen fehlgeschlagen (Feldnamen geändert?).');
}

export const fetchScreener = ({ settings, fetchImpl }) => scan({ settings, fetchImpl });
export const fetchTickerRows = ({ settings, tickers, fetchImpl }) => scan({ settings, tickers, fetchImpl });
