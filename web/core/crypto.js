// Verschlüsselung der veröffentlichten Daten: AES-256-GCM, Schlüssel per PBKDF2 aus deinem Passwort.
// Läuft identisch im Nacht-Skript (Node) und im Browser (WebCrypto, braucht https oder localhost).
const enc = new TextEncoder();
const dec = new TextDecoder();

export const ITERATIONS = 600_000;
export const BAD_PASSWORD = 'BAD_PASSWORD';

export function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randomSalt = () => toB64(crypto.getRandomValues(new Uint8Array(16)));

const keys = new Map(); // PBKDF2 ist absichtlich langsam: je Passwort+Salz nur einmal rechnen
async function keyFor(password, saltB64, iterations) {
  const id = `${iterations}|${saltB64}|${password}`;
  if (!keys.has(id)) {
    keys.set(id, (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(saltB64), iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    })());
  }
  return keys.get(id);
}

export async function encryptText(text, password, { salt = randomSalt(), iterations = ITERATIONS } = {}) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  return JSON.stringify({ v: 1, it: iterations, salt, iv: toB64(iv), ct: toB64(ct) });
}

export async function decryptText(envelopeText, password) {
  let env;
  try { env = JSON.parse(envelopeText); } catch { throw new Error('Verschlüsselte Datei ist beschädigt.'); }
  if (env?.v !== 1) throw new Error('Unbekanntes Format der verschlüsselten Datei.');
  try {
    const key = await keyFor(password, env.salt, env.it);
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.ct)));
  } catch {
    const e = new Error('Falsches Passwort oder beschädigte Daten.');
    e.code = BAD_PASSWORD;
    throw e;
  }
}
