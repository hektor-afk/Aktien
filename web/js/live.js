// Live-Kurse: holt für Watchlist und Positionen die aktuellen Kerzen direkt von Twelve Data (im Browser),
// rechnet Signal, Chart-Daten und Marktampel mit denselben Regeln wie das Nacht-Skript neu und hält alles aktuell.
// Der Schlüssel bleibt nur auf diesem Gerät gespeichert.
import { store, save } from './ui.js';
import { analyseStock } from '../core/analyse.js';
import { marketStatus } from '../core/market.js';
import { isSessionComplete, isMarketOpen, isoDate } from '../core/dates.js';
import { loadData } from './data.js';
import { DEFAULTS, mergeSettings } from '../core/defaults.js';

const PER_MINUTE = 8;        // Limit der kostenlosen Stufe
const DAILY_CAP = 750;       // Sicherheitsabstand zum Tageslimit (800)
const STALE_OPEN_MIN = 20;   // während der US-Börse höchstens alle 20 Minuten
const STALE_CLOSED_MIN = 180;

const K = { key: 'tdkey', cache: 'live', usage: 'tdusage', meta: 'livemeta' };
let cache = store(K.cache, {}) || {};
let meta = store(K.meta, {}) || {};
let running = null;

export const getKey = () => store(K.key, '') || '';
export const setKey = (k) => save(K.key, String(k).trim());
export const liveStock = (t) => cache[t]?.stock ?? null;
export const liveTickers = () => Object.keys(cache).filter((t) => t !== '_BENCH' && cache[t]?.stock);
export const liveBars = (t) => (cache[t]?.bars ?? []).map(([t_, o, h, l, c, v]) => ({ t: t_, o, h, l, c, v }));
export const liveMeta = () => ({ ...meta, creditsToday: usage().n, creditsCap: DAILY_CAP, hasKey: Boolean(getKey()) });
export const clearLive = () => { cache = {}; meta = {}; save(K.cache, {}); save(K.meta, {}); };

function usage() {
  const u = store(K.usage, null);
  return u?.date === isoDate(new Date()) ? u : { date: isoDate(new Date()), n: 0 };
}
function useCredit() {
  const u = usage();
  if (u.n >= DAILY_CAP) throw new Error(`Tageslimit der Live-Abrufe erreicht (${DAILY_CAP}). Morgen geht es weiter.`);
  save(K.usage, { ...u, n: u.n + 1 });
}

const stamps = [];
async function throttle() {
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
  if (stamps.length >= PER_MINUTE) { await new Promise((r) => setTimeout(r, 60_000 - (now - stamps[0]) + 300)); return throttle(); }
  stamps.push(Date.now());
}

