// Benachrichtigungen: ein Hinweis pro Abend bei neuen Kaufsignalen, sofort bei "Verkaufen prüfen".
// Versand über ntfy (kostenlose Push-App, kein Konto nötig). Optional zusätzlich als E-Mail.
import { sellCheck } from '../../web/core/portfolio.js';
import { num, usd } from '../../web/core/format.js';

export function buildNotifications({ snapshot, previous, positions = [], settings = {}, siteUrl = '' }) {
  const cfg = { newSignals: true, sellAlerts: true, errors: true, ...(settings.notifications || {}) };
  const out = [];
  const click = siteUrl || undefined;

  if (snapshot.meta.status === 'fehler') {
    if (cfg.errors) out.push({ kind: 'fehler', title: 'Aktien-App: Update fehlgeschlagen', message: snapshot.meta.messages.map((m) => m.text).join('\n'), priority: 4, tags: ['warning'], click });
    return out;
  }

  const all = [...snapshot.stocks, ...(snapshot.tracked || [])];

  if (cfg.sellAlerts) {
    const hits = [];
    for (const t of positions.filter((p) => p.status === 'open')) {
      const s = all.find((x) => x.ticker === t.ticker);
      if (!s) continue;
      const r = sellCheck(t, { price: s.price, sma50: s.signal.sma50 });
      if (r.sell) hits.push({ t, r });
    }
    if (hits.length) {
      out.push({
        kind: 'verkaufen', title: `Verkaufen prüfen: ${hits.map((h) => h.t.ticker).join(', ')}`,
        message: hits.map((h) => `${h.t.ticker}: ${h.r.reasons.join(' ')}`).join('\n'), priority: 5, tags: ['rotating_light'], click: click && `${click}#/portfolio`
      });
    }
  }

  if (cfg.newSignals) {
    const before = previous?.stocks ? new Set(previous.stocks.filter((s) => s.signal.overall === 'kaufsignal').map((s) => s.ticker)) : new Set();
    const fresh = snapshot.stocks.filter((s) => s.signal.overall === 'kaufsignal' && !before.has(s.ticker));
    if (fresh.length) {
      const weak = snapshot.market?.status === 'red';
      const lines = fresh.slice(0, 8).map((s) => `${s.ticker} (${s.company}): Einstieg ${num(s.signal.entryMin)}–${usd(s.signal.entryMax)}, Stop ${usd(s.signal.stop)}`);
      if (fresh.length > 8) lines.push(`… und ${fresh.length - 8} weitere`);
      out.push({
        kind: 'signale', title: `${fresh.length} ${fresh.length === 1 ? 'neues Kaufsignal' : 'neue Kaufsignale'}`,
        message: `${weak ? 'Markt schwach, Pause oder kleinere Einsätze.\n' : ''}${lines.join('\n')}`, priority: 3, tags: ['chart_with_upwards_trend'], click
      });
    }
  }
  return out;
}

export async function sendNotifications(list, { topic, server = 'https://ntfy.sh', email, fetchImpl = fetch, log = () => {} }) {
  if (!topic) { log('Keine Benachrichtigung: NTFY_TOPIC nicht gesetzt.'); return 0; }
  let sent = 0;
  for (const n of list) {
    const body = { topic, title: n.title, message: n.message, priority: n.priority, tags: n.tags, ...(n.click ? { click: n.click } : {}), ...(email ? { email } : {}) };
    const res = await fetchImpl(server, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) log(`Benachrichtigung fehlgeschlagen (HTTP ${res.status}): ${n.title}`); else sent++;
  }
  return sent;
}
