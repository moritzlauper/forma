# FORMA 2.0: Konzept für den Umbau

Stand 12. November 2026. Auslöser war ein Ricardo-Inserat («WRSTBHVR Hoodie XL»), auf dem FORMA endlos lud und immer wieder abbrach.

## Was heute schiefläuft

Ricardo zeigt im Inserat einen Countdown, der jede Sekunde den Seitentext ändert. Der `MutationObserver` in `src/content.ts` liest die Seite darum laufend neu. Der Seitentext fliesst in den Cache-Schlüssel ein, also löst fast jeder Durchgang eine neue AI-Anfrage aus und verwirft die vorherige als veraltet. Das erklärt den Dauerabbruch und den Verbrauch des Anfragebudgets.

Dazu kommt der Transport. Die AI-Anfrage läuft ohne Streaming mit 40 Sekunden Timeout, und das Content Script wartet die ganze Zeit auf die Antwort derselben Nachricht. Beendet Chrome den Service Worker in dieser Zeit, kommt nie eine Antwort zurück und der Spinner bleibt stehen.

Inhaltlich liest FORMA Marktplätze schlecht. Ricardo hat kein `<main>`, kein Produkt-JSON-LD und keine Grössentabelle. Grösse, Typ und Zustand stehen in einer Attributliste (`<p>Grösse</p><a>XL</a>`), die der heutige Extraktor nicht kennt. Die Beschreibung steckt in `div[name="description-panel"]`.

Die Entscheidung selbst ist schwer nachvollziehbar. Der Prompt in `src/assessment.ts` hat mehrere tausend Wörter Einzelregeln. Danach prüfen rund ein Dutzend lokale Regeln die Antwort und werfen bei Widerspruch einen Fehler, statt das Ergebnis zu korrigieren. Für Längen gibt es ohne publizierte Tabelle keine Schätzung.

## Ziel

FORMA soll auf normalen Kleidershops und auf Marktplätzen wie Ricardo, Tutti, Vinted oder eBay funktionieren. Pro Produkt geht höchstens eine AI-Anfrage raus, ausser du drückst Refresh. Fehlen publizierte Masse, schätzt FORMA Länge, Breite und Ärmel und kennzeichnet das als Schätzung. Das Urteil entsteht lokal im Code und lässt sich Schritt für Schritt erklären.

## Aufbau in drei Stufen

**1. Seite lesen (lokal, ohne AI).** Das Content Script baut ein `Listing`: Titel, Marke, Breadcrumbs, Attribute (Label/Wert-Paare wie «Grösse: XL» oder «Material: Baumwolle»), angebotene Grössen mit Verfügbarkeit, Beschreibung, Textzeilen mit Massen oder Modellangaben, Tabellen und bis zu vier Fotos. Ein Marktplatz wird an der Domain oder an Signalen wie «Zustand» und einer einzigen Grösse erkannt. Zeitangaben und Countdowns werden vor dem Vergleich entfernt.

Gelesen wird beim Laden, nach Navigation und auf Refresh. Der Observer läuft nur in den ersten 15 Sekunden nach dem Laden und höchstens alle 2.5 Sekunden, damit nachgeladene Grössentabellen noch erfasst werden. Danach schaltet er sich ab. Gesendet wird nur, wenn sich die Signatur der stabilen Felder ändert.

**2. Garment lesen (AI oder lokal).** Eine Anfrage pro Produkt, mit Streaming über das Anthropic TypeScript SDK und strukturierter Ausgabe (`output_config.format`). Die AI liefert ein `Reading`:

- Garment-Typ, Schnitt, Dehnbarkeit
- pro Grösse die Masse in cm, flach gemessen, jeweils mit Quelle (`chart`, `seller`, `photo`, `typical`) und Toleranz
- Körpermass-Bereiche, falls die Tabelle Körpermasse statt Kleidermasse angibt
- pro Grösse eine Einschätzung für Breite, Länge und Ärmel auf einer Skala von «viel zu klein» bis «viel zu gross»
- Schnitt-Bewertung 0–10, kurze Zusammenfassung, Belege, offene Punkte

Ohne publizierte Masse schätzt die AI typische Masse für Typ, Marke, Schnitt und Grösse und gibt eine ehrliche Toleranz an (meist 3–6 cm). Der lokale Tabellenparser liest Tabellen und Verkäuferangaben («Brust 58 cm», «pit to pit 60») selbst. Wo er sicher ist, überschreibt er die Zahlen der AI. Im Modus «No AI» ist er allein zuständig.

