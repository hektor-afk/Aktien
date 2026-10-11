// Demo-Modus: erfundene Aktien mit künstlichen Kursen. Nur zum Ausprobieren der App –
// KEINE echten Daten. Jede Aktie zeigt einen anderen Zustand der Kaufsignal-Ampel.
import { addDays, isWeekend } from '../../web/core/dates.js';
import { sma, highest } from '../../web/core/indicators.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

function tradingDays(endIso, count) {
  const days = [];
  for (let d = endIso; days.length < count; d = addDays(d, -1)) if (!isWeekend(d)) days.unshift(d);
  return days;
}

const round = (x) => Math.round(x * 100) / 100;
function bar(t, prevClose, close, r, volume, wick = 0.006) {
  const open = prevClose * (1 + gauss(r) * 0.003);
  const high = Math.max(open, close) * (1 + r() * wick);
  const low = Math.min(open, close) * (1 - r() * wick);
  return { t, o: round(open), h: round(high), l: round(low), c: round(close), v: Math.round(volume) };
}

/** Kerzen für ein Szenario erzeugen. */
export function genBars({ seed, endDate, scenario, startPrice = 40, avgVol = 1_500_000, count = 320 }) {
  const r = rng(seed);
  const days = tradingDays(endDate, count);
  const bars = [];
  let price = startPrice;
  const drift = scenario === 'down' ? -0.002 : 0.0032;
  const trendBars = count - (scenario === 'pullback' ? 9 : 26);
  for (let i = 0; i < trendBars; i++) {
    const next = price * Math.exp(drift + gauss(r) * 0.011);
    bars.push(bar(days[i], price, next, r, avgVol * (0.8 + r() * 0.4)));
    price = next;
  }

  if (scenario === 'pullback') {
    // Abstieg bis knapp an den SMA 50, dann grüne Umkehrkerze mit Volumen
    const closes = () => bars.map((b) => b.c);
    const target = sma(closes(), 50) * 1.006;
    const steps = 7;
    for (let k = 1; k <= steps; k++) {
      const next = price + (target - price) / (steps - k + 1) * (k === steps ? 1 : 1) * (k === steps ? 1 : 0.85);
      const p = k === steps ? target : next;
      bars.push(bar(days[trendBars + k - 1], price, p, r, avgVol * 0.8));
      price = p;
    }
    const prev = bars[bars.length - 1];
    const c = prev.h * 1.012;
    const o = prev.c * 1.001;
    const h = c * 1.002;
    const l = Math.min(o, prev.l * 1.004);
    bars.push({ t: days[count - 1], o: round(o), h: round(h), l: round(l), c: round(c), v: Math.round(avgVol * 2.0) });
    return bars;
  }

  // Seitwärtsphase ("Basis") unter einem Hoch
  const peak = price;
  for (let i = trendBars; i < count - 1; i++) {
    const phase = i - trendBars;
    const dip = phase < 10 ? 0.995 - phase * 0.0035 : 0.968 + Math.min(phase - 10, 14) * 0.0015;
    const target = peak * (phase === 10 ? 1.0 : dip) * (1 + gauss(r) * 0.004);
    bars.push(bar(days[i], price, target, r, avgVol * (0.6 + r() * 0.35), 0.004));
    price = target;
  }

  const lookbackHigh = highest(bars.map((b) => b.h), bars.length - 30, bars.length - 1);
  const prevClose = bars[bars.length - 1].c;
  const t = days[count - 1];
  const make = (cRel, volMul, { oRel = 0.994, closeAtHigh = true } = {}) => {
    const c = lookbackHigh * cRel;
    const o = Math.min(c * 0.99, lookbackHigh * oRel);
    const h = closeAtHigh ? c * 1.002 : c * 1.02;
    const l = o * 0.994;
    return { t, o: round(o), h: round(h), l: round(l), c: round(c), v: Math.round(avgVol * volMul) };
  };

  const last = {
    signal: () => make(1.025, 2.2),
    lowvol: () => make(1.02, 1.0),
    earnings: () => make(1.025, 2.0),
    extended: () => make(1.085, 2.4, { oRel: 1.06 }),
    below: () => make(0.985, 0.9, { oRel: 0.972 }),
    nearly: () => make(0.99, 1.1, { oRel: 0.975 }),
    wicky: () => make(1.02, 2.0, { closeAtHigh: false }),
    down: () => ({ t, o: round(prevClose * 1.002), h: round(prevClose * 1.01), l: round(prevClose * 0.985), c: round(prevClose * 0.99), v: Math.round(avgVol) })
  }[scenario]();
  if (scenario === 'wicky') { last.h = round(last.c * 1.03); }
  bars.push(last);
  return bars;
}

/** Unbereinigter Aktiensplit 2:1 zum Testen der Datenwarnung (Kurse davor ×2). */
export function injectUnadjustedSplit(bars, index = 150) {
  return bars.map((b, i) => (i < index ? { ...b, o: round(b.o * 2), h: round(b.h * 2), l: round(b.l * 2), c: round(b.c * 2) } : b));
}

