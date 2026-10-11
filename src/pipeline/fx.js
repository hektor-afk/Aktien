// Wechselkurs USD -> EUR (Europäische Zentralbank über frankfurter.dev, kostenlos, ohne Schlüssel).
export async function fetchUsdEur({ fetchImpl = fetch } = {}) {
  const res = await fetchImpl('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR');
  if (!res.ok) throw new Error(`Wechselkurs-Abruf fehlgeschlagen (HTTP ${res.status})`);
  const j = await res.json();
  const rate = j?.rates?.EUR;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Wechselkurs-Antwort unbrauchbar');
  return { usdEur: rate, date: j.date, source: 'Europäische Zentralbank (frankfurter.dev)' };
}
