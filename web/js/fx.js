// Euro-Anzeige: Beträge in $ mit "≈ x €" darunter (aktueller Kurs aus den Nachtdaten).
import { html, store, save } from './ui.js';
import { usd, eur } from '../core/format.js';

export const prefs = () => ({ euro: true, ...(store('prefs', {}) || {}) });
export const setPrefs = (patch) => save('prefs', { ...prefs(), ...patch });
export const euroOn = (d) => prefs().euro && d?.fx?.usdEur > 0;

export function moneyHtml(d, x, dec = 2) {
  if (x == null) return html`–`;
  return euroOn(d) ? html`${usd(x, dec)}<small class="eur">≈ ${eur(x * d.fx.usdEur, dec)}</small>` : html`${usd(x, dec)}`;
}
