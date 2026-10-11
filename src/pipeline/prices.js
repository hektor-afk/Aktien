// Kursdaten von Twelve Data (kostenlose Stufe: 8 Abrufe/Minute, 800/Tag).
// Anderen Anbieter nutzen? Nur diese eine Funktion ersetzen: liefert Kerzen aufsteigend.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function twelveDataProvider({ apiKey, perMinute = 8, fetchImpl = fetch, log = () => {} }) {
  if (!apiKey) throw new Error('TWELVEDATA_API_KEY fehlt. Bitte in der Datei .env eintragen.');
  const stamps = [];

  async function throttle() {
    const now = Date.now();
    while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
    if (stamps.length >= perMinute) {
      const wait = 60_000 - (now - stamps[0]) + 500;
      log(`Warte ${Math.ceil(wait / 1000)} s (Abruf-Limit)…`);
      await sleep(wait);
      return throttle();
    }
    stamps.push(Date.now());
  }

  return {
    name: 'Twelve Data',
    async fetchBars(symbol, count = 320) {
      await throttle();
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
        `&interval=1day&outputsize=${count}&order=ASC&apikey=${apiKey}`;
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
      const json = await res.json();
      if (json.status === 'error' || !Array.isArray(json.values)) {
        throw new Error(json.message || 'Twelve Data: keine Werte erhalten');
      }
      return json.values.map((v) => ({
        t: v.datetime.slice(0, 10), o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +v.volume
      })).sort((a, b) => (a.t < b.t ? -1 : 1));
    }
  };
}
