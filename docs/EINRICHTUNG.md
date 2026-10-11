# Einrichtung: App online, täglich automatisch aktualisiert

Dauer: ca. 20 Minuten, einmalig. Danach läuft alles von selbst.

## 1. Konten und Schlüssel
| Was | Kosten | Wofür |
|---|---|---|
| **Finviz Elite** (finviz.com) | ca. 25–40 $/Monat, Preis auf finviz.com prüfen | Screener-Export. Den API-Token findest du im Finviz-Konto (Export-Link enthält `auth=...`). |
| **Twelve Data** (twelvedata.com) | kostenlos (Basic) | Kursdaten für Charts und Berechnung. API-Key im Dashboard. |
| **ntfy** (App im App Store / Play Store) | kostenlos | Push-Nachrichten aufs Handy. |
| **GitHub** | kostenlos | Hosting + nächtliche Automatik (hast du schon). |

## 2. Schlüssel im Repository hinterlegen
GitHub → Repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Wert |
|---|---|
| `FINVIZ_TOKEN` | dein Finviz-Token |
| `TWELVEDATA_API_KEY` | dein Twelve-Data-Key |
| `NTFY_TOPIC` | ein langer, geheimer Name, z. B. `aktien-k7x29qpf84m` (in der ntfy-App abonnieren) |
| `NOTIFY_EMAIL` | optional: deine E-Mail für zusätzliche Hinweise |

## 3. Auf `main` bringen und Webseite einschalten
1. Den Branch `claude/stock-screening-app-de-jbr8np` per Pull Request nach `main` übernehmen (Workflows laufen nur vom Hauptzweig).
2. **Settings → Pages → Source: GitHub Actions**.
3. **Actions → „Täglich aktualisieren und veröffentlichen“ → Run workflow** für das erste Update.
4. Nach ca. 2 Minuten ist die App unter `https://<dein-name>.github.io/<repo-name>/` erreichbar.

Ab dann: Mo–Fr um 22:00 UTC (23:00 Uhr Winter / 00:00 Uhr Sommer) automatisch. Schlägt der Abruf fehl, zeigt die App eine rote Meldung statt alter Zahlen, du bekommst eine Push-Nachricht und GitHub markiert den Lauf rot.

## 4. Aufs Handy
- **iPhone (Safari):** Adresse öffnen → Teilen → *Zum Home-Bildschirm*.
- **Android (Chrome):** Adresse öffnen → Menü → *App installieren*.

## 5. Positionen für Verkaufs-Benachrichtigungen
Der Server kennt deine Käufe nicht (sie liegen nur im Browser). Für „Verkaufen prüfen“ per Push:
App → Einstellungen → *Sicherung herunterladen* → Datei als `config/portfolio.json` ins Repository hochladen (Add file → Upload files). Diese Aktien werden dann auch automatisch mitgeladen. Nach neuen Käufen die Datei erneuern.

## 6. Filterwerte ändern
App → Einstellungen → *Screener- und Signalwerte* → *settings.json erzeugen* → als `config/settings.json` ins Repository legen.

## Wichtig
- Die veröffentlichte Webseite ist für jeden mit dem Link lesbar (bei GitHub Pages auch bei privatem Repository, außer mit Enterprise-Plan). Sie enthält die Screener-Ergebnisse. Prüfe, ob die Nutzungsbedingungen von Finviz das Veröffentlichen erlauben. Wer das nicht möchte, startet die App nur lokal (`npm start`).
- **Deine Portfolio-Daten stehen nie auf der Webseite.** Sie bleiben im Browser des Geräts. Der PIN-Schutz sperrt die App am Gerät, schützt aber nicht die öffentlichen Marktdaten.
- Updates laufen einmal pro Abend. Der „Sofort“-Hinweis bei „Verkaufen prüfen“ kommt direkt nach diesem Lauf, nicht während des Börsentags.
