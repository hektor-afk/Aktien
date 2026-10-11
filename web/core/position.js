// Positionsgröße: Wie viele Aktien darf ich kaufen, wenn ich höchstens X % meines Kapitals riskiere?

export function positionSize({ capital, riskPct, entry, stop, fee = 0, maxStopPct = 8 }) {
  if (![capital, riskPct, entry, stop].every(Number.isFinite) || entry <= 0 || stop <= 0 || stop >= entry) {
    return { valid: false, reason: 'Stop muss unter dem Einstieg liegen.' };
  }
  const riskPerShare = entry - stop;
  const riskBudget = capital * (riskPct / 100);
  const byRisk = Math.floor(riskBudget / riskPerShare);
  const byCapital = Math.floor(capital / entry);
  const shares = Math.max(0, Math.min(byRisk, byCapital));
  const stopPct = (riskPerShare / entry) * 100;
  return {
    valid: true,
    shares,
    cappedByCapital: byCapital < byRisk,
    positionValue: shares * entry,
    positionPct: ((shares * entry) / capital) * 100,
    maxLoss: shares * riskPerShare + fee * 2,
    maxLossPct: ((shares * riskPerShare + fee * 2) / capital) * 100,
    riskPerShare, riskBudget, stopPct,
    stopTooWide: stopPct > maxStopPct
  };
}

/** Stufe 2 nutzt das auch: Kurs über dem Einstiegsbereich? -> nicht hinterherlaufen. */
export const chaseCheck = (price, entryMax) => entryMax != null && price > entryMax;
