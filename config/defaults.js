// Alle Standardwerte an einer Stelle. Eigene Werte kommen in config/settings.json
// (nur die Felder eintragen, die du ändern willst) – später auch über die App.
export const DEFAULTS = {
  // 1) Screener – exakt so, wie in der Aufgabe beschrieben. Geprüft wird lokal,
  //    dadurch ist jeder Wert frei änderbar (Finviz liefert nur die Rohdaten).
  screener: {
    minMarketCapMrd: 2,        // Marktkapitalisierung > 2 Mrd. $
    minPrice: 10,              // Kurs > 10 $
    minAvgVolume: 500_000,     // Ø-Volumen > 500.000
    minEpsGrowthQoq: 10,       // EPS-Wachstum Quartal > 10 %
    minSalesGrowthQoq: 10,     // Umsatzwachstum Quartal > 10 %
    minPerf6m: 10,             // Kursplus 6 Monate > 10 %
    aboveSma50: true,          // Kurs über SMA 50
    aboveSma200: true,         // Kurs über SMA 200
    maxBelow52wHighPct: 10,    // max. 10 % unter dem 52-Wochen-Hoch
    maxCandidates: 60          // so viele Aktien werden maximal mit Kursdaten geprüft
  },

  // 2) Kaufsignal
  signal: {
    smaFast: 50,
    smaSlow: 200,
    slopeDays: 20,             // "steigend": SMA heute > SMA vor 20 Handelstagen
    breakoutLookback: 30,      // Hoch der letzten ~6 Wochen (30 Handelstage)
    pullbackTouchPct: 1.5,     // Rücksetzer: Tief bis max. 1,5 % über dem SMA 50
    pullbackDays: 5,           // ... innerhalb der letzten 5 Tage
    volumeAvgDays: 50,
    volumeFactor: 1.5,         // Volumen mind. 1,5-fach
    closeNearHighMin: 0.7,     // Schluss in den oberen 30 % der Tagesspanne
    maxExtendedPct: 5,         // höchstens 5 % über dem Ausbruchslevel
    earningsBlockDays: 14,     // kein Quartalsbericht in den nächsten 14 Tagen
    maxStopPct: 8,             // Stop-Loss höchstens 8 % unter dem Einstieg
    stopBufferPct: 1,          // Puffer unter dem Tagestief für den Stop-Vorschlag
    fastMin: 5,                // ab 5 von 7 grünen Kriterien: "Fast"
    rsDays3m: 63,
    rsDays6m: 126
  },

  // Position / Risiko (Rechner, Stufe 2)
  risk: {
    capital: 10_000,
    riskPerTradePct: 1,
    maxOpenRiskPct: 6,
    maxPositions: 6,
    maxPerIndustry: 2,
    fee: 0                    // Broker-Gebühr pro Order in $ (Stufe 3: Einstellungen)
  },

  // Datenqualität
  quality: {
    minBars: 210,
    jumpPct: 30,               // Tagessprung über 30 % = auffällig
    maxGapDays: 4,             // mehr als 4 Kalendertage ohne Kurs = fehlende Tage
    maxPriceDeviationPct: 3    // Finviz-Kurs vs. Schlusskurs der Kurs-API
  },

  // Aktien, die immer mitgeladen werden (Positionen und Watchlist), auch außerhalb des Screeners
  trackTickers: [],

  market: { benchmark: 'SPY', smaDays: 200 }
};

export function mergeSettings(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] ? mergeSettings(base[k], v) : v;
  }
  return out;
}
