import { html, raw, icon, openSheet, refresh } from './ui.js';
import { GLOSSARY } from './glossary.js';
import { skeleton } from './components.js';
import { heute, treffer, bindTreffer, detail } from './pages.js';
import { initLock } from './lock.js';
import { refresh as liveRefresh, getKey, liveMeta } from './live.js';
import { trackedItems } from './db.js';
import { prefs } from './fx.js';
import { loadData, setPassword, NEED_PASSWORD } from './data.js';
import { BAD_PASSWORD } from '../core/crypto.js';
import { branchen, auswertung, kalender, einstellungen } from './pages-more.js';
import { rechner, watchlist, portfolio, kauf, computeAlerts } from './pages-trade.js';
import { dateTimeDe } from '../core/format.js';
import { expectedTradingDate, weekdaysBetween } from '../core/dates.js';

const $ = (s) => document.querySelector(s);
const view = $('#view');
let data = null;
let cleanup = null;
let renderToken = 0;

const NAV = [['heute', 'Heute', icon.home], ['treffer', 'Treffer', icon.list], ['watchlist', 'Watchlist', icon.star], ['portfolio', 'Portfolio', icon.briefcase], ['rechner', 'Rechner', icon.calc]];
const MORE = [['branchen', 'Branchen', icon.grid], ['auswertung', 'Auswertung', icon.chart], ['kalender', 'Kalender', icon.calendar], ['einstellungen', 'Einstellungen', icon.gear]];

function drawNav(active) {
  const al = data ? computeAlerts(data) : { sell: [], changed: [] };
  const badge = { portfolio: al.sell.length, watchlist: al.changed.length };
  const link = ([k, t, i]) => html`<a href="#/${k}" ${active === k ? raw('aria-current="page"') : ''}>${i}<span>${t}</span>${badge[k] ? html`<i class="navdot ${k === 'portfolio' ? 'red' : ''}" aria-label="${badge[k]} Hinweis(e)"></i>` : ''}</a>`;
  $('#nav').innerHTML = html`${NAV.map(link)}<div class="more">Mehr</div>${MORE.map((m) => html`<a class="more-link" href="#/${m[0]}" ${active === m[0] ? raw('aria-current="page"') : ''}>${m[2]}<span>${m[1]}</span></a>`)}`.s;
  // Am Handy erscheinen die "mehr"-Links nicht in der Leiste, sondern im Menü
  document.querySelectorAll('.more-link').forEach((a) => { a.style.display = matchMedia('(min-width:900px)').matches ? '' : 'none'; });
}
matchMedia('(min-width:900px)').addEventListener('change', () => drawNav(currentKey()));

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-info]');
  if (t) {
    e.preventDefault(); e.stopPropagation();
    const g = GLOSSARY[t.dataset.info];
    if (g) openSheet(html`<h3>${g[0]}</h3><p>${g[1]}</p>`);
  }
}, true);

$('#menuBtn').innerHTML = icon.menu.s;
$('#menuBtn').addEventListener('click', () => {
  openSheet(html`<h3>Menü</h3><div class="menu-list">${MORE.map(([k, t]) => html`<a href="#/${k}" data-close>${t}<small></small></a>`)}
    <a href="#/hinweise" data-close>Hinweise &amp; Risiko<small></small></a></div>`);
  $('#sheet').querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => $('#sheet').close()));
});

