// Marktampel: S&P 500 (über ETF SPY) über seinem SMA 200 = grün.
import { sma } from './indicators.js';

export function marketStatus(benchBars, { smaDays = 200 } = {}) {
  if (!benchBars || benchBars.length < smaDays) {
    return { status: 'gray', text: 'Marktdaten fehlen', detail: 'Für die Marktampel fehlen Indexdaten.' };
  }
  const closes = benchBars.map((b) => b.c);
  const last = closes[closes.length - 1];
  const avg = sma(closes, smaDays);
  const green = last > avg;
  return {
    status: green ? 'green' : 'red',
    text: green ? 'Markt stark' : 'Markt schwach, vorsichtig sein',
    detail: green ? 'Der S&P 500 liegt über seinem SMA 200. Käufe sind in einem starken Markt aussichtsreicher.'
                  : 'Der S&P 500 liegt unter seinem SMA 200. Neue Käufe scheitern in schwachen Märkten öfter – Pause oder kleinere Einsätze.',
    close: last, sma200: avg, distancePct: (last / avg - 1) * 100, asOf: benchBars[benchBars.length - 1].t
  };
}
