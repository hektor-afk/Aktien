// Stufe 2: Rechner, Watchlist, Portfolio, Journal, Kauf eintragen, Einstellungen.
import { html, raw, icon, infoBtn, openSheet, closeSheet, refresh } from './ui.js';
import { stockCard, emptyState, signalBadge, changeText, dots } from './components.js';
import { getRisk, setRisk, RISK_DEFAULTS, trades, watch, findStock, allStocks } from './db.js';
import { positionSize } from '../core/position.js';
import { portfolioStatus, positionRisk, pnl, closedResult, lossStreak, checkNewTrade, sellCheck, trailSuggestion } from '../core/portfolio.js';
import { num, usd, percent, dateDe } from '../core/format.js';
import { isoDate } from '../core/dates.js';

const today = () => isoDate(new Date());
const val = (root, sel) => parseFloat(String(root.querySelector(sel)?.value ?? '').replace(',', '.'));
const money = (x, d = 2) => usd(x, d);
const sign = (x) => (x >= 0 ? 'up' : 'down');

/* ---------- Auswertung der offenen Positionen (Verkaufsregeln, Stop-Vorschlag) ---------- */
export function evaluateOpen(d) {
  const risk = getRisk(d);
  return trades.open().map((t) => {
    const s = findStock(d, t.ticker);
    const price = s?.price ?? null;
    const sma50 = s?.signal?.sma50 ?? null;
    return {
      t, s, price, sma50,
      pnl: price != null ? pnl(t, price) : null,
      sell: price != null ? sellCheck(t, { price, sma50 }) : { sell: false, reasons: [] },
      trail: price != null ? trailSuggestion(t, { price, sma50 }, { bufferPct: d.settings?.signal?.stopBufferPct ?? 1 }) : null,
      risk: positionRisk(t), capital: risk.capital
    };
  });
}

export function computeAlerts(d) {
  const sell = evaluateOpen(d).filter((x) => x.sell.sell);
  const changed = watch.all().filter((w) => {
    const s = findStock(d, w.ticker);
    return s && w.lastSignal && w.lastSignal !== s.signal.overall;
  });
  return { sell, changed };
}

/* ---------- RECHNER ---------- */
export function rechner(d, ticker) {
  const risk = getRisk(d);
  const s = ticker ? findStock(d, ticker) : null;
  const entry = s?.signal.entry ?? '';
  const stop = s?.signal.stop != null ? Number(s.signal.stop.toFixed(2)) : '';
  return {
    view: html`<h1 class="page-title">Rechner</h1>
    ${s ? html`<div class="chips" style="margin:-4px 2px 12px"><span class="chip">Werte von ${s.ticker} übernommen</span></div>` : ''}
    <section class="card stack">
      <div class="input-row"><div><label for="cap">Kapital ($)</label><input id="cap" type="number" inputmode="decimal" value="${risk.capital}"></div>
        <div><label for="rk">Risiko pro Trade (%) ${infoBtn('stueck')}</label><input id="rk" type="number" inputmode="decimal" step="0.1" value="${risk.riskPerTradePct}"></div></div>
      <div class="input-row"><div><label for="en">Einstiegskurs ($)</label><input id="en" type="number" inputmode="decimal" step="0.01" value="${entry}"></div>
        <div><label for="st">Stop-Loss ($) ${infoBtn('stop')}</label><input id="st" type="number" inputmode="decimal" step="0.01" value="${stop}"></div></div>
      <div id="out"></div>
    </section>
    <div class="note" style="margin-top:12px">Kapital und Risiko werden in den Einstellungen gespeichert und gelten überall.</div>`,
    after(root) {
      const calc = () => {
        const capital = val(root, '#cap'), riskPct = val(root, '#rk'), en = val(root, '#en'), st = val(root, '#st');
        if (capital > 0 && riskPct > 0) setRisk({ capital, riskPerTradePct: riskPct });
        const p = positionSize({ capital, riskPct, entry: en, stop: st, fee: risk.fee, maxStopPct: d.settings?.signal?.maxStopPct ?? 8 });
        const out = root.querySelector('#out');
        if (!p.valid) { out.innerHTML = html`<p class="muted" style="margin:0">Gib Einstieg und Stop ein. Der Stop muss unter dem Einstieg liegen.</p>`.s; return; }
        const open = trades.open();
        const st0 = portfolioStatus(open, capital);
        const after = ((st0.riskAmount + p.maxLoss) / capital) * 100;
        const over = after > risk.maxOpenRiskPct;
        out.innerHTML = html`
          ${p.stopTooWide ? html`<div class="banner red" style="margin:0 0 14px">${icon.warn}<div><b>Stop ${percent(p.stopPct, 1)} entfernt.</b> Mehr als ca. 8 % – das Risiko pro Aktie ist hoch. Kleinere Stückzahl oder engerer Stop?</div></div>` : ''}
          <dl class="kv">
            <dt>Stop-Abstand</dt><dd class="${p.stopTooWide ? 'down' : ''}">${percent(p.stopPct, 1)}<small>${usd(p.riskPerShare)} pro Aktie</small></dd>
            <dt>Stückzahl</dt><dd style="font-size:24px">${num(p.shares, 0)}${p.cappedByCapital ? html`<small>durch Kapital begrenzt</small>` : ''}</dd>
            <dt>Positionsgröße</dt><dd>${usd(p.positionValue, 0)}<small>${percent(p.positionPct, 0)} vom Kapital</small></dd>
            <dt>Maximaler Verlust</dt><dd class="down">${usd(p.maxLoss, 0)}<small>${percent(p.maxLossPct, 2)} vom Kapital${risk.fee ? ` (inkl. Gebühren)` : ''}</small></dd>
          </dl>
          <div class="note ${over ? 'red' : ''}" style="margin-top:12px">Gesamtrisiko danach: ${percent(after, 1)} von ${risk.maxOpenRiskPct} % erlaubt${over ? ' – Limit überschritten, der Kauf wäre gesperrt.' : '.'}</div>`.s;
      };
      root.querySelectorAll('input').forEach((i) => i.addEventListener('input', calc));
      calc();
    }
  };
}

