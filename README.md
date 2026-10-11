# Aktien-Screener (Stufe 1)

Abend-Screener für US-Einzelaktien (nur Long). Deutsch, Handy zuerst.

    npm install
    npm run demo     # erfundene Demo-Daten, kein Konto nötig
    npm start        # App auf http://localhost:8080
    npm test         # Rechentests

Echte Daten: `.env.example` nach `.env` kopieren, `FINVIZ_TOKEN` und `TWELVEDATA_API_KEY` eintragen, dann `npm run update`.
Werte ändern: `config/defaults.js` (eigene Werte in `config/settings.json`). Kriterien-Logik: `web/core/signal.js`.

Keine Anlageberatung. Vergangene Ergebnisse garantieren nichts.
