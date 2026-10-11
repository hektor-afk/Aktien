import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseNumber, parseScreenerCsv, applyScreener, buildExportUrl } from '../src/pipeline/finviz.js';
import { DEFAULTS } from '../config/defaults.js';

const CSV = `"Ticker","Company","Sector","Industry","Market Cap","EPS Growth Quarter Over Quarter","Sales Growth Quarter Over Quarter","Performance (Half Year)","50-Day Simple Moving Average","200-Day Simple Moving Average","52-Week High","Average Volume","Price","Change","Volume","Earnings Date"
"AAA","Alpha, Inc.","Technology","Software","12500000000","35.20%","22.10%","41.30%","6.10%","18.40%","-3.20%","1,250,000","85.10","1.50%","1,800,000","10/29/2026 AMC"
"BBB","Beta Corp","Healthcare","Biotech","1800000000","50%","30%","20%","3%","9%","-2%","900000","40","0.1%","500000","-"
"CCC","Gamma","Energy","Oil","5.2B","12%","11%","15%","2%","5%","-12.5%","2.1M","25","-0.5%","1000000","Nov 04 BMO"
"DDD","Delta","Energy","Oil","5.2B","12%","11%","15%","-1%","5%","-4%","2.1M","25","-0.5%","1000000","-"
"EEE","Eps","Energy","Oil","5.2B","-","11%","15%","2%","5%","-4%","2.1M","25","-0.5%","1000000","-"`;

test('CSV: Anführungszeichen und Kommas in Feldern', () => {
  const rows = parseCsv('a,"b,c","d ""x"""\n1,2,3\n');
  assert.deepEqual(rows, [['a', 'b,c', 'd "x"'], ['1', '2', '3']]);
});

test('Zahlen: K/M/B, Prozent, Tausenderpunkte, Strich', () => {
  assert.equal(parseNumber('2.1M'), 2_100_000);
  assert.equal(parseNumber('5.2B'), 5.2e9);
  assert.equal(parseNumber('-3.20%'), -3.2);
  assert.equal(parseNumber('1,250,000'), 1_250_000);
  assert.equal(parseNumber('-'), null);
  assert.equal(parseNumber(''), null);
});

test('Screener-Export lesen und filtern (Standardkriterien)', () => {
  const rows = parseScreenerCsv(CSV, '2026-10-01');
  assert.equal(rows.length, 5);
  assert.equal(rows[0].marketCap, 12.5e9);
  assert.equal(rows[0].earnings.date, '2026-10-29');
  const hits = applyScreener(rows, DEFAULTS.screener);
  // AAA ok; BBB Marktkap. < 2 Mrd.; CCC 12,5 % unter 52W-Hoch; DDD unter SMA 50; EEE EPS unbekannt
  assert.deepEqual(hits.map((r) => r.ticker), ['AAA']);
  const loose = applyScreener(rows, { ...DEFAULTS.screener, maxBelow52wHighPct: 15, minMarketCapMrd: 1 });
  assert.deepEqual(loose.map((r) => r.ticker), ['AAA', 'BBB', 'CCC'].sort((a, b) => rows.find((r) => r.ticker === b).perf6m - rows.find((r) => r.ticker === a).perf6m));
});

test('Sortierung nach 6-Monats-Performance, absteigend', () => {
  const rows = parseScreenerCsv(CSV, '2026-10-01');
  const hits = applyScreener(rows, { ...DEFAULTS.screener, maxBelow52wHighPct: 15, minMarketCapMrd: 1 });
  assert.deepEqual(hits.map((r) => r.perf6m), [41.3, 20, 15]);
});

test('fehlende Spalten ergeben eine klare Fehlermeldung', () => {
  assert.throws(() => parseScreenerCsv('"Ticker","Company"\n"A","B"', '2026-10-01'), /fehlen Spalten/);
  assert.throws(() => parseScreenerCsv('', '2026-10-01'), /keine Tabelle/);
});

test('Export-URL braucht einen Token', () => {
  assert.throws(() => buildExportUrl({ token: '' }), /FINVIZ_TOKEN/);
  assert.match(buildExportUrl({ token: 'abc' }), /auth=abc/);
});

import { fetchTickerRows } from '../src/pipeline/finviz.js';
test('Gezielte Abfrage einzelner Ticker (Watchlist)', async () => {
  const u = new URL(buildExportUrl({ token: 'abc', tickers: ['AAPL', 'MSFT'] }));
  assert.equal(u.searchParams.get('t'), 'AAPL,MSFT'); assert.equal(u.searchParams.get('f'), null);
  let called;
  const rows = await fetchTickerRows({ token: 'abc', tickers: ['AAA'], today: '2026-10-01', fetchImpl: async (url) => { called = url; return { ok: true, text: async () => CSV }; } });
  assert.match(called, /t=AAA/); assert.equal(rows.length, 5);
  await assert.rejects(fetchTickerRows({ token: 'abc', tickers: ['A'], today: '2026-10-01', fetchImpl: async () => ({ ok: false, status: 403 }) }), /403/);
});
