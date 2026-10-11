import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNotifications, sendNotifications } from '../src/pipeline/notify.js';
import { fetchUsdEur } from '../src/pipeline/fx.js';

const stock = (ticker, overall, extra = {}) => ({ ticker, company: ticker + ' Inc', price: 100, signal: { overall, entryMin: 100, entryMax: 105, stop: 94, sma50: 90, ...extra } });
const snap = (stocks, extra = {}) => ({ meta: { status: 'ok', messages: [] }, market: { status: 'green' }, stocks, tracked: [], ...extra });

test('Benachrichtigung: nur NEUE Kaufsignale, ein Hinweis', () => {
  const previous = snap([stock('A', 'kaufsignal'), stock('B', 'fast')]);
  const now = snap([stock('A', 'kaufsignal'), stock('B', 'kaufsignal'), stock('C', 'kaufsignal'), stock('D', 'fast')]);
  const n = buildNotifications({ snapshot: now, previous });
  assert.equal(n.length, 1);
  assert.equal(n[0].title, '2 neue Kaufsignale');
  assert.match(n[0].message, /B \(B Inc\).*Stop 94,00 \$/);
  assert.doesNotMatch(n[0].message, /A \(/);
  assert.equal(buildNotifications({ snapshot: previous, previous }).length, 0); // nichts Neues -> still
  assert.equal(buildNotifications({ snapshot: now, previous: null })[0].title, '3 neue Kaufsignale'); // erster Lauf
});

test('Benachrichtigung: Markt schwach wird erwähnt', () => {
  const n = buildNotifications({ snapshot: snap([stock('A', 'kaufsignal')], { market: { status: 'red' } }), previous: snap([]) });
  assert.match(n[0].message, /^Markt schwach/);
});

test('Benachrichtigung: Verkaufen prüfen sofort und mit höchster Priorität', () => {
  const positions = [
    { status: 'open', ticker: 'A', entry: 100, stop: 101, shares: 1 },          // Kurs 100 < Stop 101
    { status: 'open', ticker: 'B', entry: 80, stop: 70, shares: 1 },             // Kurs 100, SMA50 90 -> ok
    { status: 'open', ticker: 'C', entry: 80, stop: 70, shares: 1 },             // SMA50 110 -> unter SMA 50
    { status: 'closed', ticker: 'D', entry: 80, stop: 99, shares: 1, exit: 90 },
    { status: 'open', ticker: 'X', entry: 80, stop: 99, shares: 1 }               // keine Daten -> übersprungen
  ];
  const now = snap([stock('A', 'fast'), stock('B', 'fast')], { tracked: [stock('C', 'noch_nicht', { sma50: 110 }), stock('D', 'fast')] });
  const n = buildNotifications({ snapshot: now, previous: now, positions });
  assert.equal(n.length, 1);
  assert.equal(n[0].kind, 'verkaufen'); assert.equal(n[0].priority, 5);
  assert.equal(n[0].title, 'Verkaufen prüfen: A, C');
  assert.match(n[0].message, /A: .*unter deinem Stop/); assert.match(n[0].message, /C: .*unter dem SMA 50/);
});

test('Benachrichtigung: Fehler und abschaltbare Meldungen', () => {
  const err = { meta: { status: 'fehler', messages: [{ text: 'Token ungültig' }] }, stocks: [] };
  assert.equal(buildNotifications({ snapshot: err })[0].kind, 'fehler');
  assert.equal(buildNotifications({ snapshot: err, settings: { notifications: { errors: false } } }).length, 0);
  const now = snap([stock('A', 'kaufsignal')]);
  assert.equal(buildNotifications({ snapshot: now, previous: snap([]), settings: { notifications: { newSignals: false } } }).length, 0);
});

test('Versand: JSON an ntfy, ohne Topic wird nichts gesendet', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  const list = [{ title: 'Größe äöü', message: 'x', priority: 5, tags: ['a'], click: 'https://s/' }];
  assert.equal(await sendNotifications(list, { topic: '', fetchImpl }), 0);
  assert.equal(calls.length, 0);
  assert.equal(await sendNotifications(list, { topic: 'geheim-123', email: 'a@b.de', fetchImpl }), 1);
  assert.equal(calls[0].url, 'https://ntfy.sh');
  assert.equal(calls[0].body.topic, 'geheim-123'); assert.equal(calls[0].body.email, 'a@b.de'); assert.equal(calls[0].body.title, 'Größe äöü');
  assert.equal(await sendNotifications(list, { topic: 't', fetchImpl: async () => ({ ok: false, status: 500 }) }), 0);
});

