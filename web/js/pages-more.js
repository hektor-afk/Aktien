// Stufe 3: Branchen, Auswertung, Kalender, Einstellungen (mit Datensicherung und PIN).
import { html, raw, icon, infoBtn, openSheet, closeSheet, refresh } from './ui.js';
import { emptyState } from './components.js';
import { getRisk, setRisk, trades, watch, allStocks, RISK_DEFAULTS } from './db.js';
import { moneyHtml, prefs, setPrefs, euroOn } from './fx.js';
import { hasPin, setPin, removePin, verifyPin, lockNow } from './lock.js';
import { groupIndustries, sortIndustries } from '../core/industries.js';
import { tradeStats } from '../core/stats.js';
import { earningsCalendar } from '../core/calendar.js';
import { makeBackup, parseBackup } from '../core/backup.js';
import { num, percent, dateDe, dateTimeDe } from '../core/format.js';
import { isoDate } from '../core/dates.js';
import { filt } from './pages.js';

const val = (root, sel) => parseFloat(String(root.querySelector(sel)?.value ?? '').replace(',', '.'));
const sign = (x) => (x >= 0 ? 'up' : 'down');

/* ---------- BRANCHEN ---------- */
let indSort = 'count';
export function branchen(d) {
  const list = sortIndustries(groupIndustries(d.stocks), indSort);
  const perfs = list.map((g) => g.avgPerf6m).filter((x) => x != null);
  const lo = Math.min(...perfs), hi = Math.max(...perfs);
  const heat = (g) => (g.avgPerf6m == null || hi === lo ? 6 : Math.round(8 + ((g.avgPerf6m - lo) / (hi - lo)) * 30));
  return {
    view: html`<h1 class="page-title">Branchen</h1>
    <div class="seg" role="group" aria-label="Sortierung" style="margin-bottom:14px"><button data-s="count" aria-pressed="${indSort === 'count'}">Meiste Treffer</button><button data-s="perf" aria-pressed="${indSort === 'perf'}">Beste Performance</button></div>
    ${list.length ? html`<div class="tiles">${list.map((g, i) => html`<button class="tile fade-in" style="--i:${Math.min(i, 12)};--heat:${heat(g)}%" data-ind="${g.industry}" type="button">
      <div><h3>${g.industry}</h3><div class="sector">${g.sector}</div></div>
      <div class="tile-row"><div><b>${g.count}</b><span>${g.count === 1 ? 'Treffer' : 'Treffer'}</span></div>
        <div style="text-align:right"><b class="${sign(g.avgPerf6m ?? 0)}" style="font-size:17px">${percent(g.avgPerf6m, 0, true)}</b><span>Ø 6 Monate</span></div></div>
      ${g.signals || g.fast ? html`<div class="chips" style="margin:0">${g.signals ? html`<span class="chip green">${g.signals} Kaufsignal${g.signals > 1 ? 'e' : ''}</span>` : ''}${g.fast ? html`<span class="chip amber">${g.fast} Fast</span>` : ''}</div>` : ''}
    </button>`)}</div><div class="note" style="margin-top:12px">Je grüner die Kachel, desto besser die Ø-Performance der Treffer über 6 Monate. Antippen zeigt die Aktien der Branche.</div>`
    : emptyState({ title: 'Keine Treffer', text: 'Sobald der Screener Treffer findet, siehst du hier, welche Branchen führen.', art: icon.grid })}`,
    after(root) {
      root.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { indSort = b.dataset.s; refresh(); }));
      root.querySelectorAll('[data-ind]').forEach((b) => b.addEventListener('click', () => { filt.industry = b.dataset.ind; filt.signal = ''; filt.q = ''; location.hash = '#/treffer'; }));
    }
  };
}

/* ---------- AUSWERTUNG ---------- */
function curveSvg(points) {
  const W = 320, H = 150, P = 10;
  const vals = [0, ...points.map((p) => p.cum)];
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (i) => P + (i / (vals.length - 1 || 1)) * (W - 2 * P);
  const y = (v) => H - P - ((v - min) / span) * (H - 2 * P);
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const end = vals[vals.length - 1];
  const color = end >= 0 ? 'var(--green)' : 'var(--red)';
  return raw(`<svg class="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlaufskurve des Gesamtergebnisses"><line x1="${P}" x2="${W - P}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--line)" stroke-dasharray="4 4"/>
    <path d="${path} L${x(vals.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z" fill="${color}" opacity=".10"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(vals.length - 1).toFixed(1)}" cy="${y(end).toFixed(1)}" r="4" fill="${color}"/></svg>`);
}

