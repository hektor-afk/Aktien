import { num } from './format.js';

// Portfolio-Logik: Gesamtrisiko, Limits, Vor-dem-Kauf-Checkliste, Verkaufsregeln, Verlustserie.
// Eine Position ("trade") sieht so aus:
//   { id, ticker, company, industry, entry, stop, stop0, shares, reason, note, openedAt,
//     status: 'open' | 'closed', exit, closedAt, exitNote }

/** Risiko einer offenen Position = Abstand Einstieg–Stop × Stückzahl. Liegt der Stop über dem Einstieg, ist nichts mehr riskiert. */
export const positionRisk = (t) => Math.max(0, (t.entry - t.stop) * t.shares);

export function portfolioStatus(openTrades, capital) {
  const riskAmount = openTrades.reduce((s, t) => s + positionRisk(t), 0);
  const byIndustry = {};
  for (const t of openTrades) if (t.industry) byIndustry[t.industry] = (byIndustry[t.industry] || 0) + 1;
  return {
    count: openTrades.length,
    riskAmount,
    riskPct: capital > 0 ? (riskAmount / capital) * 100 : 0,
    byIndustry,
    crowded: Object.entries(byIndustry).filter(([, n]) => n > 2).map(([industry, n]) => ({ industry, n }))
  };
}

export const pnl = (t, price) => {
  const value = (price - t.entry) * t.shares;
  return { value, pct: (price / t.entry - 1) * 100, distToStopPct: price > 0 ? ((price - t.stop) / price) * 100 : null };
};

/** Ergebnis eines geschlossenen Trades inkl. R-Vielfachem (Gewinn ÷ ursprüngliches Risiko pro Aktie). */
export function closedResult(t) {
  const value = (t.exit - t.entry) * t.shares - (t.fees || 0);
  const r0 = t.entry - (t.stop0 ?? t.stop);
  return { value, pct: (t.exit / t.entry - 1) * 100, r: r0 > 0 ? (t.exit - t.entry) / r0 : null };
}

/** Wie viele Verluste in Folge am Ende der Trade-Liste (nach Schließdatum)? */
export function lossStreak(closed) {
  const sorted = [...closed].sort((a, b) => (a.closedAt < b.closedAt ? -1 : a.closedAt > b.closedAt ? 1 : 0));
  let n = 0;
  for (let i = sorted.length - 1; i >= 0 && closedResult(sorted[i]).value < 0; i--) n++;
  return n;
}

/**
 * Vor-dem-Kauf-Checkliste. Jede Zeile: green / amber / red / gray.
 * `locked` = harte Sperre (Gesamtrisiko-Limit oder Positionslimit) – die kann man nicht überstimmen.
 */
