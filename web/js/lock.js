// Zugangsschutz per PIN. Schützt vor neugierigen Blicken auf Handy/Computer – kein Server-Login:
// Die Portfolio-Daten liegen ohnehin nur lokal im Browser.
import { html, store, save } from './ui.js';
import { hashPin, newSalt } from '../core/sha256.js';

const KEY = 'pin';
const RELOCK_MS = 2 * 60 * 1000;
const sess = { get: () => { try { return sessionStorage.getItem('unlocked') === '1'; } catch { return false; } }, set: (v) => { try { v ? sessionStorage.setItem('unlocked', '1') : sessionStorage.removeItem('unlocked'); } catch { /* ignore */ } } };

export const hasPin = () => Boolean(store(KEY, null));
export function verifyPin(pin) {
  const p = store(KEY, null);
  return Boolean(p) && hashPin(pin, p.salt) === p.hash;
}
export function setPin(pin) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('Die PIN muss aus 4 bis 8 Ziffern bestehen.');
  const salt = newSalt();
  save(KEY, { salt, hash: hashPin(pin, salt), len: pin.length });
  sess.set(true);
}
export function removePin() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

let failures = 0, blockedUntil = 0;

function show() {
  let el = document.getElementById('lock');
  if (el) return;
  const len = store(KEY, null)?.len ?? 4;
  el = document.createElement('div');
  el.id = 'lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'App gesperrt');
  el.innerHTML = html`<div class="lock-box">
    <div class="brand-mark" style="width:44px;height:44px;border-radius:14px;margin:0 auto 16px"></div>
    <h2>Aktien ist gesperrt</h2><p class="muted" id="lockMsg">PIN eingeben</p>
    <div class="pin-dots" id="pinDots" aria-hidden="true">${Array.from({ length: len }, () => html`<i></i>`)}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => html`<button type="button" data-k="${n}">${n}</button>`)}<span></span><button type="button" data-k="0">0</button><button type="button" data-k="del" aria-label="Löschen">⌫</button></div>
  </div>`.s;
  document.body.append(el);
  document.body.classList.add('locked');
  let entry = '';
  const dots = () => el.querySelectorAll('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < entry.length));
  const msg = (t, bad) => { const m = el.querySelector('#lockMsg'); m.textContent = t; m.classList.toggle('bad', Boolean(bad)); };
  const press = (k) => {
    if (Date.now() < blockedUntil) { msg(`Zu viele Versuche. Warte ${Math.ceil((blockedUntil - Date.now()) / 1000)} s.`, true); return; }
    if (k === 'del') entry = entry.slice(0, -1);
    else if (entry.length < len) entry += k;
    dots();
    if (entry.length === len) {
      if (verifyPin(entry)) { failures = 0; sess.set(true); unlock(); return; }
      failures++; entry = '';
      el.querySelector('.lock-box').classList.add('shake'); setTimeout(() => el.querySelector('.lock-box')?.classList.remove('shake'), 400);
      if (failures >= 5) { blockedUntil = Date.now() + 30_000; msg('Zu viele Versuche. 30 Sekunden warten.', true); } else msg('Falsche PIN', true);
      setTimeout(dots, 150);
    }
  };
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
  el._key = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
  document.addEventListener('keydown', el._key);
}
function unlock() {
  const el = document.getElementById('lock');
  if (!el) return;
  document.removeEventListener('keydown', el._key);
  el.remove(); document.body.classList.remove('locked');
}

export function lockNow() { sess.set(false); if (hasPin()) show(); }

export function initLock() {
  if (hasPin() && !sess.get()) show();
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hasPin() && hiddenAt && Date.now() - hiddenAt > RELOCK_MS) lockNow();
  });
}