export function genMarket({ endDate, weak = false }) {
  const bars = genBars({ seed: 7, endDate, scenario: 'signal', startPrice: 380, avgVol: 70_000_000 });
  if (!weak) return bars.map((b) => ({ ...b, h: round(b.h), v: Math.round(b.v * 0.9) }));
  // Schwacher Markt: letzte 45 Tage deutlich fallen lassen, bis unter den SMA 200
  const n = bars.length;
  const out = bars.slice();
  let k = 1;
  for (let i = n - 45; i < n; i++, k++) {
    const f = 1 - 0.0075 * k;
    const b = out[i];
    out[i] = { ...b, o: round(b.o * f), h: round(b.h * f), l: round(b.l * f), c: round(b.c * f) };
  }
  return out;
}

const U = [
  // ticker, Firma, Sektor, Branche, Szenario, Startkurs, Ø-Volumen, Berichtstermin in Tagen
  ['LUMR', 'Lumora Software', 'Technology', 'Software - Application', 'signal', 42, 2_100_000, 41],
  ['KRAV', 'Kravix Semiconductor', 'Technology', 'Semiconductors', 'signal', 55, 4_800_000, 33],
  ['ORBX', 'Orbitrax Defense', 'Industrials', 'Aerospace & Defense', 'signal', 61, 1_300_000, 52],
  ['HELV', 'Helvion Medical', 'Healthcare', 'Medical Devices', 'pullback', 48, 1_150_000, 38],
  ['ZENT', 'Zenith Cloudworks', 'Technology', 'Software - Infrastructure', 'earnings', 70, 2_600_000, 6],
  ['VANT', 'Vantage Robotics', 'Industrials', 'Specialty Industrial Machinery', 'lowvol', 33, 3_200_000, 45],
  ['QUIL', 'Quill Payments', 'Financial', 'Credit Services', 'lowvol', 58, 1_900_000, 29],
  ['BRNT', 'Brenton Energy Partners', 'Energy', 'Oil & Gas E&P', 'extended', 36, 2_700_000, 47],
  ['SOLQ', 'Solquest Renewables', 'Utilities', 'Utilities - Renewable', 'extended', 27, 5_100_000, 36],
  ['TRVN', 'Travion Online', 'Consumer Cyclical', 'Internet Retail', 'below', 80, 2_300_000, 31],
  ['MYRA', 'Myra Biosciences', 'Healthcare', 'Biotechnology', 'nearly', 22, 1_700_000, 60],
  ['DELT', 'Deltaform Materials', 'Basic Materials', 'Specialty Chemicals', 'below', 66, 780_000, 43],
  ['PRXM', 'Proxima Networks', 'Technology', 'Communication Equipment', 'nearly', 45, 1_450_000, 48],
  ['KOVA', 'Kovalent Capital', 'Financial', 'Capital Markets', 'wicky', 52, 1_050_000, 35],
  ['NIMB', 'Nimbus Streaming', 'Communication Services', 'Internet Content & Information', 'signal', 31, 6_400_000, null],
  ['GRAV', 'Gravity Motion', 'Consumer Cyclical', 'Auto Parts', 'below', 41, 910_000, 55]
];

export function demoUniverse({ endDate }) {
  const bars = {};
  const rows = [];
  U.forEach(([ticker, company, sector, industry, scenario, start, avgVol, earnDays], i) => {
    const b = genBars({ seed: 100 + i * 17, endDate, scenario, startPrice: start, avgVol });
    // GRAV: Kurse der Kurs-API sind unbereinigt (Split) -> Datenwarnung; Screener-Kennzahlen bleiben sauber
    bars[ticker] = ticker === 'GRAV' ? injectUnadjustedSplit(b) : b;
    const n = b.length, last = b[n - 1], prev = b[n - 2];
    const closes = b.map((x) => x.c);
    const s50 = sma(closes, 50), s200 = sma(closes, 200);
    const hi52 = Math.max(...b.slice(-252).map((x) => x.h));
    rows.push({
      ticker, company, sector, industry,
      marketCap: Math.round(last.c * (30 + (i * 37) % 200) * 1e6 * 4),
      price: last.c, changePct: ((last.c / prev.c) - 1) * 100,
      volume: last.v, avgVolume: avgVol,
      epsQoq: 14 + ((i * 11) % 70), salesQoq: 12 + ((i * 7) % 40),
      perf6m: (last.c / b[n - 127].c - 1) * 100,
      distSma50: (last.c / s50 - 1) * 100, distSma200: (last.c / s200 - 1) * 100,
      distHigh52: (last.c / hi52 - 1) * 100,
      earnings: earnDays == null ? null : { date: addDays(endDate, earnDays), time: 'AMC' }
    });
  });
  // Zwei Aktien, die der Screener aussortieren muss (zeigt, dass der Filter wirkt)
  rows.push({ ticker: 'CHEP', company: 'Chepstow Minerals', sector: 'Basic Materials', industry: 'Gold', marketCap: 8e8,
    price: 6.2, changePct: 1.1, volume: 400000, avgVolume: 300000, epsQoq: 40, salesQoq: 30, perf6m: 55,
    distSma50: 4, distSma200: 12, distHigh52: -3, earnings: null });
  rows.push({ ticker: 'SLOW', company: 'Slowbridge Foods', sector: 'Consumer Defensive', industry: 'Packaged Foods', marketCap: 9e9,
    price: 54, changePct: -0.2, volume: 1.2e6, avgVolume: 1.4e6, epsQoq: 3, salesQoq: 2, perf6m: 4,
    distSma50: 1, distSma200: 3, distHigh52: -6, earnings: null });
  return { rows, bars };
}
