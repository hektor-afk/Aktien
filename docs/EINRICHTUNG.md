# Einrichtung: App online, täglich automatisch aktualisiert

Dauer: ca. 20 Minuten, einmalig. Danach läuft alles von selbst.

## 1. Konten und Schlüssel
| Was | Kosten | Wofür |
|---|---|---|
| **TradingView-Scanner** | kostenlos, kein Konto, kein Schlüssel | Screener: Aktienliste, Marktkapitalisierung, Wachstum, Quartalstermine, Branchen. Inoffizielle Schnittstelle, kann sich ändern. |
| **Twelve Data** (twelvedata.com) | kostenlos (Basic) | Kursdaten für Charts und Berechnung. API-Key im Dashboard. |
| **ntfy** (App im App Store / Play Store) | kostenlos | Push-Nachrichten aufs Handy. |
| **GitHub** | kostenlos | Hosting + nächtliche Automatik (hast du schon). |

## 2. Schlüssel im Repository hinterlegen
GitHub → Repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Wert |
|---|---|
| `TWELVEDATA_API_KEY` | dein Twelve-Data-Key |
| `DATA_PASSPHRASE` | **Pflicht.** Dein Daten-Passwort, nur du kennst es. Mindestens 16 Zeichen, am besten vier zufällige Wörter, z. B. `kiste-wolke-fahrrad-tinte`. Ohne dieses Secret wird nichts veröffentlicht. |
| `NTFY_TOPIC` | ein langer, geheimer Name, z. B. `aktien-k7x29qpf84m` (in der ntfy-App abonnieren) |
| `NOTIFY_EMAIL` | optional: deine E-Mail für zusätzliche Hinweise |

## 3. Webseite einschalten
Der Standard-Branch dieses Repos ist `claude/stock-screening-app-de-jbr8np`, ein Pull Request ist nicht nötig.
1. **Settings → Pages → Source: GitHub Actions**.
2. **Actions → „Täglich aktualisieren und veröffentlichen“ → Run workflow** für das erste Update.
3. Nach ca. 2 Minuten ist die App unter `https://<dein-name>.github.io/Aktien/` erreichbar.

Ab dann: Mo–Fr um 22:00 UTC (23:00 Uhr Winter / 00:00 Uhr Sommer) automatisch. Schlägt der Abruf fehl, zeigt die App eine rote Meldung statt alter Zahlen, du bekommst eine Push-Nachricht und GitHub markiert den Lauf rot.

## 4. Aufs Handy
- **iPhone (Safari):** Adresse öffnen → Teilen → *Zum Home-Bildschirm*.
- **Android (Chrome):** Adresse öffnen → Menü → *App installieren*.

## 5. Positionen für Verkaufs-Benachrichtigungen
Der Server kennt deine Käufe nicht (sie liegen nur im Browser). Für „Verkaufen prüfen“ per Push:
App → Einstellungen → *Sicherung herunterladen* → Datei als `config/portfolio.json` ins Repository hochladen (Add file → Upload files). Diese Aktien werden dann auch automatisch mitgeladen. Nach neuen Käufen die Datei erneuern.

## 6. Filterwerte ändern
App → Einstellungen → *Screener- und Signalwerte* → *settings.json erzeugen* → als `config/settings.json` ins Repository legen.

## Live-Kurse für Watchlist und Positionen (automatisch aktuell)
Der Server rechnet nachts den Screener. **Für deine Watchlist und deine offenen Positionen holt sich die App die aktuellen Kurse und Charts selbst**, direkt von Twelve Data:
1. App öffnen → Einstellungen → **Live-Kurse** → deinen Twelve-Data-Schlüssel eintragen → „Speichern und testen“.
2. Ab dann aktualisiert die App beim Öffnen, beim Zurückkehren in die App und alle 5 Minuten (nur Aktien, die älter als 20 Minuten sind, während der US-Börse; sonst höchstens alle 3 Stunden).
3. Neue Watchlist-Aktien werden sofort geladen, auch wenn sie nicht im Screener sind (Kurse, Chart, Signal, Marktampel, relative Stärke).
4. Der Schlüssel liegt nur auf diesem Gerät (im Browser). Jedes Gerät braucht ihn einmal.

Wichtig:
- Kostenlos sind 8 Abrufe pro Minute und 800 pro Tag. Die App bremst sich selbst und stoppt bei 750. Pro Aktie und Aktualisierung zählt 1 Abruf, plus 1 für den S&P-500-Vergleich.
- Während des Handelstags zeigt die Karte „Live … · Tag läuft“. Kaufsignale werden nur aus **abgeschlossenen** Handelstagen berechnet, ebenso „Verkaufen prüfen“. Der Live-Kurs zeigt Gewinn und Verlust.
- Quartalstermin fehlt (Twelve Data liefert ihn nicht kostenlos, TradingView nur für Aktien im Nacht-Lauf)? Auf der Watchlist „Bericht-Termin …“ antippen und das Datum eintragen. Der Server holt ihn für Aktien aus `config/portfolio.json` zusätzlich vom TradingView-Scanner.
- Ob die kostenlose Stufe von Twelve Data Echtzeit- oder verzögerte Kurse liefert, bitte auf twelvedata.com prüfen.

## Wer kann die Seite benutzen?
Nur du. Die Seite selbst ist öffentlich erreichbar, aber **alle Daten (Aktien, Kurse, Charts, Signale) werden vor dem Veröffentlichen mit deinem Daten-Passwort verschlüsselt (AES-256)**. Wer den Link kennt, sieht nur ein Passwortfeld und unlesbare Dateien. Entschlüsselt wird erst auf deinem Gerät, nachdem du das Passwort eingegeben hast.
- Beim ersten Öffnen auf dem Handy und auf dem Computer das Daten-Passwort eingeben („Auf diesem Gerät merken“ spart es künftig). Abmelden: Einstellungen → Daten-Passwort.
- Passwort vergessen oder ändern: neues Secret `DATA_PASSPHRASE` eintragen, Workflow starten, überall neu eingeben.
- Ein Sicherheitsnetz im Workflow bricht ab, falls je lesbare Daten veröffentlicht würden.
- Der Code der Seite ist öffentlich, er enthält aber keine Daten und keine Schlüssel.

## Wichtig
- **Repository privat lassen** (Settings → General → Danger Zone → Change visibility). Besonders, wenn du `config/portfolio.json` hochlädst: Darin stehen deine Positionen im Klartext.
- Das Passwort schützt die Daten vor Fremden. Wer dein Passwort kennt oder dein entsperrtes Gerät hat, kann sie lesen. Zusätzlich gibt es den PIN-Schutz in der App.
- Deine Portfolio-Daten stehen nie auf der Webseite. Sie bleiben im Browser des Geräts.
- Updates laufen einmal pro Abend. Der „Sofort“-Hinweis bei „Verkaufen prüfen“ kommt direkt nach diesem Lauf, nicht während des Börsentags.