function banners() {
  const out = [];
  const m = data.meta;
  if (m.status === 'fehler') out.push(['red', 'Datenabruf fehlgeschlagen', m.messages.map((x) => x.text).join(' ')]);
  else {
    if (m.demo) out.push(['', 'Demo-Daten', 'Alle Aktien und Kurse sind erfunden – nur zum Ausprobieren der App.']);
    else if (m.asOf) {
      const behind = weekdaysBetween(m.asOf, expectedTradingDate());
      if (behind >= 2) out.push(['red', 'Daten veraltet', `Die neuesten Kurse sind vom ${m.asOf.split('-').reverse().join('.')}. Der nächtliche Abruf scheint nicht gelaufen zu sein – nicht auf diese Zahlen verlassen.`]);
      else if (behind === 1) out.push(['amber', 'Daten noch nicht von heute', `Letzter Handelstag in den Daten: ${m.asOf.split('-').reverse().join('.')}. Das Update läuft jeden Abend nach 22:00 Uhr.`]);
    }
    for (const x of m.messages) if (x.level !== 'info' || !m.demo) out.push([x.level === 'warn' ? 'amber' : '', x.level === 'warn' ? 'Hinweis' : 'Info', x.text]);
  }
  $('#banners').innerHTML = out.map(([c, t, x]) => html`<div class="banner ${c}" role="${c === 'red' ? 'alert' : 'status'}">${c ? icon.warn : icon.info}<div><b>${t}</b> ${x}</div></div>`.s).join('');
  $('#updated').innerHTML = m.generatedAt ? html`Zuletzt aktualisiert:<br><b>${dateTimeDe(m.generatedAt)}</b><br><span id="liveStatus"></span>`.s : '';
  updateLiveStatus();
}

