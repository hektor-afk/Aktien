import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, smaSeries, highest, lowest, avgVolumeBefore, closeOnOrBefore, pct } from '../web/core/indicators.js';
import { evaluateSignal } from '../web/core/signal.js';
import { relativeStrength } from '../web/core/relstrength.js';
import { positionSize, chaseCheck } from '../web/core/position.js';
import { checkDataQuality } from '../web/core/quality.js';
import { marketStatus } from '../web/core/market.js';
import { compareStocks } from '../web/core/rank.js';
import { daysBetween, addDays, parseEarningsDate, expectedTradingDate } from '../web/core/dates.js';
import { num, percent, dateDe } from '../web/core/format.js';
import { DEFAULTS } from '../config/defaults.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('SMA, Hoch, Tief, Prozent', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 3), 4);
  assert.equal(sma([1, 2, 3, 4, 5], 3, 2), 2);
  assert.equal(sma([1, 2], 3), null);
  assert.deepEqual(smaSeries([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.equal(highest([1, 9, 3, 4], 0, 2), 9);
  assert.equal(lowest([5, 1, 3, 4], 1, 3), 1);
  close(pct(110, 100), 10);
});

test('Ø-Volumen zählt den letzten Tag nicht mit', () => {
  const bars = [100, 100, 100, 100, 400].map((v) => ({ v }));
  assert.equal(avgVolumeBefore(bars, 4), 100);
  assert.equal(avgVolumeBefore(bars, 5), null);
});

test('Schlusskurs am Datum oder davor', () => {
  const bars = [{ t: '2026-01-02', c: 1 }, { t: '2026-01-05', c: 2 }];
  assert.equal(closeOnOrBefore(bars, '2026-01-04'), 1);
  assert.equal(closeOnOrBefore(bars, '2026-01-05'), 2);
  assert.equal(closeOnOrBefore(bars, '2026-01-01'), null);
});

// Gerader Aufwärtstrend: Schluss = 100 + 0,5·i (i = 0..259). Alle Sollwerte von Hand gerechnet.
function trendBars() {
  const bars = [];
  for (let i = 0; i < 260; i++) {
    const c = 100 + 0.5 * i;
    bars.push({ t: addDays('2026-01-01', i), o: c - 0.2, h: c + 0.3, l: c - 0.5, c, v: 1000 });
  }
  // letzte Kerze: grün, Schluss nahe Hoch, Ausbruch knapp über 229,3
  bars[259] = { ...bars[259], o: 228.9, h: 229.6, l: 228.8, c: 229.5, v: 2000 };
  return bars;
}
const ctx = (over = {}) => ({ settings: DEFAULTS, today: '2026-09-17', earningsDate: '2026-10-27', ...over });
const status = (sig, key) => sig.criteria.find((c) => c.key === key).status;

test('Kaufsignal: alle 7 Kriterien grün (Ausbruch)', () => {
  const s = evaluateSignal(trendBars(), ctx());
  close(s.sma50, 217.25);                       // Mittel von 210..259 → 100 + 0,5·234,5
  close(s.sma200, 100 + 0.5 * 159.5);           // Mittel der Indizes 60..259
  close(s.level, 229.3);                        // Hoch der 30 Tage davor: 229 + 0,3
  close(s.volFactor, 2);
  close(s.closePos, 0.875);
  close(s.distancePct, (229.5 / 229.3 - 1) * 100);
  close(s.entryMax, 229.3 * 1.05);
  close(s.stop, 228.5 * 0.99);                  // tieferes Tief der letzten 2 Tage × 0,99
  close(s.stopPct, ((229.5 - 228.5 * 0.99) / 229.5) * 100);
  assert.equal(s.mode, 'ausbruch');
  assert.equal(s.greens, 7);
  assert.equal(s.label, 'Kaufsignal');
});

test('Volumen zu niedrig -> Fast (6 von 7)', () => {
  const b = trendBars();
  b[259].v = 1000;
  const s = evaluateSignal(b, ctx());
  assert.equal(status(s, 'volumen'), 'red');
  assert.equal(s.label, 'Fast (6 von 7)');
});

test('Quartalsbericht: in 5 Tagen rot, unbekannt grau, vorbei grün', () => {
  assert.equal(status(evaluateSignal(trendBars(), ctx({ earningsDate: '2026-09-22' })), 'bericht'), 'red');
  assert.equal(status(evaluateSignal(trendBars(), ctx({ earningsDate: null })), 'bericht'), 'gray');
  assert.equal(status(evaluateSignal(trendBars(), ctx({ earningsDate: '2026-09-10' })), 'bericht'), 'green');
  assert.equal(status(evaluateSignal(trendBars(), ctx({ earningsDate: '2026-10-01' })), 'bericht'), 'red'); // genau 14 Tage
  assert.equal(status(evaluateSignal(trendBars(), ctx({ earningsDate: '2026-10-02' })), 'bericht'), 'green'); // 15 Tage
});

test('rote Kerze und Schluss weit vom Hoch sind rot', () => {
  const red = trendBars(); red[259] = { ...red[259], o: 229.6, c: 229.5 };
  assert.equal(status(evaluateSignal(red, ctx()), 'kerze'), 'red');
  const weak = trendBars(); weak[259] = { ...weak[259], h: 231, c: 229.4 };
  assert.equal(status(evaluateSignal(weak, ctx()), 'kerze'), 'red');
});

test('zu weit über dem Ausbruchslevel -> rot', () => {
  const b = trendBars();
  b[259] = { ...b[259], o: 240, h: 243, l: 239.5, c: 242.5 }; // 242,5 / 229,3 = +5,76 %
  const s = evaluateSignal(b, ctx());
  assert.equal(status(s, 'abstand'), 'red');
  assert.equal(s.label, 'Fast (6 von 7)');
});

test('Stop weiter als 8 % entfernt -> rot', () => {
  const b = trendBars();
  b[259] = { ...b[259], l: 205 }; // Tief 205 → Stop 202,95 → 11,6 % unter 229,5
  const s = evaluateSignal(b, ctx());
  assert.equal(status(s, 'stop'), 'red');
  assert.ok(s.stopPct > 8);
});

test('kein Ausbruch: Schluss unter Hoch -> Ausbruch rot, "Noch nicht"/Fast je nach Rest', () => {
  const b = trendBars();
  b[259] = { ...b[259], o: 228.0, h: 229.0, l: 227.9, c: 228.9, v: 2000 };
  const s = evaluateSignal(b, ctx());
  assert.equal(status(s, 'ausbruch'), 'red');
  assert.equal(status(s, 'abstand'), 'red');
  assert.equal(s.mode, null);
});

test('Rücksetzer auf den SMA 50 mit Umkehr', () => {
  const b = trendBars();
  // Kurs fällt in 6 Tagen auf den SMA 50 (≈ 217) und dreht mit grüner Kerze nach oben
  const path = [226, 223, 220, 218, 217.3, 217.4];
  for (let k = 0; k < path.length; k++) {
    const i = 253 + k;
    b[i] = { ...b[i], o: path[k] + 0.2, h: path[k] + 0.5, l: path[k] - 0.5, c: path[k] };
  }
  b[259] = { ...b[259], o: 217.5, h: 219.5, l: 217.1, c: 219.3, v: 2500 };
  const s = evaluateSignal(b, ctx());
  assert.equal(s.mode, 'ruecksetzer');
  assert.equal(status(s, 'ausbruch'), 'green');
  close(s.level, b[258].h);
});

test('zu wenig Historie -> graue Ampeln, kein Kaufsignal', () => {
  const s = evaluateSignal(trendBars().slice(0, 100), ctx());
  assert.equal(status(s, 'trend'), 'gray');
  assert.notEqual(s.overall, 'kaufsignal');
});

test('Kurslücke über dem Einstiegsbereich', () => {
  const b = trendBars();
  b[259] = { ...b[259], o: 245, h: 246, l: 244.5, c: 245.8 };
  assert.equal(evaluateSignal(b, ctx()).gapAboveZone, true);
  assert.equal(evaluateSignal(trendBars(), ctx()).gapAboveZone, false);
  assert.equal(chaseCheck(241, 240.8), true);
  assert.equal(chaseCheck(240, 240.8), false);
});

test('relative Stärke gegen den S&P 500 (Prozentpunkte)', () => {
  const mk = (cs) => cs.map((c, i) => ({ t: addDays('2026-01-01', i), c }));
  const stock = mk([100, 100, 100, 100, 110, 121]);   // 2 Tage: +10 %, 4 Tage: +21 %
  const bench = mk([100, 100, 100, 100, 105, 110.25]); // 2 Tage: +5 %,  4 Tage: +10,25 %
  const rs = relativeStrength(stock, bench, { days3: 2, days6: 4 });
  close(rs.m3.stock, 21, 1e-9); // 121/100
  close(rs.m3.bench, 10.25, 1e-9);
  close(rs.m3.diff, 10.75, 1e-9);
  close(rs.m6.stock, 21, 1e-9);
  assert.equal(rs.strong, true);
  const weak = relativeStrength(stock, mk([100, 100, 100, 100, 120, 140]), { days3: 2, days6: 4 });
  assert.equal(weak.strong, false);
});

test('Positionsgröße: 10.000 € Kapital, 1 % Risiko', () => {
  const p = positionSize({ capital: 10_000, riskPct: 1, entry: 100, stop: 93 });
  assert.equal(p.shares, 14);            // 100 € Risiko / 7 € pro Aktie = 14,28 → 14
  assert.equal(p.positionValue, 1400);
  assert.equal(p.maxLoss, 98);
  close(p.stopPct, 7);
  assert.equal(p.stopTooWide, false);
  const wide = positionSize({ capital: 10_000, riskPct: 1, entry: 100, stop: 90 });
  assert.equal(wide.shares, 10);
  assert.equal(wide.stopTooWide, true);
  const capped = positionSize({ capital: 1000, riskPct: 5, entry: 100, stop: 99 });
  assert.equal(capped.shares, 10);       // Risiko erlaubt 50 Stück, Kapital nur 10
  assert.equal(capped.cappedByCapital, true);
  assert.equal(positionSize({ capital: 1000, riskPct: 1, entry: 100, stop: 105 }).valid, false);
});

const cleanBars = (n = 260) => Array.from({ length: n }, (_, i) => {
  let d = addDays('2025-01-01', Math.floor(i / 5) * 7 + (i % 5)); // Mo–Fr
  return { t: d, o: 100, h: 101, l: 99, c: 100, v: 1000 };
});

test('Datenqualität: saubere Reihe, Split, Sprung, Lücke, kaputte Kerze', () => {
  const opt = { settings: DEFAULTS };
  assert.equal(checkDataQuality(cleanBars(), opt).ok, true);

  const split = cleanBars(); for (let i = 0; i < 100; i++) split[i].c = split[i].o = split[i].h = split[i].l = 200;
  assert.ok(checkDataQuality(split, opt).issues.some((x) => x.code === 'split'));

  const jump = cleanBars(); for (let i = 120; i < 260; i++) jump[i].c = jump[i].o = jump[i].h = jump[i].l = 140;
  assert.ok(checkDataQuality(jump, opt).issues.some((x) => x.code === 'sprung'));

  const gap = cleanBars().filter((_, i) => i < 100 || i > 110);
  assert.ok(checkDataQuality(gap, opt).issues.some((x) => x.code === 'fehlende_tage'));

  const bad = cleanBars(); bad[5].h = 50;
  assert.ok(checkDataQuality(bad, opt).issues.some((x) => x.code === 'fehlerhafte_kerzen'));

  assert.ok(checkDataQuality(cleanBars(50), opt).issues.some((x) => x.code === 'zu_kurz'));
  assert.ok(checkDataQuality(cleanBars(), { ...opt, referencePrice: 110 }).issues.some((x) => x.code === 'abweichung'));
  assert.equal(checkDataQuality([], opt).ok, false);
});

test('Marktampel: S&P über/unter SMA 200', () => {
  const up = Array.from({ length: 220 }, (_, i) => ({ t: 'x', c: 100 + i }));
  assert.equal(marketStatus(up).status, 'green');
  const down = Array.from({ length: 220 }, (_, i) => ({ t: 'x', c: 300 - i }));
  const m = marketStatus(down);
  assert.equal(m.status, 'red');
  assert.match(m.text, /Markt schwach/);
  assert.equal(marketStatus(up.slice(0, 50)).status, 'gray');
});

test('Ranking: Signal vor Fast vor Noch nicht, dann relative Stärke', () => {
  const mk = (overall, greens, strong, perf6m = 20, partial = strong) => ({ signal: { overall, greens }, rs: { strong, partial }, perf6m });
  const list = [mk('noch_nicht', 3, true), mk('fast', 6, false), mk('kaufsignal', 7, false), mk('fast', 6, true), mk('kaufsignal', 7, true)];
  list.sort(compareStocks);
  assert.deepEqual(list.map((x) => [x.signal.overall, x.rs.strong]), [
    ['kaufsignal', true], ['kaufsignal', false], ['fast', true], ['fast', false], ['noch_nicht', true]
  ]);
});

test('Datum: Differenzen, Finviz-Termine, erwarteter Handelstag', () => {
  assert.equal(daysBetween('2026-09-17', '2026-10-01'), 14);
  assert.deepEqual(parseEarningsDate('10/23/2026 AMC'), { date: '2026-10-23', time: 'AMC' });
  assert.deepEqual(parseEarningsDate('Oct 23 BMO', '2026-09-17'), { date: '2026-10-23', time: 'BMO' });
  assert.deepEqual(parseEarningsDate('Jan 15 AMC', '2026-12-20'), { date: '2027-01-15', time: 'AMC' });
  assert.equal(parseEarningsDate('-'), null);
  // 2026-10-14 ist ein Mittwoch. 23:30 MESZ = 21:30 UTC.
  assert.equal(expectedTradingDate(new Date('2026-10-14T21:30:00Z')), '2026-10-14');
  assert.equal(expectedTradingDate(new Date('2026-10-14T19:00:00Z')), '2026-10-13');
  assert.equal(expectedTradingDate(new Date('2026-10-17T10:00:00Z')), '2026-10-16'); // Samstag → Freitag
  assert.equal(expectedTradingDate(new Date('2026-10-12T08:00:00Z')), '2026-10-09'); // Montagfrüh → Freitag
});

test('Zahlenformat (deutsch)', () => {
  assert.equal(num(1234.5), '1.234,50');
  assert.equal(percent(5.25, 1, true), '+5,3 %');
  assert.equal(dateDe('2026-10-09'), '09.10.2026');
});

import { positionRisk, portfolioStatus, pnl, closedResult, lossStreak, checkNewTrade, sellCheck, trailSuggestion } from '../web/core/portfolio.js';

const T = (o) => ({ id: o.ticker, status: 'open', stop0: o.stop, ...o });
const riskCfg = { riskPerTradePct: 1, maxOpenRiskPct: 6, maxPositions: 6, maxPerIndustry: 2 };

test('Portfolio: Risiko offener Positionen (Stop über Einstieg = kein Risiko)', () => {
  const open = [T({ ticker: 'A', entry: 100, stop: 93, shares: 14, industry: 'X' }), T({ ticker: 'B', entry: 50, stop: 47, shares: 20, industry: 'X' }), T({ ticker: 'C', entry: 20, stop: 21, shares: 100, industry: 'Y' })];
  assert.equal(positionRisk(open[0]), 98);
  assert.equal(positionRisk(open[1]), 60);
  assert.equal(positionRisk(open[2]), 0);
  const st = portfolioStatus(open, 10_000);
  assert.equal(st.riskAmount, 158);
  close(st.riskPct, 1.58);
  assert.equal(st.byIndustry.X, 2);
  assert.equal(portfolioStatus([...open, T({ ticker: 'D', entry: 10, stop: 9, shares: 5, industry: 'X' })], 10_000).crowded[0].industry, 'X');
});

test('Gewinn/Verlust und R-Vielfaches', () => {
  const t = T({ ticker: 'A', entry: 100, stop: 93, shares: 10 });
  const p = pnl(t, 112);
  assert.equal(p.value, 120); close(p.pct, 12); close(p.distToStopPct, (112 - 93) / 112 * 100);
  const c = closedResult({ ...t, exit: 112 });
  assert.equal(c.value, 120); close(c.r, 12 / 7);
  assert.equal(closedResult({ ...t, exit: 90, fees: 2 }).value, -102);
});

test('Verlustserie zählt nur am Ende', () => {
  const mk = (exit, day) => ({ entry: 100, stop0: 93, shares: 1, exit, closedAt: `2026-01-0${day}` });
  assert.equal(lossStreak([mk(110, 1), mk(95, 2), mk(90, 3), mk(99, 4)]), 3);
  assert.equal(lossStreak([mk(95, 1), mk(90, 2), mk(110, 3)]), 0);
  assert.equal(lossStreak([]), 0);
  assert.equal(lossStreak([mk(95, 4), mk(90, 2), mk(110, 1)]), 2); // Sortierung nach Datum
});

test('Checkliste: grün, Limit-Sperre, Branche, Hinterherlaufen', () => {
  const stock = { signal: { overall: 'kaufsignal', label: 'Kaufsignal', entryMax: 105 } };
  const trade = { ticker: 'N', entry: 100, stop: 93, shares: 14, industry: 'Soft' }; // Risiko 98 = 0,98 %
  const base = { open: [], capital: 10_000, risk: riskCfg, trade, stock, market: { status: 'green' } };
  const ok = checkNewTrade(base);
  assert.equal(ok.allGreen, true); assert.equal(ok.locked, false);

  assert.equal(checkNewTrade({ ...base, market: { status: 'red' } }).items.find((i) => i.key === 'markt').status, 'red');
  assert.equal(checkNewTrade({ ...base, stock: { signal: { overall: 'fast', label: 'Fast (6 von 7)', entryMax: 105 } } }).items[0].status, 'red');
  assert.equal(checkNewTrade({ ...base, trade: { ...trade, entry: 106 } }).items.find((i) => i.key === 'zone').status, 'red');
  assert.equal(checkNewTrade({ ...base, trade: { ...trade, shares: 30 } }).items.find((i) => i.key === 'risiko').status, 'red'); // 2,1 %
  assert.equal(checkNewTrade({ ...base, trade: { ...trade, stop: 90 } }).items.find((i) => i.key === 'risiko').status, 'red');   // 10 % Stop

  // Gesamtrisiko: 5 Positionen mit je 1 % = 5 %, neue 1 % -> 6 % (erlaubt), danach gesperrt
  const mk = (i) => T({ ticker: 'P' + i, entry: 100, stop: 93, shares: 14, industry: 'I' + i });
  const five = [1, 2, 3, 4, 5].map(mk);
  assert.equal(checkNewTrade({ ...base, open: five }).locked, false);
  const full = checkNewTrade({ ...base, open: [...five, mk(6)] });
  assert.equal(full.locked, true); assert.match(full.lockReason, /6 von 6 Positionen/);
  const riskHeavy = checkNewTrade({ ...base, open: [T({ ticker: 'Z', entry: 100, stop: 50, shares: 12, industry: 'Q' })] }); // 6 % schon belegt
  assert.equal(riskHeavy.locked, true); assert.match(riskHeavy.lockReason, /Gesamtrisiko/);

  const same = [T({ ticker: 'S1', entry: 100, stop: 99, shares: 1, industry: 'Soft' })];
  assert.equal(checkNewTrade({ ...base, open: same }).items.find((i) => i.key === 'branche').status, 'amber');
  assert.equal(checkNewTrade({ ...base, open: [...same, T({ ticker: 'S2', entry: 100, stop: 99, shares: 1, industry: 'Soft' })] }).items.find((i) => i.key === 'branche').status, 'red');
  assert.equal(checkNewTrade({ ...base, streak: 3 }).items.at(-1).key, 'serie');
  assert.equal(checkNewTrade({ ...base, stock: null }).items[0].status, 'gray');
});

test('Verkaufsregeln: unter Stop und/oder unter SMA 50', () => {
  const t = T({ ticker: 'A', entry: 100, stop: 93, shares: 1 });
  assert.equal(sellCheck(t, { price: 105, sma50: 100 }).sell, false);
  assert.equal(sellCheck(t, { price: 92, sma50: 90 }).reasons.length, 1);   // nur Stop
  assert.equal(sellCheck(t, { price: 97, sma50: 99 }).reasons.length, 1);   // nur SMA 50
  assert.equal(sellCheck(t, { price: 92, sma50: 99 }).reasons.length, 2);
  assert.equal(sellCheck(t, { price: 93, sma50: 90 }).sell, false);          // genau auf dem Stop zählt nicht
});

test('Stop nachziehen bei +10 / +15 / +20 %', () => {
  const t = T({ ticker: 'A', entry: 100, stop: 93, shares: 1 });
  assert.equal(trailSuggestion(t, { price: 105, sma50: 100 }), null);
  assert.equal(trailSuggestion(t, { price: 111, sma50: 100 }).stop, 100);           // +10 %: Einstieg
  close(trailSuggestion(t, { price: 116, sma50: 108 }).stop, 108 * 0.99);          // +15 %: unter SMA 50
  assert.equal(trailSuggestion(t, { price: 116, sma50: 95 }).stop, 100);           // SMA 50 zu tief -> Einstieg
  close(trailSuggestion(t, { price: 121, sma50: 108 }).stop, 110);                 // +20 %: mind. +10 %
  assert.equal(trailSuggestion({ ...t, stop: 100 }, { price: 111, sma50: 100 }), null); // Stop schon so hoch
  assert.equal(trailSuggestion(t, { price: 121, sma50: 108 }).level, 20);
});

import { tradeStats } from '../web/core/stats.js';
import { groupIndustries, sortIndustries } from '../web/core/industries.js';
import { earningsCalendar } from '../web/core/calendar.js';
import { makeBackup, parseBackup } from '../web/core/backup.js';
import { sha256Hex, hashPin } from '../web/core/sha256.js';

test('Auswertung: Trefferquote, Ø Gewinn/Verlust, Chance-Risiko, Verlaufskurve', () => {
  const mk = (id, exit, day) => ({ id, ticker: id, entry: 100, stop0: 95, stop: 95, shares: 10, exit, closedAt: `2026-03-0${day}`, status: 'closed' });
  // Ergebnisse: +100, −50, +200, −50
  const s = tradeStats([mk('c', 120, 3), mk('a', 110, 1), mk('b', 95, 2), mk('d', 95, 4)]);
  assert.equal(s.n, 4); assert.equal(s.winRate, 50);
  assert.equal(s.avgWin, 150); assert.equal(s.avgLoss, 50); assert.equal(s.payoff, 3);
  assert.equal(s.total, 200); assert.equal(s.expectancy, 50);
  assert.deepEqual(s.curve.map((p) => p.cum), [100, 50, 250, 200]);
  close(s.avgR, (2 + -1 + 4 + -1) / 4);
  assert.equal(s.best, 200); assert.equal(s.worst, -50);
  const e = tradeStats([]);
  assert.equal(e.n, 0); assert.equal(e.winRate, null); assert.equal(e.payoff, null);
  assert.equal(tradeStats([mk('a', 110, 1)]).payoff, null); // kein Verlust -> kein Verhältnis
});

test('Branchen: Gruppieren und Sortieren', () => {
  const st = (ticker, industry, overall, perf6m) => ({ ticker, industry, sector: 'S', signal: { overall }, perf6m });
  const g = groupIndustries([st('A', 'Soft', 'kaufsignal', 40), st('B', 'Soft', 'fast', 20), st('C', 'Oil', 'noch_nicht', 80), st('D', 'Semi', 'fast', 10), st('E', 'Semi', 'fast', 30), st('F', 'Semi', 'noch_nicht', 20)]);
  const soft = g.find((x) => x.industry === 'Soft');
  assert.equal(soft.count, 2); assert.equal(soft.signals, 1); assert.equal(soft.fast, 1); assert.equal(soft.avgPerf6m, 30);
  assert.deepEqual(sortIndustries(g, 'count').map((x) => x.industry), ['Semi', 'Soft', 'Oil']);
  assert.deepEqual(sortIndustries(g, 'perf').map((x) => x.industry), ['Oil', 'Soft', 'Semi']);
});

test('Kalender: Warnung 14 Tage vorher, Positionen markiert, unbekannte zuletzt', () => {
  const stocks = [
    { ticker: 'A', company: 'A Inc', earnings: { date: '2026-10-20', time: 'AMC' } },
    { ticker: 'B', company: 'B Inc', earnings: { date: '2026-11-20', time: null } },
    { ticker: 'C', company: 'C Inc', earnings: { date: '2026-10-01', time: null } }, // vorbei
    { ticker: 'D', company: 'D Inc', earnings: null }
  ];
  const cal = earningsCalendar({ stocks, openTrades: [{ ticker: 'B' }], watchlist: [{ ticker: 'A' }, { ticker: 'C' }, { ticker: 'D' }, { ticker: 'Z' }], today: '2026-10-11' });
  assert.deepEqual(cal.map((x) => x.ticker), ['A', 'B', 'D', 'Z']);
  assert.equal(cal[0].days, 9); assert.equal(cal[0].warn, true);
  assert.equal(cal[1].warn, false); assert.equal(cal[1].held, true);
  assert.equal(cal[2].unknown, true);
  assert.equal(earningsCalendar({ stocks, openTrades: [{ ticker: 'A' }], watchlist: [], today: '2026-10-06' })[0].days, 14);
  assert.equal(earningsCalendar({ stocks, openTrades: [{ ticker: 'A' }], watchlist: [], today: '2026-10-06' })[0].warn, true);
  assert.equal(earningsCalendar({ stocks, openTrades: [{ ticker: 'A' }], watchlist: [], today: '2026-10-05' })[0].warn, false);
});

test('Sicherung: Export und Import mit Prüfung', () => {
  const trades = [{ id: '1', ticker: 'A', entry: 10, stop: 9, shares: 5, status: 'open' }, { id: '2', ticker: 'B', entry: 10, stop: 9, shares: 5, status: 'closed', exit: 12 }];
  const b = makeBackup({ trades, watchlist: [{ ticker: 'A' }], risk: { capital: 5000 }, prefs: { euro: true } }, new Date('2026-10-11T10:00:00Z'));
  const back = parseBackup(JSON.stringify(b));
  assert.deepEqual(back.trades, trades); assert.equal(back.risk.capital, 5000); assert.equal(back.prefs.euro, true);
  assert.throws(() => parseBackup('kein json'), /kein JSON/);
  assert.throws(() => parseBackup('{"app":"x"}'), /keine Sicherungsdatei/);
  assert.throws(() => parseBackup(JSON.stringify({ ...b, trades: [{ ticker: 'A' }] })), /unvollständig/);
  assert.throws(() => parseBackup(JSON.stringify({ ...b, trades: [{ ...trades[1], exit: undefined }] })), /Verkaufskurs/);
  assert.throws(() => parseBackup(JSON.stringify({ ...b, version: 99 })), /neueren/);
});

test('SHA-256 stimmt mit Referenzwerten überein, PIN-Hash ist stabil und salzabhängig', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('a'.repeat(1000)), '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  assert.equal(hashPin('1234', 'salz', 10), hashPin('1234', 'salz', 10));
  assert.notEqual(hashPin('1234', 'salz', 10), hashPin('1235', 'salz', 10));
  assert.notEqual(hashPin('1234', 'salz', 10), hashPin('1234', 'anders', 10));
});