export function checkNewTrade({ open, capital, risk, maxStopPct = 8, trade, stock, market, streak = 0 }) {
  const items = [];
  const add = (key, label, status, text) => items.push({ key, label, status, text });
  const { entry, stop, shares, industry } = trade;

  if (!stock) add('signal', 'Signal grün?', 'gray', 'Keine aktuellen Daten zu dieser Aktie.');
  else if (stock.signal.overall === 'kaufsignal') add('signal', 'Signal grün?', 'green', 'Alle 7 Kriterien erfüllt.');
  else add('signal', 'Signal grün?', 'red', `Nur „${stock.signal.label}“ – es gibt noch kein Kaufsignal.`);

  if (market?.status === 'green') add('markt', 'Marktampel grün?', 'green', 'Der Markt ist stark.');
  else if (market?.status === 'red') add('markt', 'Marktampel grün?', 'red', 'Markt schwach, Pause oder kleinere Einsätze.');
  else add('markt', 'Marktampel grün?', 'gray', 'Keine Marktdaten.');

  const entryMax = stock?.signal.entryMax;
  if (entryMax == null || !(entry > 0)) add('zone', 'Im Einstiegsbereich?', 'gray', 'Einstiegsbereich unbekannt.');
  else if (entry > entryMax) add('zone', 'Im Einstiegsbereich?', 'red', `Nicht hinterherlaufen: ${entry} liegt über dem Bereich (bis ${num(entryMax, 2)}).`);
  else add('zone', 'Im Einstiegsbereich?', 'green', 'Der Preis liegt im Einstiegsbereich.');

  const valid = entry > 0 && stop > 0 && stop < entry && shares > 0;
  const newRisk = valid ? (entry - stop) * shares : 0;
  const newRiskPct = capital > 0 ? (newRisk / capital) * 100 : 0;
  const stopPct = valid ? ((entry - stop) / entry) * 100 : null;
  if (!valid) add('risiko', 'Risiko im Rahmen?', 'gray', 'Einstieg, Stop und Stückzahl prüfen (Stop muss unter dem Einstieg liegen).');
  else if (newRiskPct > risk.riskPerTradePct * 1.0001) add('risiko', 'Risiko im Rahmen?', 'red', `Das Risiko wäre ${num(newRiskPct, 2)} % des Kapitals – erlaubt sind ${risk.riskPerTradePct} %.`);
  else if (stopPct > maxStopPct) add('risiko', 'Risiko im Rahmen?', 'red', `Der Stop ist ${num(stopPct, 1)} % entfernt (mehr als ${maxStopPct} %).`);
  else add('risiko', 'Risiko im Rahmen?', 'green', `${num(newRiskPct, 2)} % des Kapitals im Risiko.`);

  const st = portfolioStatus(open, capital);
  const totalAfter = capital > 0 ? ((st.riskAmount + newRisk) / capital) * 100 : 0;
  let lockReason = null;
  if (st.count >= risk.maxPositions) lockReason = `Limit erreicht: schon ${st.count} von ${risk.maxPositions} Positionen offen. Neue Käufe sind gesperrt.`;
  else if (totalAfter > risk.maxOpenRiskPct + 1e-9) lockReason = `Limit erreicht: mit diesem Kauf läge das Gesamtrisiko bei ${num(totalAfter, 1)} % (erlaubt: ${risk.maxOpenRiskPct} %). Neue Käufe sind gesperrt.`;
  add('limit', 'Gesamtrisiko-Limit', lockReason ? 'red' : 'green', lockReason ?? `Gesamtrisiko danach ${num(totalAfter, 1)} % von ${risk.maxOpenRiskPct} %, ${st.count + 1} von ${risk.maxPositions} Positionen.`);

  if (!industry) add('branche', 'Branche nicht doppelt?', 'gray', 'Branche unbekannt.');
  else {
    const n = st.byIndustry[industry] || 0;
    if (n === 0) add('branche', 'Branche nicht doppelt?', 'green', 'Noch keine Position in dieser Branche.');
    else if (n < risk.maxPerIndustry) add('branche', 'Branche nicht doppelt?', 'amber', `Schon ${n} Position in „${industry}“.`);
    else add('branche', 'Branche nicht doppelt?', 'red', `Schon ${n} Positionen in „${industry}“ – mehr wäre zu viel Klumpenrisiko.`);
  }

  if (streak >= 3) add('serie', 'Keine Verlustserie?', 'red', `${streak} Verluste in Folge. Pause einlegen, Strategie prüfen.`);

  return { items, locked: Boolean(lockReason), lockReason, allGreen: items.every((i) => i.status === 'green'), newRisk, newRiskPct, totalAfterPct: totalAfter };
}

/** Verkaufsregeln: Schluss unter dem eigenen Stop oder unter dem SMA 50. */
export function sellCheck(t, { price, sma50 }) {
  const reasons = [];
  if (price != null && price < t.stop) reasons.push(`Der Schlusskurs (${num(price, 2)}) liegt unter deinem Stop (${num(t.stop, 2)}).`);
  if (price != null && sma50 != null && price < sma50) reasons.push(`Der Schlusskurs (${num(price, 2)}) liegt unter dem SMA 50 (${num(sma50, 2)}).`);
  return { sell: reasons.length > 0, reasons };
}

/**
 * Stop nachziehen: ab +10 % auf den Einstieg, ab +15 % unter den SMA 50 (nie unter den Einstieg),
 * ab +20 % zusätzlich mindestens +10 % abgesichert. Es zählt nur die höchste erreichte Stufe.
 */
export function trailSuggestion(t, { price, sma50 }, { levels = [10, 15, 20], bufferPct = 1 } = {}) {
  if (price == null) return null;
  const gain = (price / t.entry - 1) * 100;
  const reached = levels.filter((l) => gain >= l);
  if (!reached.length) return null;
  const level = reached[reached.length - 1];
  const idx = reached.length - 1;
  const belowSma = sma50 != null ? sma50 * (1 - bufferPct / 100) : null;
  let stop = t.entry;
  let why = `Seit +${level} % im Plus: Stop auf den Einstieg – dann kann dieser Trade nicht mehr im Minus enden.`;
  if (idx >= 1 && belowSma != null) {
    stop = Math.max(t.entry, belowSma);
    why = `Seit +${level} % im Plus: Stop knapp unter den SMA 50 (${num(sma50, 2)}), nie unter den Einstieg.`;
  }
  if (idx >= 2) {
    stop = Math.max(stop, t.entry * 1.1);
    why = `Seit +${level} % im Plus: mindestens +10 % absichern, sonst knapp unter den SMA 50.`;
  }
  if (stop >= price) return null;
  if (stop <= t.stop + 1e-9) return null;
  return { stop, level, why };
}
