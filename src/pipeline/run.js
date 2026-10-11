// Nacht-Skript: holt Daten, wendet die Kriterien an und speichert das Ergebnis in web/data/.
//   npm run demo      -> mit erfundenen Demo-Daten (kein Konto nötig)
//   npm run update    -> echte Daten (Finviz + Twelve Data, Schlüssel in .env)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, mergeSettings } from '../../config/defaults.js';
import { fetchScreener, applyScreener } from './finviz.js';
import { twelveDataProvider } from './prices.js';
import { demoUniverse, genMarket } from './demo.js';
import { evaluateSignal } from '../../web/core/signal.js';
import { relativeStrength } from '../../web/core/relstrength.js';
import { checkDataQuality } from '../../web/core/quality.js';
import { marketStatus } from '../../web/core/market.js';
import { compareStocks } from '../../web/core/rank.js';
import { fetchUsdEur } from './fx.js';
import { buildNotifications, sendNotifications } from './notify.js';
import { expectedTradingDate, berlinParts, lastWeekdayOnOrBefore } from '../../web/core/dates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = new Set(process.argv.slice(2));
const log = (...a) => console.log('[Aktien]', ...a);

try { process.loadEnvFile(join(ROOT, '.env')); } catch { /* .env ist optional (Demo) */ }

function loadSettings() {
  const file = join(ROOT, 'config', 'settings.json');
  return existsSync(file) ? mergeSettings(DEFAULTS, JSON.parse(readFileSync(file, 'utf8'))) : DEFAULTS;
}

function loadPositions() {
  // Datei = die Sicherung, die du in der App unter Einstellungen exportierst (config/portfolio.json)
  const file = join(ROOT, 'config', 'portfolio.json');
  if (!existsSync(file)) return { trades: [], watchlist: [] };
  try { const o = JSON.parse(readFileSync(file, 'utf8')); return { trades: o.trades || [], watchlist: o.watchlist || [] }; }
  catch { return { trades: [], watchlist: [], broken: true }; }
}

async function loadPrevious(outDir) {
  const site = process.env.SITE_URL;
  try {
    if (site) { const r = await fetch(`${site.replace(/\/$/, '')}/data/latest.json`); if (r.ok) return await r.json(); }
    const f = join(outDir, 'latest.json');
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  } catch { return null; }
}

const compactBars = (bars) => bars.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v]);