async function td(path, params) {
  const key = getKey();
  if (!key) throw new Error('Kein Twelve-Data-Schlüssel hinterlegt (Einstellungen → Live-Kurse).');
  await throttle(); useCredit();
  const res = await fetch(`https://api.twelvedata.com/${path}?${new URLSearchParams({ ...params, apikey: key })}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.status === 'error') { const e = new Error(j.message || `HTTP ${res.status}`); e.code = j.code ?? res.status; throw e; }
  return j;
}

async function fetchBars(symbol) {
  const j = await td('time_series', { symbol, interval: '1day', outputsize: '320', order: 'ASC' });
  if (!Array.isArray(j.values) || !j.values.length) throw new Error(`Keine Kursdaten für ${symbol}`);
  return j.values.map((v) => ({ t: v.datetime.slice(0, 10), o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +v.volume }));
}

const compact = (bars) => bars.slice(-300).map((b) => [b.t, b.o, b.h, b.l, b.c, b.v]);
const emit = (detail) => document.dispatchEvent(new CustomEvent('live-progress', { detail }));

export function isStale(ticker, now = new Date()) {
  const at = cache[ticker]?.at;
  if (!at) return true;
  const ageMin = (now - Date.parse(at)) / 60_000;
  return ageMin > (isMarketOpen(now) ? STALE_OPEN_MIN : STALE_CLOSED_MIN);
}

/**
 * @param d      geladene Snapshot-Daten (settings, market werden benutzt/aktualisiert)
 * @param items  [{ ticker, snap, earnings }]  snap = Snapshot-Daten der Aktie (falls vorhanden), earnings = manueller Termin
 */
export function refresh(d, items, { force = false, now = new Date() } = {}) {
  if (running) return running;
  if (!getKey()) return Promise.resolve({ skipped: 'kein Schlüssel', updated: 0, errors: [] });
  const due = items.filter((i) => force || isStale(i.ticker, now));
  if (!due.length) return Promise.resolve({ skipped: 'aktuell', updated: 0, errors: [] });

  running = (async () => {
    const errors = [];
    const settings = mergeSettings(DEFAULTS, d.settings || {});
    let done = 0, updated = 0;
    emit({ running: true, done, total: due.length });
    try {
      // Markt-Index zuerst: Marktampel und relative Stärke
      let bench;
      try {
        const full = await fetchBars(settings.market.benchmark);
        const completeBars = isSessionComplete(full[full.length - 1].t, now) ? full : full.slice(0, -1);
        cache._BENCH = { at: now.toISOString(), bars: compact(completeBars) };
        bench = completeBars;
        d.market = { ...marketStatus(completeBars), live: true };
      } catch (e) {
        if ([401, 403, 429].includes(Number(e.code))) throw e;
        bench = (cache._BENCH?.bars ?? null)?.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }))
          ?? (await loadData('bars/_BENCH').then((a) => a.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }))).catch(() => []));
        errors.push(`Marktdaten: ${e.message}`);
      }

      for (const it of due) {
        try {
          const bars = await fetchBars(it.ticker);
          let company = it.snap?.company ?? cache[it.ticker]?.name;
          if (!company || company === it.ticker) {
            try { company = (await td('quote', { symbol: it.ticker })).name || it.ticker; } catch { company = it.ticker; }
          }
          const partial = !isSessionComplete(bars[bars.length - 1].t, now);
          const stock = analyseStock({
            bars, benchBars: bench, settings, today: isoDate(now), partial,
            meta: {
              ticker: it.ticker, company,
              sector: it.snap?.sector ?? '', industry: it.snap?.industry ?? '', inScreener: it.snap?.inScreener ?? false,
              earnings: it.earnings ? { date: it.earnings, time: null } : it.snap?.earnings ?? null,
              marketCap: it.snap?.marketCap ?? null, avgVolume: it.snap?.avgVolume ?? null, perf6m: bars.length > 126 ? (bars[bars.length - 1].c / bars[bars.length - 127].c - 1) * 100 : null,
              epsQoq: it.snap?.epsQoq ?? null, salesQoq: it.snap?.salesQoq ?? null
            }
          });
          stock.live = { at: now.toISOString(), partial };
          cache[it.ticker] = { at: now.toISOString(), name: company, bars: compact(bars), stock };
          updated++;
          save(K.cache, cache);
        } catch (e) {
          if ([401, 403, 429].includes(Number(e.code)) || /Tageslimit/.test(e.message)) throw e;
          errors.push(`${it.ticker}: ${e.message}`);
        }
        emit({ running: true, done: ++done, total: due.length });
      }
    } catch (e) {
      errors.push(e.message);
    }
    meta = { lastRun: new Date().toISOString(), lastError: errors[0] ?? null, lastUpdated: updated };
    save(K.meta, meta);
    running = null;
    emit({ running: false, done, total: due.length, errors, updated });
    return { updated, errors };
  })();
  return running;
}

/** Schlüssel prüfen (kostet 1 Abruf). */
export async function testKey() {
  const j = await td('quote', { symbol: 'SPY' });
  return j.name || 'SPY';
}
