import { html, raw, icon, infoBtn, refresh } from './ui.js';
import { stockCard, emptyState, skeleton, signalBadge, changeText, dots, tone } from './components.js';
import { drawChart, palette } from './chart.js';
import { num, usd, percent, dateDe, dateTimeDe, compact } from '../core/format.js';
import { positionSize } from '../core/position.js';
import { getRisk, setRisk, watch } from './db.js';
import { computeAlerts } from './pages-trade.js';

const isWeak = (d) => d.market?.status === 'red';

/* ---------- HEUTE ---------- */
export function heute(d) {
  const m = d.market;
  const sig = d.stocks.filter((s) => s.signal.overall === 'kaufsignal');
  const fast = d.stocks.filter((s) => s.signal.overall === 'fast');
  const weak = isWeak(d);

  const market = m ? html`
    <section class="card market ${m.status} fade-in" aria-label="Marktampel">
      <div class="light">${m.status === 'green' ? icon.check : m.status === 'red' ? icon.pause : icon.info}</div>
      <div>
        <h2>${m.text} ${infoBtn('markt')}</h2>
        ${m.close ? html`<p>S&amp;P 500 (SPY) ${num(m.close)} · SMA 200 ${num(m.sma200)} (${percent(m.distancePct, 1, true)})</p>` : html`<p>${m.detail}</p>`}
      </div>
    </section>` : '';

  const stats = html`
    <div class="stats">
      <div class="stat green fade-in" style="--i:1"><b>${sig.length}</b><span>Kaufsignale</span></div>
      <div class="stat amber fade-in" style="--i:2"><b>${fast.length}</b><span>Fast</span></div>
      <div class="stat fade-in" style="--i:3"><b>${d.stocks.length}</b><span>Treffer</span></div>
    </div>`;

  const section = (title, list, sub) => list.length ? html`
    <div class="section-title"><h2>${title}</h2><span>${sub}</span></div>
    <div class="list">${list.map((s, i) => stockCard(s, i, { marketWeak: weak }))}</div>` : '';

  const none = !sig.length ? emptyState({
    title: 'Heute kein Kaufsignal',
    text: 'Das ist ein normales Ergebnis. Warten schützt dein Geld – gute Gelegenheiten kommen wieder.',
    art: icon.pause
  }) : '';

  const src = d.meta.sources?.screener ? html`<div class="source">Kennzahlen: ${d.meta.sources.screener} · Kurse: ${d.meta.sources.prices} · Handelstag ${dateDe(d.meta.asOf)}</div>` : '';

  if (d.meta.status === 'fehler' || !d.stocks.length && !m) {
    return html`<h1 class="page-title">Heute</h1>${emptyState({ title: 'Keine aktuellen Daten', text: 'Der letzte Abruf ist fehlgeschlagen. Details stehen oben im roten Hinweis. Alte Zahlen zeige ich bewusst nicht.', art: icon.warn })}`;
  }
  const alerts = computeAlerts(d);
  const sellBanner = alerts.sell.length ? html`<a class="banner red" href="#/portfolio" role="alert">${icon.warn}<div><b>Verkaufen prüfen:</b> ${alerts.sell.map((x) => x.t.ticker).join(', ')}. Tippe für die Begründung.</div></a>` : '';
  return html`<h1 class="page-title">Heute</h1>${sellBanner}${market}${stats}
    ${section('Kaufsignale', sig, weak ? 'grau: Markt schwach' : 'alle 7 Kriterien grün')}
    ${none}
    ${section('Fast', fast, 'mindestens 5 von 7')}
    ${!d.stocks.length ? emptyState({ title: 'Keine Treffer', text: 'Kein Wert erfüllt heute alle Screener-Kriterien.', art: icon.search }) : ''}
    ${src}`;
}

