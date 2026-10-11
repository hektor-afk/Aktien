// Zahlen im deutschen Format.
const nf = (d) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const cache = {};
const f = (d) => (cache[d] ??= nf(d));

export const num = (x, d = 2) => (x == null || Number.isNaN(x) ? '–' : f(d).format(x));
export const usd = (x, d = 2) => (x == null ? '–' : `${f(d).format(x)} $`);
export const eur = (x, d = 2) => (x == null ? '–' : `${f(d).format(x)} €`);
export const percent = (x, d = 1, sign = false) =>
  x == null || Number.isNaN(x) ? '–' : `${sign && x > 0 ? '+' : ''}${f(d).format(x)} %`;
export const compact = (x) =>
  x == null ? '–' : new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 }).format(x);

export function dateDe(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function dateTimeDe(isoStamp) {
  if (!isoStamp) return '–';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(isoStamp)) + ' Uhr';
}