export async function build({ demo, weakMarket, settings, outDir, now = new Date(), positions = { trades: [], watchlist: [] } }) {
  const messages = [];
  const today = berlinParts(now).date;
  const expected = demo ? lastWeekdayOnOrBefore(today) : expectedTradingDate(now);
  let rows, benchBars, provider, barsOf;

  if (demo) {
    const uni = demoUniverse({ endDate: expected });
    rows = uni.rows;
    benchBars = genMarket({ endDate: expected, weak: weakMarket });
    barsOf = async (t) => uni.bars[t];
    messages.push({ level: 'info', text: 'DEMO-MODUS: Alle Aktien und Kurse sind erfunden. Nur zum Ausprobieren.' });
  } else {
    rows = await fetchScreener({ token: process.env.FINVIZ_TOKEN, today });
    provider = twelveDataProvider({ apiKey: process.env.TWELVEDATA_API_KEY, log });
    benchBars = await provider.fetchBars(settings.market.benchmark);
    barsOf = (t) => provider.fetchBars(t);
  }

  const hits = applyScreener(rows, settings.screener);
  const candidates = hits.slice(0, settings.screener.maxCandidates);
  log(`${rows.length} Aktien geladen, ${hits.length} erfüllen den Screener, ${candidates.length} werden geprüft.`);
  if (hits.length > candidates.length) {
    messages.push({ level: 'info', text: `Nur die ${candidates.length} Aktien mit der besten 6-Monats-Performance wurden geprüft (von ${hits.length}).` });
  }

  const asOf = benchBars[benchBars.length - 1].t;
  const market = marketStatus(benchBars, settings.market);
  const stocks = [];
  const failed = [];
  rmSync(join(outDir, 'bars'), { recursive: true, force: true });
  mkdirSync(join(outDir, 'bars'), { recursive: true });

  const analyse = async (row, inScreener) => {
    const bars = await barsOf(row.ticker);
    if (!bars?.length) throw new Error('keine Kursdaten');
    const quality = checkDataQuality(bars, { settings, expectedDate: expected, referencePrice: row.price });
    const signal = evaluateSignal(bars, { settings, today: asOf, earningsDate: row.earnings?.date ?? null });
    const rs = relativeStrength(bars, benchBars, { days3: settings.signal.rsDays3m, days6: settings.signal.rsDays6m });
    const last = bars[bars.length - 1], prev = bars[bars.length - 2];
    writeFileSync(join(outDir, 'bars', `${row.ticker}.json`), JSON.stringify(compactBars(bars.slice(-300))));
    return {
      ticker: row.ticker, company: row.company || row.ticker, sector: row.sector || '', industry: row.industry || '',
      inScreener, price: last.c, changePct: prev ? (last.c / prev.c - 1) * 100 : null, priceDate: last.t,
      marketCap: row.marketCap ?? null, avgVolume: row.avgVolume ?? null,
      perf6m: row.perf6m ?? (bars.length > 126 ? (last.c / bars[bars.length - 127].c - 1) * 100 : null),
      epsQoq: row.epsQoq ?? null, salesQoq: row.salesQoq ?? null, earnings: row.earnings ?? null,
      signal, rs, quality, spark: bars.slice(-60).map((b) => b.c)
    };
  };

  for (const row of candidates) {
    try { stocks.push(await analyse(row, true)); }
    catch (e) { failed.push(row.ticker); log(`Fehler bei ${row.ticker}: ${e.message}`); }
  }

  // Positionen und Watchlist: immer mitladen, auch wenn der Screener sie aussortiert hat
  const tracked = [];
  const wanted = [...new Set([...(settings.trackTickers || []), ...positions.trades.filter((t) => t.status === 'open').map((t) => t.ticker), ...positions.watchlist.map((w) => w.ticker)].map((t) => String(t).trim().toUpperCase()).filter(Boolean))]
    .filter((t) => !stocks.some((s) => s.ticker === t));
  for (const t of wanted) {
    try { tracked.push(await analyse(rows.find((r) => r.ticker === t) ?? { ticker: t }, false)); }
    catch (e) { failed.push(t); log(`Fehler bei ${t}: ${e.message}`); }
  }
  stocks.sort(compareStocks);
  writeFileSync(join(outDir, 'bars', '_BENCH.json'), JSON.stringify(compactBars(benchBars.slice(-300))));

  if (failed.length) messages.push({ level: 'warn', text: `Für ${failed.length} Aktie(n) fehlen Kursdaten: ${failed.join(', ')}.` });
  if (asOf < expected) messages.push({ level: 'warn', text: `Die neuesten Kurse sind vom ${asOf}, erwartet wäre der ${expected} (Feiertag oder Datenverzug).` });

  let fx = null;
  if (demo) fx = { usdEur: 0.92, date: asOf, source: 'Demo-Wert' };
  else {
    try { fx = await fetchUsdEur(); }
    catch (e) { messages.push({ level: 'warn', text: `Euro-Kurs nicht verfügbar (${e.message}). Euro-Anzeige ist aus.` }); }
  }

  return {
    meta: {
      generatedAt: now.toISOString(), asOf, demo,
      status: failed.length ? 'teilweise' : 'ok', messages,
      sources: { screener: demo ? 'Demo-Daten' : 'Finviz Elite', prices: demo ? 'Demo-Daten' : provider.name, benchmark: `${settings.market.benchmark} (ETF auf den S&P 500)` },
      funnel: { loaded: rows.length, passed: hits.length, analysed: stocks.length }
    },
    market, fx,
    settings: { screener: settings.screener, signal: settings.signal, risk: settings.risk, trackTickers: settings.trackTickers },
    stocks, tracked
  };
}

async function main() {
  const outDir = join(ROOT, 'web', 'data');
  mkdirSync(outDir, { recursive: true });
  const demo = args.has('--demo');
  const settings = loadSettings();
  if (demo && !settings.trackTickers.length) settings.trackTickers = ['SLOW', 'CHEP'];
  const positions = loadPositions();
  const previous = demo ? null : await loadPrevious(outDir);
  if (positions.broken) log('Warnung: config/portfolio.json ist nicht lesbar und wird ignoriert.');
  let snapshot;
  try {
    snapshot = await build({ demo, weakMarket: args.has('--weak-market'), settings, outDir, positions });
  } catch (e) {
    // Lieber eine klare Fehlermeldung als alte Zahlen anzeigen.
    log('FEHLER:', e.message);
    snapshot = {
      meta: { generatedAt: new Date().toISOString(), asOf: null, demo, status: 'fehler',
        messages: [{ level: 'error', text: `Datenabruf fehlgeschlagen: ${e.message}` }], sources: {}, funnel: null },
      market: null, fx: null, settings: null, stocks: [], tracked: []
    };
    process.exitCode = 1;
  }
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify(snapshot));
  log(`Gespeichert: ${snapshot.stocks.length} Aktien, Status "${snapshot.meta.status}".`);

  if (!demo) {
    const list = buildNotifications({ snapshot, previous, positions: positions.trades, settings, siteUrl: process.env.SITE_URL });
    const sent = await sendNotifications(list, { topic: process.env.NTFY_TOPIC, server: process.env.NTFY_SERVER || undefined, email: process.env.NOTIFY_EMAIL || undefined, log });
    log(`Benachrichtigungen: ${sent} von ${list.length} gesendet.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