/* ---------- TREFFER ---------- */
const filt = { q: '', signal: '', industry: '', sort: 'rank' };
const SORTS = {
  rank: ['Ranking', null],
  perf6m: ['6-Monats-Performance', (a, b) => b.perf6m - a.perf6m],
  change: ['Tagesänderung', (a, b) => b.changePct - a.changePct],
  ticker: ['Ticker A–Z', (a, b) => a.ticker.localeCompare(b.ticker)],
  price: ['Kurs', (a, b) => b.price - a.price]
};

function trefferList(d) {
  const q = filt.q.trim().toLowerCase();
  let list = d.stocks.filter((s) =>
    (!q || s.ticker.toLowerCase().includes(q) || s.company.toLowerCase().includes(q)) &&
    (!filt.signal || s.signal.overall === filt.signal) &&
    (!filt.industry || s.industry === filt.industry));
  if (SORTS[filt.sort][1]) list = [...list].sort(SORTS[filt.sort][1]);
  return list;
}

export function treffer(d) {
  const inds = [...new Set(d.stocks.map((s) => s.industry))].sort();
  const sel = (v, cur) => (v === cur ? 'selected' : '');
  const list = trefferList(d);
  return html`<h1 class="page-title">Treffer</h1>
    <div class="controls">
      <input class="search" id="q" type="search" placeholder="Ticker oder Name suchen" value="${filt.q}" aria-label="Suche">
      <select id="fSignal" aria-label="Signal">
        <option value="">Alle Signale</option>
        <option value="kaufsignal" ${sel('kaufsignal', filt.signal)}>Kaufsignal</option>
        <option value="fast" ${sel('fast', filt.signal)}>Fast</option>
        <option value="noch_nicht" ${sel('noch_nicht', filt.signal)}>Noch nicht</option>
      </select>
      <select id="fInd" aria-label="Branche"><option value="">Alle Branchen</option>${inds.map((i) => html`<option value="${i}" ${sel(i, filt.industry)}>${i}</option>`)}</select>
      <select id="fSort" aria-label="Sortierung" style="grid-column:1/-1">${Object.entries(SORTS).map(([k, [n]]) => html`<option value="${k}" ${sel(k, filt.sort)}>Sortiert nach: ${n}</option>`)}</select>
    </div>
    <div class="section-title" style="margin-top:6px"><h2 id="count">${list.length} von ${d.stocks.length}</h2><span>Screener-Treffer</span></div>
    <div class="list" id="trefferList">${trefferRows(d, list)}</div>`;
}
const trefferRows = (d, list) => list.length
  ? list.map((s, i) => stockCard(s, i, { marketWeak: isWeak(d) }))
  : emptyState({ title: 'Nichts gefunden', text: 'Passe Suche oder Filter an.', art: icon.search });

export function bindTreffer(root, d) {
  const refresh = () => {
    const list = trefferList(d);
    root.querySelector('#trefferList').innerHTML = trefferRows(d, list).s;
    root.querySelector('#count').textContent = `${list.length} von ${d.stocks.length}`;
  };
  root.querySelector('#q').addEventListener('input', (e) => { filt.q = e.target.value; refresh(); });
  root.querySelector('#fSignal').addEventListener('change', (e) => { filt.signal = e.target.value; refresh(); });
  root.querySelector('#fInd').addEventListener('change', (e) => { filt.industry = e.target.value; refresh(); });
  root.querySelector('#fSort').addEventListener('change', (e) => { filt.sort = e.target.value; refresh(); });
}

/* ---------- DETAIL ---------- */
const TERMS = { trend: 'trend', ausbruch: 'ausbruch', volumen: 'volumen', kerze: 'kerze', abstand: 'abstand', bericht: 'bericht', stop: 'stop' };