**3. Entscheiden (lokal, deterministisch).** `decide()` bewertet jede Grösse in drei Checks: Breite, Länge, Ärmel. Jeder Check bekommt eine Stufe von −2 (zu eng oder zu kurz) bis +2 (zu weit oder zu lang), eine Basis und eine Konfidenz. Die Basis wird in dieser Reihenfolge gesucht:

1. Eigenes Feedback zum selben Produkt und zur selben Grösse
2. Vergleich mit Kleidern, die du getragen hast (Good Fits und Fit-Feedback derselben Garment-Gruppe), in cm
3. Deine eigenen Körpermasse, mit Zielweite je nach bevorzugtem Fit
4. Körpermass-Bereiche aus der Grössentabelle
5. Die Einschätzung der AI

Aus den Stufen wird pro Grösse ein Score von 0 bis 10. Ein schlechter Check zieht den Score nach unten und lässt sich nicht durch die anderen ausgleichen. Die beste verfügbare Grösse wird empfohlen. Liegt sie unter 5, empfiehlt FORMA keine Grösse und nennt den Grund («wahrscheinlich zu kurz»). Grössen, die du beim selben Produkt als zu eng oder zu kurz gemeldet hast, und alle kleineren fallen weg.

Garments werden nur innerhalb einer Gruppe verglichen: T-Shirts, Sweats (Hoodie, Sweatshirt, Strick), Hemden, Jacken, Hosen, Shorts, Kleider/Röcke, Schuhe. Die Länge eines Lieblings-T-Shirts sagt nichts über einen Hoodie.

Ändert sich dein Profil oder Feedback, rechnet FORMA die Entscheidung aus dem gespeicherten `Reading` sofort neu, ohne neue AI-Anfrage.

## Transport und Budget

Das Content Script schickt das Listing und bekommt sofort eine Quittung. Das Ergebnis kommt später als eigene Nachricht vom Service Worker und liegt zusätzlich in `chrome.storage.session`. Der Spinner hat ein Timeout von rund 100 Sekunden und zeigt danach einen Hinweis statt endlos zu laden.

Der Cache-Schlüssel ist ein Hash über die stabilen Listing-Felder, das Profil, die Referenzkleider, Modell und Prompt-Version. Gleiche Eingaben teilen sich eine laufende Anfrage. Fehlgeschlagene Anfragen werden nicht automatisch wiederholt. Das Budget zählt weiterhin jeden Versuch. Der Ein/Aus-Schalter bricht laufende Anfragen ab.

Als Standardmodell bleibt Claude Haiku 5.5. In den Einstellungen sind Sonnet 5.5 und Opus 5.5 wählbar. Weil die Erweiterung direkt aus dem Browser mit Anthropic spricht, braucht das SDK `dangerouslyAllowBrowser`. Der Schlüssel liegt wie bisher nur im Speicher der Erweiterung und nie in einem Seiten-Skript.

## Was bleibt, was ersetzt wird

Bleiben: Request-Budget, Runtime-Messaging, Reader-Start ohne offenes Panel, automatische Erkennung, verschiebbares Popup, Profil, Notizen, Good Fits und Feedback. Die gespeicherten Daten werden übernommen, alte Good Fits mit Tabellenwerten liefern ihre Masse weiter.

Ersetzt werden `assessment.ts`, `scoring.ts`, `fit-evidence.ts`, `detect.ts`, `chart-shape.ts`, `product-page.ts`, `product-evidence.ts`, `size-baseline.ts`, `estimates.ts` und die Shop-Ansicht im Panel. Die automatisch geschätzten Körpermasse aus Grösse und Gewicht fallen weg. Die AI bekommt Grösse und Gewicht direkt, und lokal zählen nur Masse, die du selbst eingetragen hast.

## Tests

- Unit-Tests für Listing-Extraktion mit HTML-Fixtures (Ricardo-Struktur, Shop mit JSON-LD und Tabelle, Katalogseite, Countdown ändert die Signatur nicht)
- Unit-Tests für Tabellenparser, Grössenlabels und `decide()`
- Browser-Test mit isolierter Chromium-Instanz und simulierter AI: genau eine Anfrage trotz tickendem Countdown, Karte erscheint
- Extraktor live auf Ricardo und einem normalen Shop im echten Chrome prüfen

Ein Live-Test der AI-Urteile braucht einen API-Key und kostet Anfragen. Den mache ich nur, wenn du ihn freigibst.

## Offene Punkte

- Ob «Medium» als Effort für Haiku 5.5 schnell genug ist, zeigt erst der Live-Test.
- Die Schwellen in `decide()` (zum Beispiel 2.5 cm pro Stufe bei der Breite) sind Startwerte und sollten mit echten Fällen nachjustiert werden.