export function auswertung(d) {
  const s = tradeStats(trades.closed());
  if (!s.n) {
    return { view: html`<h1 class="page-title">Auswertung</h1>${emptyState({ title: 'Noch keine abgeschlossenen Trades', text: 'Sobald du im Portfolio einen Verkauf einträgst, siehst du hier Trefferquote, Ø Gewinn und Verlust, Chance-Risiko-Verhältnis und deine Verlaufskurve.', art: icon.chart })}` };
  }
  const stat = (label, value, sub = '', info = '') => html`<div class="stat fade-in"><b style="font-size:24px">${value}</b><span>${label} ${info}</span>${sub ? html`<span style="display:block">${sub}</span>` : ''}</div>`;
  return {
    view: html`<h1 class="page-title">Auswertung</h1>
    <section class="card fade-in"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="margin:0">Gesamtergebnis</h3><span class="muted" style="font-size:13px">${s.n} Trades</span></div>
      <div class="price ${sign(s.total)}" style="font-size:34px;margin:6px 0 10px">${s.total >= 0 ? '+' : ''}${moneyHtml(d, s.total, 0)}</div>${curveSvg(s.curve)}</section>
    <div class="stats" style="grid-template-columns:repeat(2,1fr)">
      ${stat('Trefferquote', percent(s.winRate, 0), `${s.wins} Gewinne · ${s.losses} Verluste`)}
      ${stat('Chance-Risiko', s.payoff != null ? `${num(s.payoff, 1)} : 1` : '–', 'Ø Gewinn ÷ Ø Verlust', infoBtn('chance'))}
      ${stat('Ø Gewinn', s.avgWin != null ? moneyHtml(d, s.avgWin, 0) : '–')}
      ${stat('Ø Verlust', s.avgLoss != null ? moneyHtml(d, -s.avgLoss, 0) : '–')}
      ${stat('Ø pro Trade', moneyHtml(d, s.expectancy, 0), 'Erwartungswert')}
      ${stat('Ø R-Vielfaches', s.avgR != null ? `${num(s.avgR, 2)} R` : '–', 'Gewinn ÷ Anfangsrisiko', infoBtn('rmult'))}
    </div>
    ${s.n < 20 ? html`<div class="banner amber" style="margin-top:14px">${icon.info}<div><b>Wenig Daten.</b> Unter 20 Trades sagt die Auswertung noch wenig über deine Strategie aus.</div></div>` : ''}
    <div class="note" style="margin-top:12px">Bester Trade ${moneyHtml(d, s.best, 0)} · schlechtester Trade ${moneyHtml(d, s.worst, 0)}. Berechnet aus deinem Journal (nur auf diesem Gerät gespeichert).</div>`
  };
}

/* ---------- KALENDER ---------- */
export function kalender(d) {
  const today = isoDate(new Date());
  const items = earningsCalendar({ stocks: allStocks(d), openTrades: trades.open(), watchlist: watch.all(), today });
  const warn = items.filter((i) => i.warn);
  const warnHeld = warn.filter((i) => i.held);
  const later = items.filter((i) => !i.warn && !i.unknown);
  const unknown = items.filter((i) => i.unknown);
  const row = (i) => html`<a class="cal-row" href="#/aktie/${i.ticker}"><div style="min-width:0"><div class="ticker" style="font-size:17px">${i.ticker} ${i.held ? html`<span class="chip">Position</span>` : html`<span class="chip">Watchlist</span>`}</div><div class="name">${i.company}</div></div>
    <div class="cal-date">${i.unknown ? html`<span class="muted">unbekannt</span>` : html`${dateDe(i.date)}${i.time ? html` <small class="muted">${i.time === 'AMC' ? 'nach Börse' : 'vor Börse'}</small>` : ''}<div class="${i.warn ? 'down' : 'muted'}" style="font-size:13px;font-weight:600">${i.days <= 0 ? 'heute/gestern' : `in ${i.days} Tagen`}</div>`}</div></a>`;
  const block = (title, sub, list, cls = '') => list.length ? html`<div class="section-title"><h2>${title}</h2><span>${sub}</span></div><section class="card ${cls}">${list.map(row)}</section>` : '';
  return {
    view: html`<h1 class="page-title">Kalender</h1>
    ${warnHeld.length ? html`<div class="banner red" role="alert">${icon.warn}<div><b>Bericht in den nächsten 2 Wochen:</b> ${warnHeld.map((i) => i.ticker).join(', ')}. Der Kurs kann über Nacht stark springen, auch am Stop vorbei. ${infoBtn('bericht')}</div></div>` : ''}
    ${items.length ? html`${block('Innerhalb von 2 Wochen', 'Warnung', warn)}${block('Später', 'Quartalsberichte', later)}${block('Termin unbekannt', 'selbst prüfen', unknown)}`
      : emptyState({ title: 'Nichts zu zeigen', text: 'Hier erscheinen die Quartalsberichte deiner offenen Positionen und deiner Watchlist, mit Warnung 2 Wochen vorher.', art: icon.calendar })}`
  };
}