/* ---------- WATCHLIST ---------- */
export function watchlist(d) {
  const items = watch.all();
  const missing = items.filter((w) => !findStock(d, w.ticker)).map((w) => w.ticker);
  const rows = items.map((w, i) => {
    const s = findStock(d, w.ticker);
    if (!s) {
      return html`<div class="card fade-in" style="--i:${i}"><div class="stock-top"><div class="stock-id"><div class="ticker">${w.ticker}</div><div class="name">Keine aktuellen Daten</div></div>
        <button class="chip" data-unwatch="${w.ticker}" type="button">Entfernen</button></div></div>`;
    }
    const changed = w.lastSignal && w.lastSignal !== s.signal.overall;
    return html`<div class="fade-in" style="--i:${i}">
      ${changed ? html`<div class="banner amber" style="margin:0 0 6px">${icon.info}<div><b>Signal geändert:</b> ${w.lastLabel} → ${s.signal.label}
        <button class="chip" data-ack="${w.ticker}" type="button" style="border:0;margin-left:6px">Verstanden</button></div></div>` : ''}
      ${stockCard(s, 0, { marketWeak: d.market?.status === 'red' })}
      <div style="display:flex;justify-content:space-between;align-items:center;margin:4px 6px 0"><span class="note">${s.inScreener === false ? 'Nicht mehr im Screener' : 'Im Screener'}</span><button class="chip" data-unwatch="${w.ticker}" type="button" style="border:0">Entfernen</button></div>
    </div>`;
  });
  return {
    view: html`<h1 class="page-title">Watchlist</h1>
    <form class="controls" id="addForm" style="grid-template-columns:1fr auto"><input id="addTicker" class="search" style="grid-column:auto" placeholder="Ticker hinzufügen, z. B. LUMR" autocapitalize="characters" aria-label="Ticker"><button class="chip" type="submit" style="padding:0 18px;border:0;font-size:15px">Merken</button></form>
    ${items.length ? html`<div class="list">${rows}</div>` : emptyState({ title: 'Noch nichts gemerkt', text: 'Tippe auf der Detailseite einer Aktie auf den Stern, oder gib oben einen Ticker ein. Die Watchlist behält Aktien auch dann, wenn sie den Screener verlassen.', art: icon.star })}
    ${missing.length ? html`<div class="card" style="margin-top:14px"><h3>${icon.info} Für ${missing.length} Aktie(n) fehlen Daten</h3><p class="muted" style="margin:0 0 8px;font-size:14px">Das Nacht-Skript lädt nur Screener-Treffer. Trage diese Ticker in <code>config/settings.json</code> ein, dann werden sie mitgeladen:</p>
      <input readonly value='"trackTickers": ${JSON.stringify([...new Set([...missing, ...(d.settings?.trackTickers || [])])])}' onclick="this.select()" aria-label="Zeile zum Kopieren"></div>` : ''}`,
    after(root) {
      root.querySelector('#addForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const t = root.querySelector('#addTicker').value.trim().toUpperCase();
        if (!/^[A-Z.\-]{1,6}$/.test(t)) return;
        watch.add(t, findStock(d, t)); refresh();
      });
      root.querySelectorAll('[data-unwatch]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); watch.remove(b.dataset.unwatch); refresh(); }));
      root.querySelectorAll('[data-ack]').forEach((b) => b.addEventListener('click', () => { watch.ack(b.dataset.ack, findStock(d, b.dataset.ack)); refresh(); }));
    }
  };
}

