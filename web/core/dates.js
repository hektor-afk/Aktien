// Datums-Helfer. Daten sind immer ISO-Strings "YYYY-MM-DD".

const MS_DAY = 86_400_000;
const toUtc = (iso) => Date.parse(iso + 'T00:00:00Z');

export const daysBetween = (fromIso, toIso) => Math.round((toUtc(toIso) - toUtc(fromIso)) / MS_DAY);

export function isoDate(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  return new Date(toUtc(iso) + n * MS_DAY).toISOString().slice(0, 10);
}

export const isWeekend = (iso) => [0, 6].includes(new Date(toUtc(iso)).getUTCDay());

export function lastWeekdayOnOrBefore(iso) {
  let d = iso;
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

export function previousWeekday(iso) {
  return lastWeekdayOnOrBefore(addDays(iso, -1));
}

/** Datum und Uhrzeit in Berlin als {date, hour} – unabhängig von der Zeitzone des Geräts. */
export function berlinParts(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/**
 * Welcher Handelstag müsste in den Daten stehen? US-Börse schließt 22:00 deutscher Zeit,
 * das Skript läuft danach. Vor 23 Uhr rechnen wir deshalb noch mit dem Vortag.
 * (US-Feiertage kennt die Funktion nicht – darum nur eine Warnung, kein Fehler.)
 */
export function expectedTradingDate(now = new Date()) {
  const { date, hour } = berlinParts(now);
  if (!isWeekend(date) && hour >= 23) return date;
  return previousWeekday(date);
}

/** Zahl der Wochentage zwischen zwei Daten (a < b), grob als Maß für "wie veraltet". */
export function weekdaysBetween(a, b) {
  let n = 0;
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (!isWeekend(d)) n++;
  return n;
}

/** Finviz-Datum ("10/23/2026 AMC", "Oct 23 AMC", ISO) -> {date, time} oder null. */
export function parseEarningsDate(text, today = isoDate(new Date())) {
  if (!text) return null;
  const t = String(text).trim();
  const time = /\b(BMO|AMC)\b/i.exec(t)?.[1]?.toUpperCase() ?? null;
  let m;
  if ((m = /(\d{4})-(\d{2})-(\d{2})/.exec(t))) return { date: `${m[1]}-${m[2]}-${m[3]}`, time };
  if ((m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t))) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return { date: `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`, time };
  }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if ((m = /([A-Za-z]{3})[a-z]*\s+(\d{1,2})/.exec(t))) {
    const mi = months.indexOf(m[1].toLowerCase());
    if (mi < 0) return null;
    let y = Number(today.slice(0, 4));
    let date = `${y}-${String(mi + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    // Ohne Jahr: der Termin liegt in der Zukunft; liegt er weit zurück, ist es das nächste Jahr.
    if (daysBetween(date, today) > 60) date = `${y + 1}${date.slice(4)}`;
    return { date, time };
  }
  return null;
}