/* ---------- EINSTELLUNGEN ---------- */
const SCREENER_FIELDS = [
  ['minMarketCapMrd', 'Marktkapitalisierung mind. (Mrd. $)', '0.1'], ['minPrice', 'Kurs mind. ($)', '1'], ['minAvgVolume', 'Ø-Volumen mind.', '10000'],
  ['minEpsGrowthQoq', 'EPS-Wachstum Quartal mind. (%)', '1'], ['minSalesGrowthQoq', 'Umsatzwachstum Quartal mind. (%)', '1'], ['minPerf6m', 'Kursplus 6 Monate mind. (%)', '1'],
  ['maxBelow52wHighPct', 'Max. Abstand zum 52-Wochen-Hoch (%)', '1'], ['maxCandidates', 'Max. geprüfte Aktien', '5']
];
const SIGNAL_FIELDS = [
  ['volumeFactor', 'Volumen mind. (×Ø)', '0.1'], ['maxExtendedPct', 'Max. über Ausbruchslevel (%)', '0.5'], ['earningsBlockDays', 'Kein Bericht in (Tagen)', '1'],
  ['maxStopPct', 'Stop max. unter Einstieg (%)', '0.5'], ['breakoutLookback', 'Ausbruch: Hoch der letzten (Tage)', '1']
];