function rsRow(label, r) {
  if (r.diff == null) return html`<div class="rs-row"><div class="rs-head"><span>${label}</span><span class="muted">keine Daten</span></div></div>`;
  const max = Math.max(Math.abs(r.stock), Math.abs(r.bench), 1);
  return html`<div class="rs-row">
    <div class="rs-head"><span>${label}</span><b class="${r.diff >= 0 ? 'up' : 'down'}">${percent(r.diff, 1, true).replace('%', 'Pp.')} ${r.diff >= 0 ? 'besser' : 'schlechter'}</b></div>
    <div class="rs-bar ${r.stock < 0 ? 'neg' : ''}"><i class="a" style="width:${Math.min(100, Math.abs(r.stock) / max * 100)}%"></i></div>
    <div class="rs-bar" style="margin-top:4px"><i class="a" style="width:${Math.min(100, Math.abs(r.bench) / max * 100)}%;background:var(--gray);opacity:.55"></i></div>
    <div class="note">Aktie ${percent(r.stock, 1, true)} · S&amp;P 500 ${percent(r.bench, 1, true)}</div>
  </div>`;
}

export async function detail(d, ticker) {
  const s = d.stocks.find((x) => x.ticker === ticker);
  if (!s) {
    return { view: html`<a class="back" href="#/treffer">${icon.back} Treffer</a>${emptyState({ title: 'Aktie nicht gefunden', text: `${ticker} steht nicht in den aktuellen Daten.`, art: icon.search })}` };
  }
  let bars = [];
  let barsError = false;
  try {
    const r = await fetch(`data/bars/${encodeURIComponent(ticker)}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    bars = (await r.json()).map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }));
  } catch { barsError = true; }

  const sg = s.signal;
  const weak = isWeak(d);
  const risk = getRisk(d);
  const chase = sg.gapAboveZone || (sg.distancePct != null && sg.distancePct > d.settings.signal.maxExtendedPct);
  const hasLevel = sg.level != null;

  const view = html`
    <a class="back" href="#/treffer">${icon.back} Treffer</a>
    <div class="detail-head fade-in">
      <div style="min-width:0"><div class="ticker">${s.ticker}</div><div class="name">${s.company}</div>
        <div class="chips"><span class="chip">${s.industry}</span><span class="chip">${s.sector}</span></div></div>
      <div class="price-col"><div class="price">${num(s.price)} $</div>${changeText(s.changePct)}
        <button class="chip ${watch.has(s.ticker) ? 'amber' : ''}" id="star" type="button" style="border:0;margin-top:6px" aria-pressed="${watch.has(s.ticker)}">${icon.star} ${watch.has(s.ticker) ? 'Gemerkt' : 'Merken'}</button></div>
    </div>
    <div style="display:flex;gap:10px;align-items:center;margin:14px 0;flex-wrap:wrap">
      ${signalBadge(s, { marketWeak: weak, large: true })} ${dots(sg.criteria)}
    </div>
    <div class="stack">
      ${weak && sg.overall !== 'noch_nicht' ? html`<div class="banner red">${icon.warn}<div><b>Markt schwach, Pause oder kleinere Einsätze.</b> Der S&amp;P 500 liegt unter seinem SMA 200.</div></div>` : ''}
      ${chase ? html`<div class="banner red">${icon.warn}<div><b>Nicht hinterherlaufen.</b> Die Aktie ist über den Einstiegsbereich hinausgelaufen. Besser auf einen neuen Rücksetzer warten. ${infoBtn('luecke')}</div></div>` : ''}
      ${s.quality.issues.length ? html`<div class="banner amber">${icon.warn}<div><b>Datenwarnung ${infoBtn('daten')}</b><br>${s.quality.issues.map((i) => html`${i.text}<br>`)}Prüfe den Chart, bevor du dich auf die Zahlen verlässt.</div></div>` : ''}

      <section class="card chart-card fade-in">
        <div class="chart-tools">
          <div class="seg" role="group" aria-label="Zeitraum">
            <button data-range="63" aria-pressed="false">3 Mon.</button><button data-range="126" aria-pressed="true">6 Mon.</button><button data-range="252" aria-pressed="false">1 Jahr</button>
          </div>
          <span class="muted" style="font-size:12px">Tageskerzen</span>
        </div>
        ${barsError ? emptyState({ title: 'Chart nicht verfügbar', text: 'Die Kursdaten konnten nicht geladen werden.', art: icon.warn }) : html`<div id="chart" role="img" aria-label="Kerzenchart von ${s.ticker}"></div>`}
        <div class="legend"><span><i style="background:var(--accent)"></i>SMA 50 ${infoBtn('sma')}</span><span><i style="background:var(--amber)"></i>SMA 200</span><span><i style="background:var(--muted)"></i>Ausbruchslevel ${infoBtn('ausbruch')}</span>${sg.overall !== 'noch_nicht' ? html`<span><i style="background:var(--red)"></i>Stop</span>` : ''}</div>
      </section>

      <section class="card fade-in">
        <h3>Kriterien: ${sg.greens} von ${sg.total} erfüllt</h3>
        ${sg.criteria.map((c) => html`<div class="crit"><i class="dot ${c.status}" title="${c.status === 'green' ? 'erfüllt' : c.status === 'red' ? 'nicht erfüllt' : 'keine Daten'}"></i>
          <h4><span style="color:var(--text);font-weight:650;font-size:15px">${c.title} ${infoBtn(TERMS[c.key])}</span><span>${c.value}</span></h4><p>${c.explain}</p></div>`)}
      </section>

      <section class="card fade-in">
        <h3>Relative Stärke ${infoBtn('rs')}</h3>
        ${rsRow('3 Monate', s.rs.m3)}${rsRow('6 Monate', s.rs.m6)}
        <div class="note">${s.rs.strong ? 'Besser als der S&P 500 in beiden Zeiträumen: steht im Ranking weiter oben.' : 'Nicht in beiden Zeiträumen besser als der S&P 500.'}</div>
      </section>

      <section class="card fade-in">
        <h3>Nächster Quartalsbericht ${infoBtn('bericht')}</h3>
        ${s.earnings ? html`<dl class="kv"><dt>Termin</dt><dd>${dateDe(s.earnings.date)}${s.earnings.time ? html` <small>${s.earnings.time === 'AMC' ? 'nach Börsenschluss' : 'vor Börsenöffnung'}</small>` : ''}</dd>
          <dt>In</dt><dd class="${sg.daysToEarnings >= 0 && sg.daysToEarnings <= d.settings.signal.earningsBlockDays ? 'down' : ''}">${sg.daysToEarnings >= 0 ? `${sg.daysToEarnings} Tagen` : 'bereits veröffentlicht'}</dd></dl>`
          : html`<p class="muted" style="margin:0">Termin unbekannt. Prüfe ihn selbst, bevor du kaufst.</p>`}
      </section>

      <section class="card fade-in" id="plan">
        <h3>Kaufvorschlag ${sg.overall !== 'kaufsignal' ? html`<span class="chip">nur Orientierung, noch kein Signal</span>` : ''}</h3>
        ${hasLevel ? html`
        <dl class="kv">
          <dt>Ausbruchslevel ${infoBtn('ausbruch')}</dt><dd>${usd(sg.level)}</dd>
          <dt>Einstiegsbereich ${infoBtn('einstieg')}</dt><dd>${num(sg.entryMin)} – ${usd(sg.entryMax)}</dd>
          <dt>Stop-Loss-Vorschlag ${infoBtn('stop')}</dt><dd class="down">${usd(sg.stop)}<small>${percent(sg.stopPct, 1)} unter Einstieg ${sg.stopPct > d.settings.signal.maxStopPct ? '· zu weit' : ''}</small></dd>
        </dl>
        <div class="input-row" style="margin-top:16px">
          <div><label for="cap">Kapital ($)</label><input id="cap" type="number" inputmode="decimal" min="0" value="${risk.capital}"></div>
          <div><label for="rk">Risiko pro Trade (%)</label><input id="rk" type="number" inputmode="decimal" step="0.1" min="0.1" value="${risk.riskPerTradePct}"></div>
        </div>
        <dl class="kv" id="sizing"></dl>
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><a class="chip green" href="#/kauf/${s.ticker}" style="padding:10px 16px;font-size:14px;font-weight:700">Kauf eintragen</a><a class="chip" href="#/rechner/${s.ticker}" style="padding:10px 16px;font-size:14px">Im Rechner öffnen</a></div>` : html`<p class="muted" style="margin:0">Ohne Ausbruchslevel kein Vorschlag.</p>`}
      </section>
    </div>
    <div class="source">Kennzahlen: ${d.meta.sources.screener} · Kurse: ${d.meta.sources.prices} · Handelstag ${dateDe(s.priceDate)}<br>Berechnet ${dateTimeDe(d.meta.generatedAt)}</div>`;

  const after = (root) => {
    let handle = null;
    if (!barsError) {
      handle = drawChart(root.querySelector('#chart'), bars, sg);
      root.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
        root.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        handle.setRange(Number(b.dataset.range));
      }));
    }
    root.querySelector('#star')?.addEventListener('click', () => { watch.has(s.ticker) ? watch.remove(s.ticker) : watch.add(s.ticker, s); refresh(); });
    const sizing = root.querySelector('#sizing');
    if (sizing) {
      const calc = () => {
        const capital = parseFloat(root.querySelector('#cap').value);
        const riskPct = parseFloat(root.querySelector('#rk').value);
        setRisk({ capital, riskPerTradePct: riskPct });
        const p = positionSize({ capital, riskPct, entry: sg.entry, stop: sg.stop, maxStopPct: d.settings.signal.maxStopPct });
        sizing.innerHTML = (p.valid ? html`
          <dt>Stückzahl ${infoBtn('stueck')}</dt><dd>${num(p.shares, 0)}<small>zum Einstieg ${usd(sg.entry)}</small></dd>
          <dt>Positionsgröße</dt><dd>${usd(p.positionValue, 0)}<small>${percent(p.positionPct, 0)} vom Kapital${p.cappedByCapital ? ' · durch Kapital begrenzt' : ''}</small></dd>
          <dt>Maximaler Verlust</dt><dd class="down">${usd(p.maxLoss, 0)}<small>${percent(p.maxLossPct, 2)} vom Kapital</small></dd>` : html`<dt>Stückzahl</dt><dd>–<small>${p.reason}</small></dd>`).s;
      };
      root.querySelectorAll('#cap,#rk').forEach((i) => i.addEventListener('input', calc));
      calc();
    }
    return () => handle?.remove();
  };
  return { view, after };
}

/* ---------- Platzhalter für spätere Stufen ---------- */
const SOON = {
  branchen: ['Branchen', 3, icon.grid, 'Farbkacheln: welche Branchen gerade die meisten Treffer und die beste Performance haben.'],
  auswertung: ['Auswertung', 3, icon.chart, 'Trefferquote, Gewinn und Verlust, Chance-Risiko-Verhältnis und Verlaufskurve deiner Trades.'],
  kalender: ['Kalender', 3, icon.calendar, 'Quartalsberichte deiner Positionen und Watchlist, mit Warnung 2 Wochen vorher.'],
  einstellungen: ['Einstellungen', 3, icon.gear, 'Filterwerte, Kapital, Risiko, Limits, Benachrichtigungen, Gebühren und Euro-Anzeige. Bis dahin: Datei config/settings.json.']
};
export function soon(key) {
  const [title, stage, art, text] = SOON[key];
  return html`<h1 class="page-title">${title}</h1>${emptyState({ title: `Kommt in Stufe ${stage}`, text, art })}`;
}
export const SOON_KEYS = Object.keys(SOON);
