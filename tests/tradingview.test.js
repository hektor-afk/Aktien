import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, parseScan, fetchScreener, fetchTickerRows, COLUMNS } from '../src/pipeline/tradingview.js';
import { applyScreener } from '../src/pipeline/screener.js';
import { DEFAULTS } from '../config/defaults.js';

// Eine Antwortzeile in der Reihenfolge von COLUMNS
const row = (o = {}) => {
  const v = { name: 'AAA', description: 'Alpha Inc', close: 110, change: 1.5, volume: 2_000_000, market_cap_basic: 12.5e9, sector: 'Technology', industry: 'Software',
    'Perf.6M': 41.3, SMA50: 100, SMA200: 90, price_52_week_high: 112, average_volume_30d_calc: 1_250_000,
    earnings_per_share_diluted_yoy_growth_fq: 35.2, total_revenue_yoy_growth_fq: 22.1, earnings_release_next_date: Date.UTC(2026, 9, 29, 20) / 1000, ...o };
  return { s: `NASDAQ:${v.name}`, d: COLUMNS.map((c) => v[c]) };
};
const ok = (rows, cols) => ({ ok: true, json: async () => ({ totalCount: rows.length, data: rows }) });

test('Anfrage: Filter kommen aus den Einstellungen', () => {
  const p = buildPayload({ settings: DEFAULTS });
  const f = (left) => p.filter.filter((x) => x.left === left);
  assert.equal(f('market_cap_basic')[0].right, 2e9);
  assert.equal(f('close').find((x) => typeof x.right === 'number').right, 10);
  assert.equal(f('average_volume_30d_calc')[0].right, 500_000);
  assert.equal(f('Perf.6M')[0].right, 10);
  assert.ok(p.filter.some((x) => x.left === 'close' && x.right === 'SMA50'));
  assert.ok(p.filter.some((x) => x.left === 'close' && x.right === 'SMA200'));
  assert.deepEqual(f('subtype')[0].right, ['common']);   // keine ETFs
  assert.equal(p.sort.sortBy, 'Perf.6M');
  const custom = buildPayload({ settings: { ...DEFAULTS, screener: { ...DEFAULTS.screener, minPrice: 25, aboveSma50: false } } });
  assert.equal(custom.filter.find((x) => x.left === 'close' && typeof x.right === 'number').right, 25);
  assert.ok(!custom.filter.some((x) => x.right === 'SMA50'));
  const t = buildPayload({ settings: DEFAULTS, tickers: ['AAPL', 'MSFT'] });
  assert.deepEqual(t.filter[0], { left: 'name', operation: 'in_range', right: ['AAPL', 'MSFT'] });
});

test('Antwort lesen: Abstände zu SMA und 52-Wochen-Hoch werden berechnet', () => {
  const [r] = parseScan({ data: [row()] }, COLUMNS);
  assert.equal(r.ticker, 'AAA'); assert.equal(r.company, 'Alpha Inc'); assert.equal(r.marketCap, 12.5e9);
  assert.ok(Math.abs(r.distSma50 - 10) < 1e-9);                 // 110 / 100
  assert.ok(Math.abs(r.distSma200 - (110 / 90 - 1) * 100) < 1e-9);
  assert.ok(Math.abs(r.distHigh52 - (110 / 112 - 1) * 100) < 1e-9);
  assert.equal(r.epsQoq, 35.2); assert.equal(r.salesQoq, 22.1); assert.equal(r.avgVolume, 1_250_000);
  assert.equal(r.earnings.date, '2026-10-29');
  assert.equal(parseScan({ data: [row({ earnings_release_next_date: null, SMA50: null })] }, COLUMNS)[0].earnings, null);
  assert.equal(parseScan({ data: [row({ SMA50: null })] }, COLUMNS)[0].distSma50, null);
  assert.throws(() => parseScan({}, COLUMNS), /unerwartete Antwort/);
});

test('Screener holen und mit den Kriterien filtern', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return ok([row(), row({ name: 'LOW', close: 8 }), row({ name: 'SLOW', 'Perf.6M': 5 })]); };
  const { rows, unavailable } = await fetchScreener({ settings: DEFAULTS, fetchImpl });
  assert.equal(sent[0].url, 'https://scanner.tradingview.com/america/scan');
  assert.deepEqual(unavailable, []);
  assert.deepEqual(applyScreener(rows, DEFAULTS.screener).map((r) => r.ticker), ['AAA']);
});

test('Unbekanntes Wachstumsfeld: wird weggelassen, Kriterium entfällt und wird gemeldet', async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    const cols = JSON.parse(init.body).columns;
    if (cols.includes('total_revenue_yoy_growth_fq')) return { ok: false, status: 400, text: async () => '{"error":"Unknown field \\"total_revenue_yoy_growth_fq\\""}' };
    return { ok: true, json: async () => ({ data: [{ s: 'NASDAQ:AAA', d: cols.map((c) => ({ name: 'AAA', close: 110, market_cap_basic: 5e9, 'Perf.6M': 30, SMA50: 100, SMA200: 90, price_52_week_high: 111, average_volume_30d_calc: 1e6, earnings_per_share_diluted_yoy_growth_fq: 20 }[c] ?? null)) }] }) };
  };
  const { rows, unavailable } = await fetchScreener({ settings: DEFAULTS, fetchImpl });
  assert.equal(calls, 2); assert.deepEqual(unavailable, ['salesQoq']);
  assert.equal(rows[0].salesQoq, null);
  assert.equal(applyScreener(rows, DEFAULTS.screener).length, 0);                                 // ohne Hinweis würde die Aktie ausgeschlossen
  assert.deepEqual(applyScreener(rows, DEFAULTS.screener, { skip: unavailable }).map((r) => r.ticker), ['AAA']); // mit Hinweis wird das Kriterium übersprungen
});

test('Wichtiges Feld unbekannt, Sperre, Limit: klare Fehlermeldungen', async () => {
  const fail = (status, text) => async () => ({ ok: false, status, text: async () => text });
  await assert.rejects(fetchScreener({ settings: DEFAULTS, fetchImpl: fail(400, 'Unknown field "Perf.6M"') }), /Feld "Perf.6M" nicht mehr/);
  await assert.rejects(fetchScreener({ settings: DEFAULTS, fetchImpl: fail(403, '') }), /403/);
  await assert.rejects(fetchScreener({ settings: DEFAULTS, fetchImpl: fail(429, '') }), /429/);
  await assert.rejects(fetchScreener({ settings: DEFAULTS, fetchImpl: fail(500, 'boom') }), /HTTP 500/);
});

test('Durchschnittsvolumen-Feld fehlt: Ersatzfeld wird genommen', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    const cols = JSON.parse(init.body).columns; seen.push(cols);
    if (cols.includes('average_volume_30d_calc')) return { ok: false, status: 400, text: async () => 'Unknown field "average_volume_30d_calc"' };
    return { ok: true, json: async () => ({ data: [{ s: 'X:AAA', d: cols.map((c) => ({ name: 'AAA', average_volume_60d_calc: 777 }[c] ?? null)) }] }) };
  };
  const { rows } = await fetchTickerRows({ settings: DEFAULTS, tickers: ['AAA'], fetchImpl });
  assert.equal(rows[0].avgVolume, 777); assert.ok(seen[1].includes('average_volume_60d_calc'));
});

test('Netzwerkfehler: verständliche Meldung', async () => {
  await assert.rejects(fetchScreener({ settings: DEFAULTS, fetchImpl: async () => { throw new TypeError('fetch failed'); } }), /nicht erreichbar/);
});