function filterJson(root, d) {
  const out = { screener: {}, signal: {}, notifications: {}, trackTickers: d.settings?.trackTickers || [] };
  for (const [k] of SCREENER_FIELDS) out.screener[k] = val(root, `#f_${k}`);
  out.screener.aboveSma50 = root.querySelector('#f_aboveSma50').checked;
  out.screener.aboveSma200 = root.querySelector('#f_aboveSma200').checked;
  for (const [k] of SIGNAL_FIELDS) out.signal[k] = val(root, `#g_${k}`);
  for (const k of ['newSignals', 'sellAlerts', 'errors']) out.notifications[k] = root.querySelector(`#n_${k}`).checked;
  return JSON.stringify(out, null, 2);
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function einstellungen(d) {
  const r = getRisk(d);
  const p = prefs();
  const sc = d.settings?.screener ?? {}, sg = d.settings?.signal ?? {};
  const num_ = (id, label, v, step = '1', hint = '') => html`<div><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="decimal" step="${step}" value="${v ?? ''}">${hint ? html`<div class="note" style="margin-top:4px">${hint}</div>` : ''}</div>`;
  const chk = (id, label, v) => html`<label class="toggle" for="${id}"><span>${label}</span><input id="${id}" type="checkbox" ${v ? raw('checked') : ''}></label>`;
  const m = d.meta;
  const hasTrades = trades.all().length > 0;
  const lastExport = p.lastExport ? Math.floor((Date.now() - Date.parse(p.lastExport)) / 86_400_000) : null;

  return {
    view: html`<h1 class="page-title">Einstellungen</h1>
    <div class="stack">
      <section class="card stack"><h3>Kapital und Risiko</h3>
        <div class="input-row">${num_('sCap', 'Kapital ($)', r.capital)}${num_('sRisk', 'Risiko pro Trade (%)', r.riskPerTradePct, '0.1')}</div>
        <div class="input-row">${num_('sMaxRisk', 'Gesamtrisiko-Limit (%)', r.maxOpenRiskPct, '0.5', 'Höchstens so viel % in offenen Stops')}${num_('sMaxPos', 'Max. Positionen', r.maxPositions)}</div>
        <div class="input-row">${num_('sInd', 'Max. pro Branche', r.maxPerIndustry)}${num_('sFee', 'Broker-Gebühr pro Order ($)', r.fee, '0.01')}</div>
        <div class="row-actions" style="margin:0"><button id="sReset" class="btn" type="button">Auf Standard zurücksetzen</button></div>
        <div id="saved" class="note" aria-live="polite"></div></section>

      <section class="card"><h3>Anzeige</h3>
        <label class="toggle" for="pEuro"><span>Beträge zusätzlich in Euro zeigen<br><span class="note">${d.fx ? `1 $ = ${num(d.fx.usdEur, 4)} € · ${d.fx.source} · Stand ${dateDe(d.fx.date)}` : 'Kein Wechselkurs verfügbar – beim nächsten Update erneut versucht.'}</span></span><input id="pEuro" type="checkbox" ${p.euro ? raw('checked') : ''} ${d.fx ? '' : raw('disabled')}></label></section>

      <section class="card"><h3>Zugangsschutz (PIN)</h3>
        <p class="muted" style="margin:0 0 10px;font-size:14px">Die App fragt beim Öffnen nach einer PIN und sperrt sich nach 2 Minuten im Hintergrund. Das schützt vor neugierigen Blicken am Gerät.</p>
        ${hasPin() ? html`<div class="chips" style="margin:0 0 10px"><span class="chip green">${icon.check} PIN aktiv</span></div><div class="row-actions" style="margin:0"><button id="pinLock" class="btn" type="button">Jetzt sperren</button><button id="pinChange" class="btn" type="button">PIN ändern</button><button id="pinRemove" class="btn danger" type="button">PIN entfernen</button></div>`
          : html`<button id="pinSet" class="btn primary" type="button">PIN festlegen</button>`}</section>

      <section class="card stack"><h3>Datensicherung</h3>
        <p class="muted" style="margin:0;font-size:14px">Positionen, Journal, Watchlist und Einstellungen liegen nur auf diesem Gerät. Sichere sie regelmäßig – oder übertrage sie damit aufs andere Gerät.</p>
        ${hasTrades && (lastExport == null || lastExport > 30) ? html`<div class="banner amber" style="margin:0">${icon.warn}<div>${lastExport == null ? 'Noch nie gesichert.' : `Letzte Sicherung vor ${lastExport} Tagen.`}</div></div>` : ''}
        <div class="row-actions" style="margin:0"><button id="bkExport" class="btn primary" type="button">Sicherung herunterladen</button><label class="btn" for="bkFile" style="margin:0">Sicherung einlesen</label><input id="bkFile" type="file" accept="application/json,.json" style="display:none"></div>
        <div id="bkMsg" class="note" aria-live="polite"></div></section>

      <section class="card stack"><h3>Screener- und Signalwerte</h3>
        <p class="muted" style="margin:0;font-size:14px">Diese Werte rechnet das Nacht-Skript auf dem Server. Ändere sie hier, erzeuge die Datei und lege sie als <code>config/settings.json</code> ins Repository – ab dem nächsten Update gelten sie.</p>
        <div class="input-row" style="margin:0">${SCREENER_FIELDS.map(([k, l, s]) => num_(`f_${k}`, l, sc[k], s))}</div>
        ${chk('f_aboveSma50', 'Kurs über SMA 50', sc.aboveSma50)}${chk('f_aboveSma200', 'Kurs über SMA 200', sc.aboveSma200)}
        <div class="input-row" style="margin:0">${SIGNAL_FIELDS.map(([k, l, s]) => num_(`g_${k}`, l, sg[k], s))}</div>
        <h3 style="margin-top:6px">Benachrichtigungen</h3>
        ${chk('n_newSignals', 'Neue Kaufsignale (ein Hinweis pro Abend)', true)}${chk('n_sellAlerts', 'Verkaufen prüfen (sofort)', true)}${chk('n_errors', 'Fehler beim Datenabruf', true)}
        <div class="row-actions" style="margin:0"><button id="genJson" class="btn primary" type="button">settings.json erzeugen</button><button id="notifyHelp" class="btn" type="button">Push einrichten</button></div></section>

      <section class="card"><h3>Datenstatus</h3>
        <dl class="kv"><dt>Zuletzt aktualisiert</dt><dd style="font-size:15px">${dateTimeDe(m.generatedAt)}</dd>
          <dt>Handelstag der Kurse</dt><dd style="font-size:15px">${dateDe(m.asOf)}</dd>
          <dt>Status</dt><dd style="font-size:15px" class="${m.status === 'ok' ? 'up' : 'down'}">${m.status === 'ok' ? 'in Ordnung' : m.status === 'teilweise' ? 'teilweise' : 'Fehler'}</dd>
          <dt>Screener</dt><dd style="font-size:15px">${m.sources?.screener ?? '–'}</dd><dt>Kurse</dt><dd style="font-size:15px">${m.sources?.prices ?? '–'}</dd>
          ${m.funnel ? html`<dt>Aktien</dt><dd style="font-size:15px">${m.funnel.loaded} geladen → ${m.funnel.passed} Treffer</dd>` : ''}</dl>
        <div class="note" style="margin-top:10px">Das Update läuft jeden Werktagabend automatisch. Auf Abruf: GitHub → Actions → „Täglich aktualisieren“ → Run workflow.</div></section>
    </div>`,
    after(root) {
      const savedMsg = (t) => { root.querySelector('#saved').textContent = t; };
      const saveRisk = () => {
        const patch = { capital: val(root, '#sCap'), riskPerTradePct: val(root, '#sRisk'), maxOpenRiskPct: val(root, '#sMaxRisk'), maxPositions: Math.round(val(root, '#sMaxPos')), maxPerIndustry: Math.round(val(root, '#sInd')), fee: val(root, '#sFee') || 0 };
        if (Object.values(patch).some((x) => !Number.isFinite(x) || x < 0) || patch.capital <= 0 || patch.riskPerTradePct <= 0) { savedMsg('Bitte gültige Zahlen eingeben.'); return; }
        setRisk(patch); savedMsg('Gespeichert.');
      };
      ['#sCap', '#sRisk', '#sMaxRisk', '#sMaxPos', '#sInd', '#sFee'].forEach((s) => root.querySelector(s).addEventListener('input', saveRisk));
      root.querySelector('#sReset').addEventListener('click', () => { setRisk({ ...RISK_DEFAULTS, ...(d.settings?.risk || {}) }); refresh(); });
      root.querySelector('#pEuro').addEventListener('change', (e) => setPrefs({ euro: e.target.checked }));

      // PIN
      const pinSheet = (title, fields, onOk) => openSheet(html`<h3>${title}</h3>${fields.map(([id, l]) => html`<label for="${id}" class="muted" style="font-size:12px;margin-top:8px">${l}</label><input id="${id}" type="password" inputmode="numeric" maxlength="8" autocomplete="off">`)}<div id="pinErr" class="note red" style="min-height:18px"></div><button id="pinOk" class="btn primary" type="button" style="width:100%;margin-top:8px">Speichern</button>`, (sh) => {
        sh.querySelector('#pinOk').onclick = () => { try { onOk(sh); closeSheet(); refresh(); } catch (e) { sh.querySelector('#pinErr').textContent = e.message; } };
      });
      const newPinFlow = () => pinSheet('Neue PIN (4–8 Ziffern)', [['p1', 'PIN'], ['p2', 'PIN wiederholen']], (sh) => { const a = sh.querySelector('#p1').value, b = sh.querySelector('#p2').value; if (a !== b) throw new Error('Die beiden Eingaben stimmen nicht überein.'); setPin(a); });
      root.querySelector('#pinSet')?.addEventListener('click', newPinFlow);
      root.querySelector('#pinChange')?.addEventListener('click', () => pinSheet('PIN ändern', [['p0', 'Aktuelle PIN'], ['p1', 'Neue PIN'], ['p2', 'Neue PIN wiederholen']], (sh) => {
        if (!verifyPin(sh.querySelector('#p0').value)) throw new Error('Die aktuelle PIN stimmt nicht.');
        const a = sh.querySelector('#p1').value; if (a !== sh.querySelector('#p2').value) throw new Error('Die beiden neuen Eingaben stimmen nicht überein.'); setPin(a);
      }));
      root.querySelector('#pinRemove')?.addEventListener('click', () => pinSheet('PIN entfernen', [['p0', 'Aktuelle PIN']], (sh) => { if (!verifyPin(sh.querySelector('#p0').value)) throw new Error('Die PIN stimmt nicht.'); removePin(); }));
      root.querySelector('#pinLock')?.addEventListener('click', lockNow);

      // Datensicherung
      root.querySelector('#bkExport').addEventListener('click', () => {
        const b = makeBackup({ trades: trades.all(), watchlist: watch.all(), risk: getRisk(d), prefs: prefs() });
        download(`aktien-sicherung-${isoDate(new Date())}.json`, JSON.stringify(b, null, 2));
        setPrefs({ lastExport: new Date().toISOString() });
        root.querySelector('#bkMsg').textContent = 'Heruntergeladen. Für Verkaufs-Benachrichtigungen kannst du diese Datei als config/portfolio.json ins Repository legen.';
      });
      root.querySelector('#bkFile').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const msg = root.querySelector('#bkMsg');
        try {
          const b = parseBackup(await f.text());
          if (!confirm(`Sicherung einlesen?\n\n${b.trades.length} Trades, ${b.watchlist.length} Watchlist-Einträge${b.exportedAt ? `, erstellt am ${dateDe(b.exportedAt)}` : ''}.\n\nDeine aktuellen Daten auf diesem Gerät werden ersetzt.`)) return;
          localStorage.setItem('trades', JSON.stringify(b.trades)); localStorage.setItem('watchlist', JSON.stringify(b.watchlist));
          setRisk(b.risk); setPrefs(b.prefs);
          msg.textContent = 'Sicherung eingelesen.'; refresh();
        } catch (err) { msg.textContent = `Fehler: ${err.message}`; msg.classList.add('red'); }
        e.target.value = '';
      });

      // settings.json
      root.querySelector('#genJson').addEventListener('click', () => {
        const json = filterJson(root, d);
        openSheet(html`<h3>settings.json</h3>
          <ol class="steps"><li class="step"><span>Kopiere den Text oder lade die Datei herunter.</span></li><li class="step"><span>Im GitHub-Repository den Ordner <code>config</code> öffnen → <b>Add file → Create new file</b> → Name <code>config/settings.json</code> → Text einfügen → <b>Commit</b>.</span></li><li class="step"><span>Fertig: Das nächste Update (heute Abend oder per „Run workflow“) nutzt die Werte.</span></li></ol>
          <textarea class="mono" readonly id="jsonOut" aria-label="settings.json">${json}</textarea>
          <div class="row-actions"><button id="jsonCopy" class="btn primary" type="button">Kopieren</button><button id="jsonDl" class="btn" type="button">Herunterladen</button></div>`, (sh) => {
          sh.querySelector('#jsonCopy').onclick = async () => { try { await navigator.clipboard.writeText(json); } catch { sh.querySelector('#jsonOut').select(); document.execCommand?.('copy'); } sh.querySelector('#jsonCopy').textContent = 'Kopiert ✓'; };
          sh.querySelector('#jsonDl').onclick = () => download('settings.json', json);
        });
      });
      root.querySelector('#notifyHelp').addEventListener('click', () => openSheet(html`<h3>Push aufs Handy einrichten</h3>
        <ol class="steps"><li class="step"><span>Installiere die kostenlose App <b>ntfy</b> (iPhone/Android).</span></li>
          <li class="step"><span>Denke dir einen langen, geheimen Namen aus, z. B. <code>aktien-k7x29qpf84m</code> – wer ihn kennt, kann mitlesen. In der App „Subscribe to topic“ und diesen Namen eingeben.</span></li>
          <li class="step"><span>Im GitHub-Repository: Settings → Secrets and variables → Actions → <b>New repository secret</b>: Name <code>NTFY_TOPIC</code>, Wert = dein Name. Optional für zusätzliche E-Mails: <code>NOTIFY_EMAIL</code>.</span></li>
          <li class="step"><span>Ab dem nächsten Update kommt abends ein Hinweis bei neuen Kaufsignalen und sofort „Verkaufen prüfen“ für Positionen aus <code>config/portfolio.json</code> (Sicherung hochladen).</span></li></ol>`));
    }
  };
}