const currentKey = () => (location.hash.replace(/^#\//, '').split('/')[0] || 'heute');

/* ---------- Live-Kurse: automatisch aktuell halten ---------- */
const clockDe = (iso) => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(iso));
let liveProgress = null;

function updateLiveStatus() {
  const el = document.getElementById('liveStatus');
  const btn = $('#refreshBtn');
  btn?.classList.toggle('spin', Boolean(liveProgress?.running));
  if (!el) return;
  const m = liveMeta();
  if (liveProgress?.running) el.textContent = `Live-Update ${liveProgress.done}/${liveProgress.total} …`;
  else if (!m.hasKey) el.textContent = '';
  else if (m.lastError) { el.innerHTML = html`<span class="down" title="${m.lastError}">Live-Update fehlgeschlagen</span>`.s; }
  else if (m.lastRun) el.textContent = `Live: ${clockDe(m.lastRun)} Uhr`;
}

function safeToRerender() {
  const a = document.activeElement;
  const typing = a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
  return !typing && !$('#sheet').open && !['kauf', 'rechner', 'einstellungen'].includes(currentKey());
}

async function runLive(force = false) {
  if (!data || !getKey()) return;
  const items = trackedItems(data);
  if (!items.length) return;
  await liveRefresh(data, items, { force });
}

document.addEventListener('live-progress', (e) => {
  liveProgress = e.detail;
  updateLiveStatus();
  if (!e.detail.running) { drawNav(currentKey()); if (e.detail.updated && safeToRerender()) route(); }
});
document.addEventListener('live-request', (e) => runLive(e.detail?.force));
$('#refreshBtn').innerHTML = icon.refresh.s;
$('#refreshBtn').addEventListener('click', () => { if (getKey()) runLive(true); else location.hash = '#/einstellungen'; });
document.addEventListener('visibilitychange', () => { if (!document.hidden && prefs().autoLive !== false) runLive(false); });
setInterval(() => { if (!document.hidden && prefs().autoLive !== false) runLive(false); }, 5 * 60_000);

async function route() {
  const token = ++renderToken;
  cleanup?.(); cleanup = null;
  const [key, arg] = location.hash.replace(/^#\//, '').split('/');
  const page = key || 'heute';
  drawNav(page === 'aktie' ? 'treffer' : page);
  window.scrollTo(0, 0);

  if (!data) { view.innerHTML = skeleton().s; return; }
  view.innerHTML = '';
  let out;
  if (page === 'heute') out = { view: heute(data) };
  else if (page === 'treffer') out = { view: treffer(data), after: (r) => bindTreffer(r, data) };
  else if (page === 'aktie') { view.innerHTML = skeleton().s; out = await detail(data, decodeURIComponent(arg || '')); }
  else if (page === 'hinweise') out = { view: html`<h1 class="page-title">Hinweise &amp; Risiko</h1><div class="card stack"><p style="margin:0"><b>Keine Anlageberatung.</b> Diese App rechnet Regeln durch und ersetzt keine eigene Entscheidung.</p><p style="margin:0">Vergangene Ergebnisse garantieren nichts. Aktien können Verluste bringen, auch mit Stop-Loss (z. B. bei Kurslücken über Nacht).</p><p style="margin:0">Daten stammen von Drittanbietern und können Fehler enthalten. Prüfe wichtige Zahlen vor dem Kauf bei deinem Broker.</p></div>` };
  else if (page === 'rechner') out = rechner(data, arg);
  else if (page === 'watchlist') out = watchlist(data);
  else if (page === 'portfolio') out = portfolio(data);
  else if (page === 'kauf') out = kauf(data, arg);
  else if (page === 'einstellungen') out = einstellungen(data);
  else if (page === 'branchen') out = branchen(data);
  else if (page === 'auswertung') out = auswertung(data);
  else if (page === 'kalender') out = kalender(data);
  else out = { view: heute(data) };
  if (token !== renderToken) return;
  view.innerHTML = out.view.s;
  cleanup = out.after?.(view) ?? null;
  view.focus({ preventScroll: true });
}

/** Passwortfeld für die verschlüsselten Daten. Wartet, bis ein Passwort eingegeben wurde. */
function askPassword(wrong) {
  return new Promise((resolve) => {
    let el = document.getElementById('gate');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gate'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      el.innerHTML = html`<form class="lock-box" autocomplete="off">
        <div class="brand-mark" style="width:44px;height:44px;border-radius:14px;margin:0 auto 16px"></div>
        <h2>Daten entsperren</h2>
        <p class="muted" id="gateMsg">Die Daten sind verschlüsselt. Gib dein Daten-Passwort ein.</p>
        <input id="gatePw" type="password" autocomplete="current-password" placeholder="Daten-Passwort" aria-label="Daten-Passwort" style="text-align:center;margin-bottom:12px">
        <label class="toggle" style="justify-content:center;font-size:14px;margin-bottom:14px"><input type="checkbox" id="gateRemember" checked style="width:20px;height:20px"> Auf diesem Gerät merken</label>
        <button class="btn primary" type="submit" style="width:100%">Entsperren</button></form>`.s;
      document.body.append(el);
    }
    const msg = el.querySelector('#gateMsg');
    if (wrong) { msg.textContent = 'Falsches Passwort. Bitte erneut versuchen.'; msg.classList.add('bad'); el.querySelector('#gatePw').value = ''; }
    el.querySelector('#gatePw').focus();
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const pw = el.querySelector('#gatePw').value;
      if (!pw) return;
      setPassword(pw, el.querySelector('#gateRemember').checked);
      resolve();
    };
  });
}

async function loadLatest() {
  let wrong = false;
  for (;;) {
    try { const d = await loadData('latest'); document.getElementById('gate')?.remove(); return d; }
    catch (e) {
      if (e.code === NEED_PASSWORD || e.code === BAD_PASSWORD) { await askPassword(e.code === BAD_PASSWORD || wrong); wrong = true; continue; }
      throw e;
    }
  }
}

async function init() {
  drawNav(currentKey());
  view.innerHTML = skeleton().s;
  try {
    data = await loadLatest();
  } catch (e) {
    data = { meta: { status: 'fehler', generatedAt: null, messages: [{ level: 'error', text: `Die Daten konnten nicht geladen werden (${e.message}). Wurde das Update schon einmal ausgeführt?` }], sources: {} }, market: null, stocks: [], tracked: [], settings: null };
  }
  banners();
  await route();
  if (prefs().autoLive !== false) runLive(false);
}
addEventListener('hashchange', route);
document.addEventListener('refresh', () => route());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => data && route());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
initLock();
init();
