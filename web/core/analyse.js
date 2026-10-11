// Eine Aktie komplett auswerten: Signal, relative Stärke, Datenqualität, Kennzahlen.
// Wird vom Nacht-Skript UND von den Live-Kursen in der App benutzt – gleiche Regeln überall.
import { evaluateSignal } from './signal.js';
import { relativeStrength } from './relstrength.js';
import { checkDataQuality } from './quality.js';

/**
 * @param bars       Tageskerzen aufsteigend (die letzte darf noch unfertig sein, dann partial = true)
 * @param partial    Handelstag läuft noch: Signale werden nur aus abgeschlossenen Tagen berechnet,
 *                   Kurs und Tagesänderung kommen aus der laufenden Kerze.
 * @param meta       { ticker, company, sector, industry, earnings:{date,time}|null, inScreener, refPrice, ...Zusatzfelder }
 */
export function analyseStock({ bars, benchBars, settings, today, expectedDate = null, meta, partial = false }) {
  if (!bars?.length) throw new Error('keine Kursdaten');
  const closed = partial ? bars.slice(0, -1) : bars;
  if (!closed.length) throw new Error('zu wenig Kursdaten');
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const { refPrice, ...rest } = meta;
  return {
    company: meta.ticker, sector: '', industry: '', inScreener: false, earnings: null,
    ...rest,
    price: last.c,
    changePct: prev ? (last.c / prev.c - 1) * 100 : null,
    priceDate: last.t,
    lastClose: closed[closed.length - 1].c,            // letzter ABGESCHLOSSENER Schlusskurs (für Verkaufsregeln)
    partial,
    signal: evaluateSignal(closed, { settings, today, earningsDate: meta.earnings?.date ?? null }),
    rs: relativeStrength(closed, benchBars, { days3: settings.signal.rsDays3m, days6: settings.signal.rsDays6m }),
    quality: checkDataQuality(closed, { settings, expectedDate, referencePrice: partial ? null : refPrice ?? null }),
    spark: bars.slice(-60).map((b) => b.c)
  };
}
