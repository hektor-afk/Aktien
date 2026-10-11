// Daten laden: verschlüsselt (.enc, braucht das Daten-Passwort) oder – lokal/Demo – als normale .json.
import { decryptText } from '../core/crypto.js';

export const NEED_PASSWORD = 'NEED_PASSWORD';
const KEY = 'dpass';
let password = null;

const read = (store) => { try { return window[store].getItem(KEY); } catch { return null; } };
export const storedPassword = () => password ?? read('localStorage') ?? read('sessionStorage');
export function setPassword(p, remember) {
  password = p;
  for (const [s, on] of [['localStorage', remember], ['sessionStorage', !remember]]) {
    try { on ? window[s].setItem(KEY, p) : window[s].removeItem(KEY); } catch { /* privater Modus */ }
  }
}
export function forgetPassword() {
  password = null;
  for (const s of ['localStorage', 'sessionStorage']) { try { window[s].removeItem(KEY); } catch { /* ignore */ } }
}

export async function loadData(name) {
  let res = null;
  try { res = await fetch(`data/${name}.enc`, { cache: 'no-cache' }); } catch { /* offline: unten erneut versuchen */ }
  if (res?.ok) {
    const pw = storedPassword();
    if (!pw) { const e = new Error('Passwort nötig'); e.code = NEED_PASSWORD; throw e; }
    return JSON.parse(await decryptText(await res.text(), pw)); // wirft BAD_PASSWORD bei falschem Passwort
  }
  const plain = await fetch(`data/${name}.json`, { cache: 'no-cache' });
  if (!plain.ok) throw new Error(`HTTP ${plain.status}`);
  return plain.json();
}
