// Fachwörter in einfachem Deutsch. Eintrag hinzufügen = neues Info-Symbol möglich.
export const GLOSSARY = {
  markt: ['Marktampel', 'Wir schauen auf den S&P 500, den Index der 500 großen US-Firmen. Liegt er über seinem Durchschnitt der letzten 200 Tage (SMA 200), ist der Markt stark: grün. Sonst ist er schwach: rot. In schwachen Märkten scheitern neue Käufe öfter.'],
  sma: ['SMA (gleitender Durchschnitt)', 'Der Durchschnitt der letzten Schlusskurse, z. B. der letzten 50 oder 200 Tage. Er glättet das Auf und Ab und zeigt die Richtung. Liegt der Kurs darüber, ist die Aktie im Aufwärtstrend.'],
  trend: ['Trend', 'Gesund ist: Kurs über SMA 50, SMA 50 über SMA 200, und beide Linien steigen. So sieht ein stabiler Aufwärtstrend aus.'],
  ausbruch: ['Ausbruch', 'Der Kurs schließt über dem höchsten Stand der letzten Wochen. Viele Anleger warten genau darauf, deshalb steigt der Kurs danach oft weiter.'],
  ruecksetzer: ['Rücksetzer mit Umkehr', 'Die Aktie fällt im Aufwärtstrend kurz zurück bis an den SMA 50 und dreht dort mit einer grünen Kerze wieder nach oben. Das ist ein zweiter, ruhigerer Einstieg.'],
  volumen: ['Volumen', 'Wie viele Aktien an einem Tag gehandelt werden. Steigt der Kurs bei 1,5-fachem Volumen oder mehr, sind meist große Anleger beteiligt. Ein Ausbruch ohne Volumen ist unsicherer.'],
  kerze: ['Kerze', 'Eine Kerze zeigt einen Handelstag: Eröffnung, Hoch, Tief, Schluss. Grün = Schluss über Eröffnung. Schließt sie nahe dem Tageshoch, haben die Käufer den Tag klar gewonnen.'],
  abstand: ['Abstand zum Ausbruch', 'Je weiter der Kurs über dem Ausbruchslevel liegt, desto schlechter das Chance-Risiko-Verhältnis. Deshalb: höchstens ca. 5 % darüber einsteigen, sonst nicht hinterherlaufen.'],
  bericht: ['Quartalsbericht', 'Alle drei Monate melden Firmen ihre Zahlen. Der Kurs kann danach über Nacht um 10–20 % springen – in beide Richtungen, ohne dass dein Stop greift. Darum kein Kauf kurz davor.'],
  stop: ['Stop-Loss', 'Ein Preis unter deinem Einstieg, bei dem du aussteigst, wenn der Kauf nicht aufgeht. Er begrenzt den Verlust. Hier: höchstens ca. 7–8 % unter dem Einstieg.'],
  rs: ['Relative Stärke', 'Vergleich mit dem S&P 500. Läuft die Aktie in 3 und 6 Monaten besser als der Index, gehört sie zu den Anführern und wird im Ranking höher einsortiert. Angabe in Prozentpunkten.'],
  luecke: ['Kurslücke (Gap)', 'Eine Aktie eröffnet deutlich höher als sie am Vortag geschlossen hat. Liegt die Eröffnung schon über dem Einstiegsbereich, ist die Gelegenheit meist vorbei: nicht hinterherlaufen.'],
  einstieg: ['Einstiegsbereich', 'Vom Ausbruchslevel bis höchstens 5 % darüber. Außerhalb dieses Bereichs wird das Risiko im Verhältnis zur Chance zu groß.'],
  stueck: ['Stückzahl', 'Wird so berechnet: (Kapital × Risiko in %) ÷ (Einstieg − Stop). So verlierst du bei Auslösen des Stops höchstens den eingestellten Anteil deines Kapitals.'],
  chance: ['Chance-Risiko-Verhältnis', 'Ø Gewinn geteilt durch Ø Verlust deiner Trades. Bei 3 : 1 bringt ein Gewinner im Schnitt so viel wie drei Verlierer kosten. Je höher, desto weniger Treffer brauchst du, um im Plus zu sein.'],
  rmult: ['R-Vielfaches', 'Gewinn oder Verlust gemessen in Vielfachen deines Anfangsrisikos. +2 R heißt: doppelt so viel gewonnen, wie du ursprünglich bei Stop-Auslösung verloren hättest. −1 R = Stop wurde erreicht.'],
  daten: ['Datenwarnung', 'Die App hat in den Kursdaten etwas Auffälliges gefunden, z. B. fehlende Tage, einen möglichen Aktiensplit oder einen ungewöhnlichen Sprung. Die Berechnung kann dann falsch sein – prüfe den Chart selbst.']
};
