# Aktien-Screener

Abend-Screener für US-Einzelaktien (nur Long). Deutsch, Handy zuerst. Keine Anlageberatung.

## Starten
    npm install
    npm run demo     # erfundene Demo-Daten, kein Konto nötig
    npm start        # zeigt die Adresse für Computer UND Handy (gleiches WLAN)
    npm test         # Rechentests

## Online + täglich automatisch
Siehe **docs/EINRICHTUNG.md** (Schlüssel, GitHub Pages, Push aufs Handy).

## Echte Daten
`.env.example` nach `.env` kopieren und eintragen: `FINVIZ_TOKEN` (Finviz Elite) und `TWELVEDATA_API_KEY` (kostenlos).
Dann `npm run update`, danach `npm start`.

## Einstellungen
- Screener-/Signalwerte: `web/core/defaults.js` (eigene Werte in `config/settings.json`, nur ändern, was du willst)
- Aktien, die immer mitgeladen werden (Positionen, Watchlist): `"trackTickers": ["ABCD"]` in `config/settings.json`
- Kapital, Risiko, Limits: in der App unter Einstellungen
- Kriterien-Logik: `web/core/signal.js`, Portfolio-Regeln: `web/core/portfolio.js`

## Datenschutz
Positionen, Journal, Watchlist und Einstellungen liegen nur im Browser des jeweiligen Geräts (localStorage) und werden nirgendwohin gesendet.
Das heißt auch: Handy und Computer haben getrennte Daten, bis in Stufe 3 Export/Import kommt.
