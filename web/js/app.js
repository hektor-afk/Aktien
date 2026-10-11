import { html, raw, icon, openSheet, refresh } from './ui.js';
import { GLOSSARY } from './glossary.js';
import { skeleton } from './components.js';
import { heute, treffer, bindTreffer, detail } from './pages.js';
import { initLock } from './lock.js';
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
  $('#updated').innerHTML = m.generatedAt ? html`Zuletzt aktualisiert:<br><b>${dateTimeDe(m.generatedAt)}</b>`.s : '';
}

const currentKey = () => (location.hash.replace(/^#\//, '').split('/')[0] || 'heute');

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

async function init() {
  drawNav(currentKey());
  view.innerHTML = skeleton().s;
  try {
    const r = await fetch('data/latest.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data = await r.json();
  } catch (e) {
    data = { meta: { status: 'fehler', generatedAt: null, messages: [{ level: 'error', text: `Die Datei data/latest.json konnte nicht geladen werden (${e.message}). Wurde das Update-Skript schon einmal ausgeführt?` }], sources: {} }, market: null, stocks: [], settings: null };
  }
  banners();
  await route();
}
addEventListener('hashchange', route);
document.addEventListener('refresh', () => route());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => data && route());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
initLock();
init();