/* ---------- PORTFOLIO + JOURNAL ---------- */
let tab = 'offen';
const meter = (label, value, max, text, info = '') => {
  const ratio = max > 0 ? value / max : 0;
  const color = ratio >= 1 ? 'var(--red)' : ratio >= 0.7 ? 'var(--amber)' : 'var(--green)';
  return html`<div class="rs-row"><div class="rs-head"><span>${label} ${info}</span><b style="color:${color}">${text}</b></div>
    <div class="rs-bar"><i style="width:${Math.min(100, ratio * 100)}%;background:${color}"></i></div></div>`;
};

export function portfolio(d) {
  const risk = getRisk(d);
  const ev = evaluateOpen(d);
  const open = ev.map((x) => x.t);
  const st = portfolioStatus(open, risk.capital);
  const closed = trades.closed();
  const streak = lossStreak(closed);
  const sellN = ev.filter((x) => x.sell.sell).length;

  const warnings = html`
    ${streak >= 3 ? html`<div class="banner red">${icon.pause}<div><b>Pause einlegen, Strategie prüfen.</b> ${streak} Verluste in Folge.</div></div>` : ''}
    ${st.crowded.map((c) => html`<div class="banner amber">${icon.warn}<div><b>Zu viel in einer Branche:</b> ${c.n} offene Positionen in „${c.industry}“ (mehr als ${risk.maxPerIndustry}).</div></div>`)}
    ${d.market?.status === 'red' ? html`<div class="banner amber">${icon.warn}<div><b>Markt schwach.</b> Vorsicht bei neuen Käufen und bei Stops.</div></div>` : ''}`;

  const limit = html`<section class="card fade-in">
    <h3>Gesamtrisiko ${infoBtn('stop')}</h3>
    ${meter('In offenen Stops', st.riskPct, risk.maxOpenRiskPct, `${percent(st.riskPct, 1)} von ${risk.maxOpenRiskPct} %`)}
    ${meter('Positionen', st.count, risk.maxPositions, `${st.count} von ${risk.maxPositions}`)}
    ${st.riskPct >= risk.maxOpenRiskPct || st.count >= risk.maxPositions ? html`<div class="note red">Limit erreicht: Neue Käufe sind gesperrt, bis Risiko oder Positionen sinken.</div>` : html`<div class="note">${money(st.riskAmount, 0)} von ${money(risk.capital, 0)} Kapital liegen in offenen Stops.</div>`}
  </section>`;

  const card = (x, i) => {
    const { t, s, price } = x;
    const dist = x.pnl?.distToStopPct;
    return html`<section class="card fade-in" style="--i:${i}">
      <div class="stock-top"><div class="stock-id"><a href="#/aktie/${t.ticker}" class="ticker">${t.ticker}</a><div class="name">${t.company || s?.company || ''}</div><div class="name">${t.industry || ''}</div></div>
        <div class="price-col">${x.pnl ? html`<div class="price ${sign(x.pnl.value)}">${percent(x.pnl.pct, 1, true)}</div><div class="chg ${sign(x.pnl.value)}">${x.pnl.value >= 0 ? '+' : ''}${money(x.pnl.value, 0)}</div>` : html`<div class="muted" style="font-size:13px">kein aktueller Kurs</div>`}</div></div>
      ${x.sell.sell ? html`<div class="banner red" style="margin:12px 0 0">${icon.warn}<div><b>Verkaufen prüfen</b><br>${x.sell.reasons.map((r) => html`${r}<br>`)}</div></div>` : ''}
      ${x.trail ? html`<div class="banner" style="margin:12px 0 0">${icon.up}<div><b>Stop nachziehen auf ${usd(x.trail.stop)}?</b><br>${x.trail.why}
        <br><button class="chip green" data-trail="${t.id}" data-stop="${x.trail.stop.toFixed(2)}" type="button" style="border:0;margin-top:6px">Stop übernehmen</button></div></div>` : ''}
      <dl class="kv" style="margin-top:14px">
        <dt>Einstieg × Stück</dt><dd>${usd(t.entry)} × ${num(t.shares, 0)}</dd>
        <dt>Aktueller Kurs</dt><dd>${price != null ? usd(price) : '–'}</dd>
        <dt>Stop</dt><dd class="${x.sell.sell ? 'down' : ''}">${usd(t.stop)}${dist != null ? html`<small>${percent(dist, 1)} unter dem Kurs</small>` : ''}</dd>
        <dt>Risiko</dt><dd>${x.risk > 0 ? money(x.risk, 0) : html`<span class="up">abgesichert</span>`}</dd>
      </dl>
      ${t.reason || t.note ? html`<div class="note" style="margin-top:10px">${t.reason ? `Grund: ${t.reason}` : ''}${t.reason && t.note ? ' · ' : ''}${t.note || ''}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px"><button class="chip" data-edit="${t.id}" type="button" style="border:0;padding:8px 14px">Stop/Notiz ändern</button><button class="chip" data-close="${t.id}" type="button" style="border:0;padding:8px 14px">Verkauf eintragen</button></div>
    </section>`;
  };

  const offen = html`${warnings}${limit}
    <div class="section-title"><h2>Offene Positionen</h2><span>${ev.length}${sellN ? ` · ${sellN}× Verkaufen prüfen` : ''}</span></div>
    ${ev.length ? html`<div class="list">${ev.map(card)}</div>` : emptyState({ title: 'Keine offenen Positionen', text: 'Wenn du eine Aktie gekauft hast, trage sie hier ein. Die App überwacht dann Stop und SMA 50 für dich.', art: icon.briefcase })}`;

  const sortedClosed = [...closed].sort((a, b) => (a.closedAt < b.closedAt ? 1 : -1));
  const total = closed.reduce((s, t) => s + closedResult(t).value, 0);
  const journal = html`
    <div class="stats"><div class="stat"><b>${closed.length}</b><span>Trades</span></div><div class="stat ${total >= 0 ? 'green' : ''}"><b class="${sign(total)}">${total >= 0 ? '+' : ''}${money(total, 0)}</b><span>Gesamt</span></div><div class="stat"><b>${closed.length ? num((closed.filter((t) => closedResult(t).value > 0).length / closed.length) * 100, 0) : '–'}${closed.length ? ' %' : ''}</b><span>Trefferquote</span></div></div>
    ${streak >= 3 ? html`<div class="banner red" style="margin-top:14px">${icon.pause}<div><b>Pause einlegen, Strategie prüfen.</b> ${streak} Verluste in Folge.</div></div>` : ''}
    <div class="list" style="margin-top:14px">${sortedClosed.length ? sortedClosed.map((t, i) => {
      const r = closedResult(t);
      return html`<div class="card fade-in" style="--i:${Math.min(i, 10)}"><div class="stock-top"><div class="stock-id"><div class="ticker" style="font-size:18px">${t.ticker}</div><div class="name">${dateDe(t.openedAt)} → ${dateDe(t.closedAt)}</div></div>
        <div class="price-col"><div class="price ${sign(r.value)}">${r.value >= 0 ? '+' : ''}${money(r.value, 0)}</div><div class="chg ${sign(r.value)}">${percent(r.pct, 1, true)}${r.r != null ? ` · ${num(r.r, 1)} R` : ''}</div></div></div>
        <div class="note">${usd(t.entry)} → ${usd(t.exit)} × ${num(t.shares, 0)}${t.reason ? ` · Grund: ${t.reason}` : ''}${t.note ? ` · ${t.note}` : ''}${t.exitNote ? ` · Ausstieg: ${t.exitNote}` : ''}</div>
        <button class="chip" data-del="${t.id}" type="button" style="border:0;margin-top:8px">Löschen</button></div>`;
    }) : emptyState({ title: 'Noch keine abgeschlossenen Trades', text: 'Wenn du eine Position verkaufst, speichert die App das Ergebnis hier. Das Journal zeigt dir ehrlich, was funktioniert.', art: icon.chart })}</div>`;

  return {
    view: html`<div style="display:flex;justify-content:space-between;align-items:center"><h1 class="page-title">Portfolio</h1><a class="chip green" href="#/kauf" style="padding:8px 14px;font-weight:700">+ Kauf eintragen</a></div>
      <div class="seg" role="group" aria-label="Ansicht" style="margin-bottom:14px"><button data-tab="offen" aria-pressed="${tab === 'offen'}">Offen</button><button data-tab="journal" aria-pressed="${tab === 'journal'}">Journal</button></div>
      ${tab === 'offen' ? offen : journal}`,
    after(root) {
      root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; refresh(); }));
      root.querySelectorAll('[data-trail]').forEach((b) => b.addEventListener('click', () => { trades.update(b.dataset.trail, { stop: parseFloat(b.dataset.stop) }); refresh(); }));
      root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { if (confirm('Diesen Eintrag löschen?')) { trades.remove(b.dataset.del); refresh(); } }));
      root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editSheet(trades.all().find((t) => t.id === b.dataset.edit))));
      root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheetForm(d, trades.all().find((t) => t.id === b.dataset.close))));
    }
  };
}

function editSheet(t) {
  openSheet(html`<h3>${t.ticker}: Stop und Notiz</h3>
    <div class="input-row"><div><label for="eStop">Stop ($)</label><input id="eStop" type="number" inputmode="decimal" step="0.01" value="${t.stop}"></div><div><label for="eShares">Stückzahl</label><input id="eShares" type="number" inputmode="numeric" value="${t.shares}"></div></div>
    <label class="muted" for="eNote" style="font-size:12px">Notiz</label><input id="eNote" value="${t.note || ''}">
    <button id="eSave" class="chip green" type="button" style="border:0;margin-top:14px;padding:12px 18px;width:100%;justify-content:center;font-size:15px">Speichern</button>`, (sh) => {
    sh.querySelector('#eSave').onclick = () => {
      const stop = val(sh, '#eStop'), shares = val(sh, '#eShares');
      if (!(stop > 0) || !(shares > 0)) return;
      trades.update(t.id, { stop, shares: Math.round(shares), note: sh.querySelector('#eNote').value.trim() });
      closeSheet(); refresh();
    };
  });
}

function closeSheetForm(d, t) {
  const s = findStock(d, t.ticker);
  openSheet(html`<h3>${t.ticker}: Verkauf eintragen</h3>
    <div class="input-row"><div><label for="xPrice">Verkaufskurs ($)</label><input id="xPrice" type="number" inputmode="decimal" step="0.01" value="${s?.price ?? ''}"></div><div><label for="xDate">Datum</label><input id="xDate" type="date" value="${today()}"></div></div>
    <label class="muted" for="xNote" style="font-size:12px">Notiz zum Ausstieg (z. B. „Stop ausgelöst“)</label><input id="xNote">
    <div id="xPreview" class="note" style="margin-top:10px"></div>
    <button id="xSave" class="chip green" type="button" style="border:0;margin-top:14px;padding:12px 18px;width:100%;justify-content:center;font-size:15px">Als abgeschlossen speichern</button>`, (sh) => {
    const prev = () => {
      const p = val(sh, '#xPrice');
      sh.querySelector('#xPreview').innerHTML = p > 0 ? html`Ergebnis: <b class="${sign(p - t.entry)}">${money((p - t.entry) * t.shares - 2 * getRisk(d).fee, 0)}</b> (${percent((p / t.entry - 1) * 100, 1, true)})`.s : '';
    };
    sh.querySelector('#xPrice').addEventListener('input', prev); prev();
    sh.querySelector('#xSave').onclick = () => {
      const exit = val(sh, '#xPrice');
      if (!(exit > 0)) return;
      trades.update(t.id, { status: 'closed', exit, closedAt: sh.querySelector('#xDate').value || today(), exitNote: sh.querySelector('#xNote').value.trim(), fees: 2 * getRisk(d).fee });
      tab = 'journal'; closeSheet(); refresh();
    };
  });
}

/* ---------- KAUF EINTRAGEN (mit Checkliste) ---------- */
export function kauf(d, ticker) {
  const risk = getRisk(d);
  const s0 = ticker ? findStock(d, ticker) : null;
  const sg = s0?.signal;
  const dflt = { entry: sg?.entry ?? '', stop: sg?.stop != null ? Number(sg.stop.toFixed(2)) : '' };
  if (dflt.entry && dflt.stop) {
    const p = positionSize({ capital: risk.capital, riskPct: risk.riskPerTradePct, entry: dflt.entry, stop: dflt.stop });
    dflt.shares = p.valid ? p.shares : '';
  }
  return {
    view: html`<a class="back" href="#/portfolio">${icon.back} Portfolio</a><h1 class="page-title">Kauf eintragen</h1>
    <div class="stack">
      <section class="card"><h3>Vor dem Kauf: Checkliste</h3><div id="check"></div></section>
      <section class="card stack">
        <div class="input-row"><div><label for="kT">Ticker</label><input id="kT" value="${s0?.ticker ?? ''}" autocapitalize="characters" placeholder="z. B. LUMR"></div><div><label for="kD">Datum</label><input id="kD" type="date" value="${today()}"></div></div>
        <div class="input-row"><div><label for="kE">Einstieg ($)</label><input id="kE" type="number" inputmode="decimal" step="0.01" value="${dflt.entry}"></div><div><label for="kS">Stop ($)</label><input id="kS" type="number" inputmode="decimal" step="0.01" value="${dflt.stop}"></div></div>
        <div class="input-row"><div><label for="kN">Stückzahl</label><input id="kN" type="number" inputmode="numeric" value="${dflt.shares ?? ''}"></div><div><label for="kI">Branche</label><input id="kI" value="${s0?.industry ?? ''}" placeholder="z. B. Software - Application"></div></div>
        <div class="input-row"><div><label for="kR">Grund</label><select id="kR"><option>Ausbruch</option><option>Rücksetzer</option><option>Sonstiges</option></select></div><div><label for="kO">Notiz</label><input id="kO" placeholder="optional"></div></div>
        <div id="kSize" class="note"></div>
      </section>
      <label id="ackRow" class="note" style="display:none;align-items:flex-start;gap:8px"><input type="checkbox" id="ack" style="width:auto;margin-top:3px"><span>Ich habe die Warnungen gelesen und kaufe bewusst trotzdem.</span></label>
      <div id="lock" class="banner red" style="display:none">${icon.pause}<div id="lockText"></div></div>
      <button id="kSave" class="chip green" type="button" style="border:0;padding:14px 18px;justify-content:center;font-size:16px;font-weight:700;width:100%" disabled>Kauf eintragen</button>
    </div>`,
    after(root) {
      const streak = lossStreak(trades.closed());
      const recalc = () => {
        const tk = root.querySelector('#kT').value.trim().toUpperCase();
        const stock = tk ? findStock(d, tk) : null;
        const trade = { ticker: tk, entry: val(root, '#kE'), stop: val(root, '#kS'), shares: val(root, '#kN'), industry: root.querySelector('#kI').value.trim() };
        const res = checkNewTrade({ open: trades.open(), capital: risk.capital, risk, maxStopPct: d.settings?.signal?.maxStopPct ?? 8, trade, stock, market: d.market, streak });
        root.querySelector('#check').innerHTML = html`${res.items.map((i) => html`<div class="crit"><i class="dot ${i.status === 'amber' ? '' : i.status}" style="${i.status === 'amber' ? 'background:var(--amber);box-shadow:none' : ''}"></i><h4><span style="font-weight:650">${i.label}</span></h4><p>${i.text}</p></div>`)}`.s;
        const p = positionSize({ capital: risk.capital, riskPct: risk.riskPerTradePct, entry: trade.entry, stop: trade.stop });
        root.querySelector('#kSize').textContent = p.valid ? `Passend zu ${risk.riskPerTradePct} % Risiko: ${p.shares} Stück (Positionsgröße ${Math.round(p.positionValue)} $).` : '';
        const needAck = !res.allGreen && !res.locked;
        root.querySelector('#ackRow').style.display = needAck ? 'flex' : 'none';
        root.querySelector('#lock').style.display = res.locked ? 'flex' : 'none';
        root.querySelector('#lockText').textContent = res.lockReason ?? '';
        const valid = trade.ticker && trade.entry > 0 && trade.stop > 0 && trade.stop < trade.entry && trade.shares >= 1;
        root.querySelector('#kSave').disabled = !valid || res.locked || (needAck && !root.querySelector('#ack').checked);
        return { stock };
      };
      root.querySelector('#kT').addEventListener('change', () => {
        const stock = findStock(d, root.querySelector('#kT').value.trim());
        if (stock) {
          if (!root.querySelector('#kI').value) root.querySelector('#kI').value = stock.industry;
          if (!root.querySelector('#kE').value && stock.signal.entry) { root.querySelector('#kE').value = stock.signal.entry; root.querySelector('#kS').value = stock.signal.stop.toFixed(2); }
        }
        recalc();
      });
      root.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', recalc));
      recalc();
      root.querySelector('#kSave').addEventListener('click', () => {
        const { stock } = recalc();
        trades.add({
          ticker: root.querySelector('#kT').value.trim().toUpperCase(), company: stock?.company ?? '', industry: root.querySelector('#kI').value.trim(),
          entry: val(root, '#kE'), stop: val(root, '#kS'), shares: Math.round(val(root, '#kN')),
          reason: root.querySelector('#kR').value, note: root.querySelector('#kO').value.trim(), openedAt: root.querySelector('#kD').value || today()
        });
        tab = 'offen';
        location.hash = '#/portfolio';
      });
    }
  };
}

/* ---------- EINSTELLUNGEN (Stufe 2: Risiko und Limits) ---------- */
export function einstellungen(d) {
  const r = getRisk(d);
  const f = (id, label, v, step = '1', hint = '') => html`<div><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="decimal" step="${step}" value="${v}">${hint ? html`<div class="note" style="margin-top:4px">${hint}</div>` : ''}</div>`;
  return {
    view: html`<h1 class="page-title">Einstellungen</h1>
    <section class="card stack"><h3>Kapital und Risiko</h3>
      <div class="input-row">${f('sCap', 'Kapital ($)', r.capital)}${f('sRisk', 'Risiko pro Trade (%)', r.riskPerTradePct, '0.1')}</div>
      <div class="input-row">${f('sMaxRisk', 'Gesamtrisiko-Limit (%)', r.maxOpenRiskPct, '0.5', 'Höchstens so viel % in offenen Stops')}${f('sMaxPos', 'Max. Positionen', r.maxPositions)}</div>
      <div class="input-row">${f('sInd', 'Max. pro Branche', r.maxPerIndustry)}${f('sFee', 'Gebühr pro Order ($)', r.fee, '0.01')}</div>
      <button id="sReset" class="chip" type="button" style="border:0;align-self:flex-start;padding:8px 14px">Auf Standard zurücksetzen</button>
      <div id="saved" class="note" aria-live="polite"></div>
    </section>
    <div class="note" style="margin-top:12px">Gespeichert wird nur in diesem Browser. Filterwerte des Screeners änderst du bis Stufe 3 in <code>config/defaults.js</code> oder <code>config/settings.json</code>. Benachrichtigungen, Euro-Anzeige und Datensicherung folgen in Stufe 3.</div>`,
    after(root) {
      const save = () => {
        const patch = { capital: val(root, '#sCap'), riskPerTradePct: val(root, '#sRisk'), maxOpenRiskPct: val(root, '#sMaxRisk'), maxPositions: Math.round(val(root, '#sMaxPos')), maxPerIndustry: Math.round(val(root, '#sInd')), fee: val(root, '#sFee') || 0 };
        if (Object.values(patch).some((x) => !Number.isFinite(x) || x < 0) || patch.capital <= 0 || patch.riskPerTradePct <= 0) { root.querySelector('#saved').textContent = 'Bitte gültige Zahlen eingeben.'; return; }
        setRisk(patch); root.querySelector('#saved').textContent = 'Gespeichert.';
      };
      root.querySelectorAll('input').forEach((i) => i.addEventListener('input', save));
      root.querySelector('#sReset').addEventListener('click', () => { setRisk({ ...RISK_DEFAULTS, ...(d.settings?.risk || {}) }); refresh(); });
    }
  };
}
