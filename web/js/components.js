import { html, raw, icon, infoBtn } from './ui.js';
import { num, usd, percent, dateDe } from '../core/format.js';

export const tone = (overall) => (overall === 'kaufsignal' ? 'green' : overall === 'fast' ? 'amber' : '');

export function sparkline(values, up) {
  const w = 112, h = 38, pad = 3;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (w - pad * 2), h - pad - ((v - min) / span) * (h - pad * 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const color = up ? 'var(--green)' : 'var(--red)';
  return raw(`<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${line} L${w - pad} ${h} L${pad} ${h} Z" fill="${color}" opacity=".10"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`);
}

export const changeText = (c) => html`<span class="chg ${c >= 0 ? 'up' : 'down'}">${percent(c, 2, true)}</span>`;

export function signalBadge(s, { marketWeak = false, large = false } = {}) {
  const t = marketWeak && s.signal.overall === 'kaufsignal' ? '' : tone(s.signal.overall);
  return html`<span class="badge ${t} ${large ? 'lg' : ''}">${s.signal.overall === 'kaufsignal' ? icon.check : ''}${s.signal.label}</span>`;
}

export const dots = (criteria) => html`<span class="dots" role="img" aria-label="${criteria.filter((c) => c.status === 'green').length} von ${criteria.length} Kriterien erfüllt">${criteria.map((c) => html`<i class="dot ${c.status}" title="${c.title}"></i>`)}</span>`;

export function stockCard(s, i, { marketWeak }) {
  const weak = marketWeak && s.signal.overall === 'kaufsignal';
  const issues = s.quality.issues.length;
  return html`
  <a class="card stock fade-in ${weak ? 'weak-market' : ''}" style="--i:${Math.min(i, 12)}" href="#/aktie/${s.ticker}">
    <div class="stock-top">
      <div class="stock-id">
        <div class="ticker">${s.ticker}</div>
        <div class="name">${s.company}</div>
        <div class="name">${s.industry}</div>
      </div>
      <div class="price-col"><div class="price">${num(s.price)} $</div>${changeText(s.changePct)}</div>
    </div>
    <div class="stock-mid">${sparkline(s.spark, s.spark[s.spark.length - 1] >= s.spark[0])}
      <div style="text-align:right">${signalBadge(s, { marketWeak })}<div style="margin-top:8px;display:flex;justify-content:flex-end">${dots(s.signal.criteria)}</div></div>
    </div>
    <div class="chips">
      ${s.rs.strong ? html`<span class="chip green">${icon.up} stärker als S&amp;P 500</span>` : ''}
      ${s.signal.gapAboveZone ? html`<span class="chip red">Nicht hinterherlaufen</span>` : ''}
      ${s.signal.mode === 'ruecksetzer' && s.signal.overall !== 'noch_nicht' ? html`<span class="chip">Rücksetzer</span>` : ''}
      ${issues ? html`<span class="chip amber">${icon.warn} Datenwarnung</span>` : ''}
    </div>
    ${weak ? html`<div class="note red">Markt schwach, Pause oder kleinere Einsätze</div>` : ''}
  </a>`;
}

export function emptyState({ title, text, art = icon.search, action = '' }) {
  return html`<div class="card empty"><div class="art">${art}</div><h3>${title}</h3><p>${text}</p>${action}</div>`;
}

export function skeleton() {
  const bar = (h, w = '100%') => `<div class="skel" style="height:${h}px;width:${w}"></div>`;
  return raw(`<div class="stack">${bar(86)}${bar(70)}${bar(150)}${bar(150)}</div>`);
}

export { infoBtn, usd };

const clock = (iso) => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(iso));
/** Wie aktuell ist der Kurs? Live-Kurs mit Uhrzeit oder Schlusskurs mit Datum. */
export function freshness(s) {
  if (s.live) {
    return s.live.partial
      ? html`<span class="chip amber" title="Der Handelstag läuft noch. Signale beruhen auf abgeschlossenen Tagen.">Live ${clock(s.live.at)} · Tag läuft</span>`
      : html`<span class="chip green">Aktuell ${clock(s.live.at)}</span>`;
  }
  return html`<span class="chip">Schlusskurs ${dateDe(s.priceDate)}</span>`;
}