test('Wechselkurs: Antwort lesen, Fehler melden', async () => {
  const ok = await fetchUsdEur({ fetchImpl: async () => ({ ok: true, json: async () => ({ date: '2026-10-09', rates: { EUR: 0.9213 } }) }) });
  assert.equal(ok.usdEur, 0.9213); assert.equal(ok.date, '2026-10-09');
  await assert.rejects(fetchUsdEur({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
  await assert.rejects(fetchUsdEur({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /unbrauchbar/);
});

import { encryptText, decryptText, BAD_PASSWORD } from '../web/core/crypto.js';
import { encryptDir } from '../src/pipeline/encrypt.js';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Verschlüsselung: Rundlauf, falsches Passwort, Manipulation', async () => {
  const text = JSON.stringify({ stocks: [{ ticker: 'LUMR', price: 139.01 }], umlaut: 'äöü€' });
  const env = await encryptText(text, 'ein-langes-passwort', { iterations: 1000 });
  assert.doesNotMatch(env, /LUMR/);                       // im Klartext nicht lesbar
  assert.equal(await decryptText(env, 'ein-langes-passwort'), text);
  await assert.rejects(decryptText(env, 'falsch'), (e) => e.code === BAD_PASSWORD);
  const o = JSON.parse(env); o.ct = o.ct.slice(0, -4) + 'AAAA';
  await assert.rejects(decryptText(JSON.stringify(o), 'ein-langes-passwort'), (e) => e.code === BAD_PASSWORD);
  assert.notEqual(env, await encryptText(text, 'ein-langes-passwort', { iterations: 1000 })); // zufälliger IV
  await assert.rejects(decryptText('kein json', 'x'), /beschädigt/);
});

test('Ordner verschlüsseln: Klartext verschwindet, Inhalt bleibt entschlüsselbar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'akt-'));
  mkdirSync(join(dir, 'bars'));
  writeFileSync(join(dir, 'latest.json'), '{"stocks":[{"ticker":"A"}]}');
  writeFileSync(join(dir, 'bars', 'A.json'), '[["2026-01-02",1,2,0.5,1.5,100]]');
  assert.equal(await encryptDir(dir, 'pw', 1000), 2);
  assert.equal(existsSync(join(dir, 'latest.json')), false);
  assert.deepEqual(readdirSync(join(dir, 'bars')), ['A.enc']);
  assert.equal(await decryptText(readFileSync(join(dir, 'latest.enc'), 'utf8'), 'pw'), '{"stocks":[{"ticker":"A"}]}');
  assert.equal(await decryptText(readFileSync(join(dir, 'bars', 'A.enc'), 'utf8'), 'pw'), '[["2026-01-02",1,2,0.5,1.5,100]]');
  await assert.rejects(encryptDir(dir, ''), /Kein Passwort/);
});

import { missingConfig, configError } from '../src/pipeline/config-check.js';
test('Konfiguration: fehlende Secrets werden vollständig genannt', () => {
  assert.deepEqual(missingConfig({}, { ci: true }), ['TWELVEDATA_API_KEY', 'DATA_PASSPHRASE']);
  assert.deepEqual(missingConfig({ TWELVEDATA_API_KEY: 'x' }, { ci: true }), ['DATA_PASSPHRASE']);
  assert.deepEqual(missingConfig({ TWELVEDATA_API_KEY: 'x' }, { ci: false }), []);   // lokal ist das Daten-Passwort optional
  assert.deepEqual(missingConfig({ TWELVEDATA_API_KEY: '', DATA_PASSPHRASE: 'p' }, { ci: true }), ['TWELVEDATA_API_KEY']);
  assert.match(configError(['A', 'B'], true), /A, B.*Secrets and variables/);
  assert.match(configError(['A'], false), /\.env/);
});
