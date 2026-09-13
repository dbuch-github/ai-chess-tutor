# AI Chess Tutor

Desktop-App (Electron + TypeScript + React), die Chessnut-Air-Brett, UCI-Engines als Gegner,
Live-Stockfish-Analyse und einen LLM-Schachtutor verbindet.

Konzept: <https://claude.ai/code/artifact/23e3435a-beed-47d3-97e9-984325955f0f>

## Status

- [x] **Phase 1 – MVP:** Digitales Brett (chessground), Spiel gegen konfigurierbare UCI-Engine,
      Live-Analyse (Stockfish, MultiPV 3) mit Eval-Bar und Zugklassifikation
- [x] **Phase 2:** Chessnut-Air-Anbindung per Web Bluetooth – Live-Zugerkennung,
      LED-Feedback für Gegnerzüge, Korrekturhinweise. Ungetestet mit echter Hardware
      bis zur Rückmeldung des Nutzers (siehe Abschnitt „Chessnut Air" unten)
- [x] **Phase 3:** LLM-Tutor (Claude), Prompt-Builder, Trigger-Modi, gestreamter Tutor-Chat,
      Undo/Redo, Figurinen-Notation, Board-Preview (Angriffe/Deckungen/Fesselungen/aufgedeckte
      Angriffe/schwache Felder, klickbare Analyse-Linien) – deutlich über den ursprünglichen
      Zuschnitt hinausgewachsen
- [x] **Phase 4:** Partie-Report · Engine-Auswahl (Maia) + Eröffnungsbuch/-erkennung ·
      Multi-Provider-Tutor (Anthropic/OpenAI/Google) · PGN-Export/-Import · lokale
      Partie-Bibliothek (Auto-Speichern) – siehe Konzeptdokument für Details. Phase 4 komplett.
- [x] **Nach Phase 4:** Schachuhr mit Turnier-Voreinstellungen, Zug-Sound, Default-Pfad im
      Maia-Dateidialog

## Voraussetzungen

- Node.js ≥ 22
- Stockfish (`brew install stockfish`) – wird automatisch unter
  `/opt/homebrew/bin/stockfish` gefunden; andere Pfade über die Einstellungen (⚙︎) setzen.

## Entwicklung

```bash
npm install
npm run dev        # Dev-Modus mit HMR
npm run build      # Produktionsbuild nach out/
npm run typecheck
```

## Aufbau

```
src/
  main/            Electron-Main-Prozess
    engine/        UciEngine (Prozess-Wrapper) + EngineManager (Gegner + Analyse)
    tutor/         TutorService (Orchestrierung) + providers/ (Anthropic, OpenAI, Google)
  preload/         IPC-Bridge (window.api)
  renderer/src/
    game/          useGame (Partie-Zustand), classify, openingBook, pgn (Export/Import)
    chessnut/      Web-Bluetooth-Anbindung: protocol (Byte-Kodierung), inferMove
                   (Zugableitung), useChessnutBoard (Verbindung), useChessnutSync
                   (LED-Feedback/Korrekturhinweise), useChessnutPreview (blinkende
                   LEDs für Zugvorschläge), useChessnutBestMove (blinkender bester
                   Analysezug, Von-/Ziel-Feld im Wechsel)
    components/    Board, EvalBar, AnalysisPanel, MoveList, SettingsDialog
  shared/          gemeinsame IPC-Typen
```

## LLM-Tutor

- **Provider** (⚙︎ → „LLM-Tutor“ → Anbieter): **Anthropic** (`@anthropic-ai/sdk`,
  Default `claude-opus-5`), **OpenAI** (`openai`-SDK, Responses API, Default `gpt-5.1`),
  **Google** (`@google/genai`, Default `gemini-3.1-pro`). Modell je Provider frei konfigurierbar.
  Jeder Provider hat sein eigenes Modell + API-Key; ein Wechsel überschreibt die anderen nicht.
- **Architektur:** `TutorService` orchestriert providerneutral (Prompt-Bau, Gesprächshistorie,
  Trigger-Logik); `src/main/tutor/providers/*` übersetzt in das jeweilige SDK-Format. Neue
  Provider brauchen nur eine weitere Klasse, die das `LlmProvider`-Interface implementiert.
- **API-Keys:** je Provider einzeln per Electron `safeStorage` verschlüsselt (macOS-Keychain-
  gestützt) unter `userData/tutor-config.json`. Für Anthropic wird zusätzlich `ANTHROPIC_API_KEY`
  aus der Umgebung genutzt, wenn kein Key gespeichert ist.
- **Trigger-Modi** (im Tutor-Panel): *Still* (nur auf Nachfrage), *Fehler* (kommentiert eigene
  Fehler/Blunder), *Aktiv* (auch Ungenauigkeiten und Engine-Patzer).
- **Prompt-Prinzip:** Das LLM rechnet nie selbst – es bekommt FEN, Partieverlauf (SAN),
  Stockfish-Bewertungen vor/nach dem Zug und die beste Engine-Variante vorformatiert und
  erklärt nur didaktisch. Zugkommentare laufen mit niedrigem Effort, Antworten werden gestreamt.
- **Effort/Reasoning:** Bei Anthropic steuert `output_config.effort`, bei OpenAI (Reasoning-
  Modelle) `reasoning.effort` die Denktiefe – bei Google gibt es kein Äquivalent, wird ignoriert.
- Anthropic-Refusal-Fallbacks (`fallbacks: "default"`, Beta) sind aktiviert; bei einer 400 fällt
  der Service automatisch auf einen Aufruf ohne Fallbacks zurück.

## Gegner-Engine & Eröffnungen

⚙︎ → „Gegner-Engine“ bietet drei Engine-Arten:

- **Stockfish** (Default): wie bisher, mit Elo-Begrenzung.
- **Maia** ([lc0](https://github.com/LeelaChessZero/lc0) + [Maia-Netz](https://github.com/CSSLab/maia-chess),
  `brew install lc0`, Gewichte separat herunterladen): spielt menschenähnlich, da auf Millionen
  menschlicher Partien trainiert. Läuft mit `go nodes 1` (Suche deaktiviert, reine
  Netz-Vorhersage) statt Bedenkzeit – die Spielstärke (1100–1900) steckt in der gewählten
  `.pb.gz`-Datei, nicht in einer Elo-Option.
- **Andere UCI-Engine:** freier Pfad, wie zuvor.

**Eröffnungsbuch** (Checkbox, Default an): Der Gegner zieht in den ersten 10 Vollzügen nach
Möglichkeit aus einer Datenbank von rund 3.800 benannten Eröffnungen
([lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)) statt immer nach
Engine-Bestzug – gewichtet nach Häufigkeit in der Datenbank. Kein Treffer mehr → Engine übernimmt.

**Live-Eröffnungserkennung:** Über der Stockfish-Analyse zeigt „📖 Name (ECO-Code)“ die am
weitesten passende bekannte Eröffnung für die gespielten Züge – bleibt nach Verlassen der
Theorie auf dem letzten bekannten Stand stehen, statt zu verschwinden.

## Chessnut Air

Anbindung per **Web Bluetooth** (läuft direkt in Chromium/Electron, kein natives
Node-Modul wie `noble` nötig – dadurch kein Neukompilieren bei Electron-Updates).

- **„Verbinden“** im Chessnut-Einzeiler direkt unter dem Brett öffnet den
  Bluetooth-Geräteauswahl-Dialog; bei genau einem gefundenen Brett wird automatisch
  verbunden. Chromium merkt sich die Freigabe pro Anwendung, danach verbindet sich die
  App beim Start still im Hintergrund
  wieder, ohne erneut zu fragen (dort, wo der Browser das unterstützt).
- **Solange verbunden ist, ist das Bildschirm-Brett nur noch Spiegel:** Eigene Züge kommen
  ausschließlich vom physischen Brett; die Maus ist deaktiviert, um kein widersprüchliches
  zweites Eingabegerät zu haben.
- **LED-Feedback:** Nach jedem Zug (eigenem wie Engine-Zug) leuchten die betroffenen Felder,
  bis die physische Stellung wieder mit der Soll-Stellung übereinstimmt – bei einem
  Gegnerzug ist das die Aufforderung, ihn von Hand nachzuziehen. Die LEDs zeigen dabei immer
  genau die Felder des bekannten letzten Zugs, nicht die volle beobachtete Abweichung – ein
  einzelner fehlerhafter RFID-Lesevorgang auf einem unbeteiligten Feld kann so keine falschen
  LEDs mehr auslösen. Das LED-Kommando wird bei jeder neuen Stellungsmeldung vom Brett (alle
  ~200ms) erneut gesendet, nicht nur einmal direkt nach dem Zug – ein einzelner verlorener
  oder mit einer sofortigen Folgeaktion kollidierender Schreibbefehl korrigiert sich so von
  selbst, statt die LEDs dauerhaft falsch stehen zu lassen.
- **Korrekturhinweise:** Weicht das Brett von der erwarteten Stellung ab (z. B. beim
  Nachziehen vertan), zeigt der Einzeiler die betroffenen Felder als Text-Hinweis – erst,
  nachdem dieselbe Abweichung zweimal in Folge beobachtet wurde, damit ein einzelner
  RFID-Fehlmesswert nicht sofort eine (falsche) Meldung auslöst.
- **Gilt auch für „Neue Partie“, PGN-Import und Zug-Rücknahme:** Nicht nur nach einem
  einzelnen Zug, sondern nach jeder Stellungsänderung wird geprüft, ob das physische Brett
  noch mit der App übereinstimmt. Steht das Brett z. B. nach „Neue Partie“ noch mitten in
  der alten Partie, leuchten die fehlenden/überzähligen Felder und ein neuer Zug wird erst
  wieder erkannt, sobald die Grundstellung tatsächlich aufgebaut ist. Das gilt auch, wenn
  unmittelbar danach schon der nächste Zug eintrifft, bevor das Brett geprüft werden konnte
  (z. B. „Neue Partie als Schwarz“, wo die Engine als Weiß sofort automatisch zieht) – dann
  zeigen die LEDs weiterhin die vollständige Abweichung statt nur der zwei Felder des
  jüngsten Zugs, bis das Brett wirklich passt.
- **Zugvorschläge blinken auf dem Brett:** Der „💡 Zugvorschlag“ des Tutors und jede
  angeklickte Analyse-Linie – dieselbe Quelle, die auch den Pfeil auf dem Bildschirm-Brett
  zeichnet – lässt zusätzlich die betroffenen Felder auf dem physischen Brett blinken
  (500&nbsp;ms An/Aus; die Hardware kann selbst nicht blinken, das übernimmt die Software).
  Tritt zurück, solange noch ein Zug physisch nachzuziehen ist.
- **Zug-Erkennung:** Statt einzelne Felder zu diffen, wird die komplette beobachtete
  Stellung gegen jeden legal möglichen Zug aus der aktuellen Stellung verglichen (der
  simulierte Zug muss exakt zur beobachteten Stellung führen) – deckt Schlagzüge, Rochade,
  En-passant und Bauernumwandlung (inklusive gewählter Figur) ohne Sonderfälle ab. Ein
  Kandidat wird erst nach zwei aufeinanderfolgenden übereinstimmenden Lesungen übernommen,
  als Schutz gegen einen einzelnen fehlerhaften RFID-Lesevorgang.
- **Bester Analysezug als Blinken (optional):** Solange der Spieler am Zug ist, blinkt der
  beste Zug der mitlaufenden Stockfish-Analyse auf dem Brett – Von-Feld und Ziel-Feld im
  Wechsel (je 500&nbsp;ms), nie gleichzeitig. Per Toggle-Schalter „Bester Zug“ im
  Chessnut-Einzeiler ein-/abschaltbar (Default: an), persistiert wie die übrigen
  Einstellungen. Gezeigt wird nur eine Analyse zur aktuellen Stellung ab Tiefe 10 (sonst
  würde bei jedem Tiefensprung ein anderer Kandidat aufblitzen); tritt zurück, solange
  noch ein Zug physisch nachzuziehen ist oder eine angeklickte Zugvorschau blinkt.
  **Warum im Wechsel (Hardware-Eigenheit des Bretts):** Die LED-Matrix des Chessnut Air
  ist gemultiplext – leuchten gleichzeitig Felder in mehreren Reihen *und* mehreren Linien,
  glimmen an den übrigen Kreuzungspunkten aktiver Reihen mit aktiven Linien schwache,
  leicht flimmernde "Geister-LEDs" mit, die gar nicht angesteuert wurden (Beispiel
  Springer g1 → e2/f3/h3: zusätzlich glimmen e1, g3, h1; per Video Bild für Bild
  nachgewiesen; das Protokoll kennt pro Feld nur an/aus, eine Helligkeitssteuerung gibt es
  nicht). Ein einzelnes Feld ist immer geisterfrei. Aus demselben Grund wurde ein früheres
  Feature wieder entfernt, das beim Anheben einer Figur alle legalen Zielfelder zeigte:
  Bei Schwerfiguren zu viele Felder auf einmal (Geister), als reihenweises Lauflicht zu
  unruhig. Zusätzlich schreibt `setLeds` ein unverändertes Muster gar nicht erst erneut
  ans Board (Vergleich gegen das zuletzt tatsächlich gesendete Muster), sodass die
  ~200-ms-Brett-Meldungen keine überflüssigen Schreibbefehle auslösen. Der Schreibvorgang
  selbst läuft, wie in der Community-Referenzimplementierung
  ([paulvonallwoerden/chessnut-air](https://github.com/paulvonallwoerden/chessnut-air)),
  wo möglich "ohne Antwort" (`writeValueWithoutResponse`) statt mit
  Bestätigungs-Roundtrip – schneller und schließt das (kleine) Zeitfenster, in dem sich
  zwei praktisch zeitgleiche Schreibvorgänge mit demselben Muster hätten überlappen
  können (das zuletzt gesendete Muster wird dafür schon vor dem eigentlichen
  Schreibvorgang gemerkt, nicht erst danach).
- **Protokoll:** Zwei BLE-GATT-Services (Stellungs-Übertragung + Schreiben/Bestätigung),
  32-Byte-Stellungspaket (2 Felder pro Byte), LED-Kommando mit einem Byte pro Reihe.
  Reverse-engineered von der Community, hier verifiziert gegen die offizielle
  Protokolldokumentation "Chessnut chess board communications" von Graham O'Neill sowie
  drei unabhängige Open-Source-Implementierungen
  ([paulvonallwoerden/chessnut-air](https://github.com/paulvonallwoerden/chessnut-air),
  [NSStudent/EasyLinkSwiftSDK](https://github.com/NSStudent/EasyLinkSwiftSDK),
  [Dash1971/chessnut-maia-cli](https://github.com/Dash1971/chessnut-maia-cli)) – alle
  liefern exakt dieselben Konstanten.
- **Wichtiger Hinweis zum Teststand:** Das Byte-Protokoll (Stellungs-Dekodierung,
  LED-Kodierung) und die Zugableitungslogik sind isoliert gegen die offiziellen
  Protokollbeispiele und diverse Szenarien (Schlagzug, Rochade, En-passant,
  Unterverwandlung, Übergangsstellungen) verifiziert. Der eigentliche
  Bluetooth-Verbindungsaufbau mit einem echten Brett ist in dieser Entwicklungsumgebung
  **nicht** testbar (keine Bluetooth-Hardware) und braucht noch die Verifikation mit dem
  echten Chessnut Air.
- **Für später (Distribution):** Ein gepacktes macOS-App-Bundle (electron-builder, noch
  nicht eingerichtet) braucht `NSBluetoothAlwaysUsageDescription` in der Info.plist, sonst
  verweigert macOS den Bluetooth-Zugriff kommentarlos. Im Dev-Modus (`npm run dev`) ist das
  nicht nötig.

## Partie-Report

„📋 Partie-Report" in der Kopfleiste (ab 2 Zügen aktiv) öffnet einen Dialog mit rein lokal
berechneten Statistiken (Blunder/Fehler/Ungenauigkeiten/beste Züge, jeweils eigene Züge) und
den bis zu vier gravierendsten eigenen Fehlern als „kritische Momente" – beides ohne LLM-Aufruf.
„Report erstellen" schickt das an den Tutor (`effort: high`, bis zu 4000 Tokens) für eine
gestreamte Zusammenfassung: wiederkehrende Fehlermuster, die kritischsten Momente erklärt,
2–3 konkrete Lernpunkte.

## PGN-Export & -Import

- **„💾 PGN exportieren“** (ab 1 Zug aktiv): schreibt die aktuelle Partie inkl. Kopfzeilen
  (Datum, Spieler/Engine-Name, Ergebnis aus der tatsächlichen Endstellung abgeleitet) über
  einen nativen Speichern-Dialog auf die Platte.
- **„📂 PGN importieren“**: lädt eine beliebige PGN-Datei (eigene Exporte oder von anderswo,
  z. B. Lichess/Chess.com) und zeigt sie im **Review-Modus**: Brett, Zugliste, Stockfish-Analyse,
  Eröffnungserkennung und Tutor (Zugvorschlag, Rückfragen, Partie-Report) funktionieren normal
  auf der importierten Partie, das Brett ist aber schreibgeschützt und der Gegner zieht nicht
  automatisch weiter.
- **„▶ Weiterspielen“** beendet den Review-Modus – die Partie läuft ab der importierten
  Endstellung normal weiter (die Seite, die dort am Zug ist, wird zur Spielerfarbe).

## Partie-Bibliothek

- Jede tatsächlich zu Ende gespielte Partie (Matt, Patt, Remis per Regel …) wird automatisch
  als PGN unter `userData/games/<Zeitstempel>.pgn` abgelegt – kein manueller Schritt nötig.
  Importierte Partien im Review-Modus lösen dabei **kein** erneutes Speichern aus, auch nicht
  beim anschließenden „Weiterspielen“ einer bereits beendeten Partie.
- **„📚 Bibliothek“** in der Kopfleiste öffnet eine Liste aller gespeicherten Partien
  (neueste zuerst) mit Datum, Spielern, Ergebnis und Halbzug-Anzahl.
- **„Öffnen“** lädt die Partie in den Review-Modus (wie ein PGN-Import); **„Löschen“**
  entfernt die Datei dauerhaft von der Platte.
- Bewusst kein vollständiges Datenbank-Feature (keine Suche/Filter/Tags) – siehe
  Konzeptdokument, Abschnitt „Phase 4c“.

## Schachuhr

⚙︎ → „Bedenkzeit (Schachuhr)“:

- **Frei** (Default): keine Zeitkontrolle, kein Uhr-Badge sichtbar.
- **Klassisch** (60 min + 30 s), **Schnellschach/Rapid** (15 min + 10 s), **Blitzschach**
  (5 min + 3 s), **Bullet-Schach** (1 min + 1 s) – jede Kategorie befüllt Grundzeit/Inkrement
  mit einem sinnvollen Voreinstellungswert, beides bleibt danach frei editierbar (z. B. für
  ein individuelles Inkrement).
- Beide Uhren zeigen sich als Badge neben der jeweiligen Geschlagene-Figuren-Leiste,
  zählen für die jeweils am Zug befindliche Seite in Echtzeit herunter (auch während die
  Engine denkt) und werden unter 20 Sekunden rot/pulsierend. Der allererste Zug der Partie
  ist unbegrenzt bedenkbar – die Uhr steht bis dahin auf der vollen Grundzeit still und
  startet erst mit dem ersten gespielten Zug.
- Inkrement wird der ziehenden Seite direkt nach ihrem Zug gutgeschrieben.
- Läuft eine Uhr ab, endet die Partie sofort mit „… gewinnt durch Zeitüberschreitung“ –
  unabhängig vom Stellungswert.
- „Speichern & anwenden“ setzt beide Uhren auf die dort gewählte Grundzeit zurück (wie die
  übrigen Engine-Einstellungen wirkt auch das sofort, nicht erst mit der nächsten Partie).

## Zug-Sound

Bei jedem gespielten Zug (eigener Zug, Engine-Antwort, Redo) erklingt ein kurzes „Klack“
(Figur auf Holzbrett) – rein synthetisiert per Web-Audio-API (gefilterter Rausch-Burst +
kurzer Tonimpuls), keine Audiodatei nötig. Abschaltbar über ⚙︎ → „Sound“.

Hinweise:

- Zwei getrennte Engine-Prozesse: Gegner (konfigurierbar, optional Elo-limitiert) und
  Analyse (immer Stockfish, `go infinite` mit MultiPV 3 auf der aktuellen Stellung).
- Zugklassifikation über Verlust an Gewinnwahrscheinlichkeit (Lichess-Formel):
  ≥30 % Blunder, ≥20 % Fehler, ≥10 % Ungenauigkeit; ★ = Engine-Bestzug. Läuft die Stellung
  weiter, bevor die Mindesttiefe erreicht ist, wird die bis dahin erreichte Tiefe als
  endgültig akzeptiert (sonst bliebe ein sehr schnell gespielter Zug für immer unklassifiziert).
- Umwandlung ist aktuell immer Dame (Promotion-Dialog steht noch aus).
- Die Durchsuchen-Dialoge für lc0-Binary und Maia-Gewichtsdatei öffnen sich standardmäßig im
  zuletzt gewählten bzw. erkannten Ordner, statt immer im Home-Verzeichnis zu starten.
