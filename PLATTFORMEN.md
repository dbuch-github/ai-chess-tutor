# AI Chess Tutor: eine gemeinsame Codebasis für macOS, Windows und Linux

Stand: 21. September 2026

## Umgesetzter Stand

Die Anwendung verwendet für alle drei Systeme denselben Electron-/React-/TypeScript-
Quellcode. Oberfläche, Spiellogik, Tutor, PGN, Bibliothek und Chessnut-Protokoll bleiben
in einer gemeinsamen Implementierung. Es gibt genau ein Setup-Skript je Betriebssystem;
die eigentliche Setup-, Engine- und Buildlogik liegt gemeinsam in `scripts/`.

| Zielsystem | Architektur | Setup | Installationspaket |
| --- | --- | --- | --- |
| macOS mit Apple Silicon | arm64 | `setup-macos.sh` | DMG |
| Windows 11 | x64 | `setup-windows.ps1` | NSIS-Setup-EXE |
| Ubuntu 24.04 LTS Desktop | x64 | `setup-linux.sh` | DEB und AppImage |

Diese Ziele sind konfiguriert. **Lokal verifiziert ist bislang macOS arm64.**
Windows- und Linux-Builds sowie ihre Starttests sind in der CI eingerichtet, wurden
in dieser Sitzung aber nicht ausgeführt. Ein Windows-/Linux-System steht hier nicht
zur Verfügung. Chessnut muss zusätzlich mit echter Hardware auf jedem Zielsystem
geprüft werden. Weitere Architekturen werden derzeit ausdrücklich abgewiesen.

Gemeinsame Source bedeutet: Derselbe Checkout erzeugt auf dem jeweiligen System
sein natives Paket. Electron und die Engines bleiben native Binärdateien. Ein
Cross-Build vom Mac für Windows/Linux ist im gemeinsamen Distributionsbefehl
bewusst nicht vorgesehen.

## Einmaliges Setup aus einem frischen Checkout

Voraussetzung ist **Node.js ab 22.12** in der nativen Zielarchitektur und ein
entpackter oder mit Git ausgecheckter Projektordner. Für Setup und Paketierung ist
Internetzugang erforderlich. Endnutzer fertiger Pakete brauchen weder Node noch
Compiler oder separat installierte Engines.

### macOS

Homebrew muss bereits verfügbar sein. Im Projektordner:

```bash
bash setup-macos.sh
```

Das Skript installiert bei Bedarf lc0 mit Homebrew und startet das gemeinsame Setup.
Die gebündelte Version ist auf lc0 0.32.1 festgelegt. Eine abweichende installierte
Version wird mit einer Fehlermeldung abgewiesen; Versionswechsel werden zentral und
mit erneutem Engine-Test vorgenommen. Das gepackte lc0 benötigt auf dem Zielrechner
kein Homebrew: Das Setup prüft seine Verknüpfung mit macOS-Systembibliotheken.

### Windows

In PowerShell im Projektordner:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-windows.ps1
```

Die Ausführungsrichtlinie wird damit nur für diesen PowerShell-Aufruf gesetzt.
Stockfish, die CPU-Version von lc0 und deren DLLs werden automatisch bereitgestellt.
Eine CUDA-Installation oder eine bestimmte Grafikkarte ist dafür nicht erforderlich.
Zusätzlich benötigt lc0 die Microsoft-C++-Laufzeit. Dasselbe Windows-Setup-Skript
prüft sie auch beim Installieren des fertigen Pakets und lädt sie bei Bedarf direkt
von Microsoft (Version 14.44.35211.0, mit festem Download und SHA-256-Prüfung).
Für diesen Schritt sind Internetzugang und die Windows-Administratorbestätigung
nötig. Eine bereits ausreichende Version wird weiterverwendet. Falls Microsoft
einen Neustart verlangt, Windows neu starten und das Entwicklungssetup wiederholen.
Der Installer markiert einen erforderlichen Neustart entsprechend.

### Linux

Unter Ubuntu 24.04 Desktop im Projektordner:

```bash
bash setup-linux.sh
```

Das Skript installiert mittels `sudo apt-get` Compiler, Meson/Ninja, Eigen und zlib
sowie die benötigten Desktop-, Schlüsselbund- und Bluetooth-Pakete. Danach wird lc0
0.32.1 einschließlich seiner Submodule aus dem Quellcode mit dem Eigen-CPU-Backend
gebaut. Der erste Durchlauf dauert dadurch länger. Die App selbst läuft als normaler
Benutzer. Ein Schlüsselbund muss in der Desktop-Sitzung auch verfügbar und entsperrt
sein; die Installation des Pakets allein genügt dafür nicht.

Andere Linux-Distributionen sind noch kein geprüftes Setupziel. Wer die entsprechenden
System- und Buildabhängigkeiten selbst bereitstellt, kann `npm run setup` verwenden;
die gemeinsame Anwendungssource braucht dafür keine Änderungen. Laufzeit- und
Paketkompatibilität sind dann gesondert zu prüfen.

Alle drei Einstiegsskripte rufen `scripts/setup.mjs` auf. Dieses führt `npm ci` aus,
stellt die Engines und alle neun Maia-Netze bereit und prüft Stockfish sowie
lc0 mit Maia 1200 über einen echten UCI-Suchlauf.

## Dieselben Befehle auf allen drei Systemen

```bash
npm run dev                  # Entwicklung mit HMR
npm run typecheck            # TypeScript prüfen
npm test                     # Gemeinsame Regressionstests
npm run build                # Produktionsbuild nach out/
npm run verify-engines       # Stockfish und Maia tatsächlich rechnen lassen
npm run smoke                # Gebaute Electron-App mit isoliertem Testprofil starten
npm run dist                 # Native Installer nach dist/
npm run smoke -- --packaged  # Gepackte Anwendung starten und prüfen
```

`npm run dist -- --dir` erstellt nur das entpackte Anwendungspaket. Der normale
Distributionsbefehl beschafft fehlende Engines, prüft sie, baut die Anwendung und
wählt das zur laufenden Plattform passende electron-builder-Ziel. Für Endnutzer
sind Engine-Dateien und Maia-Gewichte im Installer enthalten.

Auf einem Linux-Testserver brauchen die grafischen Tests eine Sitzung, beispielsweise
über `xvfb-run`. Der CI-Test installiert das DEB vor dem Start, damit auch die
Paketinstallation und ihre Sandbox-Einrichtung geprüft werden. Mit
`CHESS_SMOKE_EXECUTABLE=/usr/bin/ai-chess-tutor` verwendet der Paket-Starttest die
installierte Anwendung. Das AppImage wird zusätzlich gebaut; ein eigener
AppImage-Lauf ist noch offen.

## Zentrale Plattformanpassungen

- [src/shared/platform.mjs](src/shared/platform.mjs) definiert Zielarchitektur,
  Ressourcenordner, Engine-Endung und Paketierungsziel gemeinsam für Setup und App.
- [src/main/platform.ts](src/main/platform.ts) sucht zuerst die mitgelieferten
  Engines, anschließend bekannte Systemverzeichnisse und `PATH`. Windows-Pfade,
  Leerzeichen, Anführungszeichen und `.exe` werden berücksichtigt.
- [src/shared/paths.ts](src/shared/paths.ts) verarbeitet Windows-, UNC- und POSIX-
  Dateipfade für die Einstellungen. Dateidialoge bleiben native Electron-Dialoge.
- [scripts/engine-sources.mjs](scripts/engine-sources.mjs) hält Versionen und
  Downloadadressen zentral. Stockfish 19 und das Windows-lc0-Archiv werden beim
  Download gegen feste SHA-256-Werte geprüft. Downloads werden atomar übernommen.
- [scripts/fetch-engines.mjs](scripts/fetch-engines.mjs) legt die Dateien unter
  `resources/engines/mac-arm64`, `win-x64` beziehungsweise `linux-x64` ab.
  Windows-lc0 enthält auch OpenBLAS und beide mimalloc-DLLs. Linux-lc0 wird mit
  CPU-Einstellungen gebaut, die nicht auf den Build-Rechner optimiert sind.
- Maia verwendet auf allen Plattformen dieselben neun Netze von 1100 bis 1900.
  Vorhandene Netze werden auf gültiges gzip-Format geprüft; für diese Dateien
  sind derzeit keine SHA-256-Werte festgeschrieben.
- [package.json](package.json) bündelt nur die zum Ziel passenden Ressourcen
  außerhalb von `app.asar`. Lizenzen, Quellenhinweise und bei Linux-lc0 ein
  Quellarchiv werden mitgeführt. Windows- und Linux-Icons stammen aus dem
  gemeinsamen PNG; das bestehende macOS-Icon bleibt eingerichtet.
- [build/installer.nsh](build/installer.nsh) ruft für die Windows-C++-Laufzeit
  dasselbe `setup-windows.ps1` mit `-RuntimeOnly` auf. Es gibt keinen zweiten
  Windows-Setupablauf und keine Kopie des Microsoft-Installers im App-Paket.
- Der Teststarter übergibt Dateinamen unabhängig von der Shell. Fake-UCI-Engines
  starten ausdrücklich über Node; die Browsererkennung unterstützt auch Windows.

## Chessnut und Bluetooth

Die bestehende Geräteauswahl und das Chessnut-Protokoll werden weiter gemeinsam
verwendet. macOS erhält die Bluetooth-Nutzungsbeschreibung im App-Bundle und
verwendet die systemeigene Kopplung.

Unter Windows und Linux ist ein Pairing-Handler mit Bestätigung beziehungsweise
PIN-Eingabe integriert. Er verwirft Antworten anderer Fenster oder alter Anfragen
und beendet offene Kopplungen bei Abbruch, Fensterende oder nach zwei Minuten.
Unter Linux aktiviert der Main-Prozess zusätzlich die von Chromium benötigten
experimentellen Web-Plattform-Funktionen.

Ein funktionierender Bluetooth-LE-Adapter, die OS-Berechtigungen und unter Linux
BlueZ bleiben Voraussetzungen. Gerätesuche, Wiederverbindung, Stellungsmeldungen,
LEDs, Zugvorschläge, Signalton und Batterieabfrage benötigen echte Bretttests.
Simulierte Pairing- und Protokolltests ersetzen diese Hardwareabnahme nicht.

Quellen: [Electron-Gerätezugriff](https://www.electronjs.org/docs/latest/tutorial/devices),
[Chromium Web Bluetooth](https://developer.chrome.com/docs/capabilities/bluetooth).

## API-Schlüssel und Benutzerdaten

API-Schlüssel verwenden weiterhin Electron `safeStorage`: macOS-Schlüsselbund,
Windows-DPAPI beziehungsweise unter Linux GNOME Keyring oder KWallet. Auf Linux
werden `basic_text` und unbekannte Backends ausdrücklich nicht für die dauerhafte
Schlüsselablage akzeptiert. Ohne sicheren Speicher funktioniert ein neu eingegebener
Key nur während der laufenden Sitzung; die Einstellungen zeigen dies an. Ein dabei
ersetzter alter Schlüssel wird aus der gespeicherten Konfiguration entfernt.

Verschlüsselte Schlüssel sind nicht als plattformübergreifend kopierbare Einstellungen
gedacht und werden auf einem anderen System neu eingegeben. Bibliothek und
Konfiguration verwenden weiterhin Electrons Benutzerverzeichnis. Automatische
Starttests verwenden ein temporäres Profil und keine vorhandenen API-Schlüssel.

Quelle: [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

## Automatisierung und Abnahme

[.github/workflows/platforms.yml](.github/workflows/platforms.yml) prüft denselben
Commit auf `macos-15` (arm64), `windows-2022` (x64) und `ubuntu-24.04` (x64).
Die Jobs führen Setup, Typecheck, Tests, Build, Paketierung und den Electron-Starttest
aus; unter Windows wird zuvor die NSIS-EXE installiert, unter Linux das DEB.
Danach werden die Installer als CI-Artefakte gespeichert. Der Windows-Runner
prüft Windows Server 2022; ein separater Windows-11-Desktoptest bleibt erforderlich.

Ein Tag im Format `vX.Y.Z`, das exakt der `version` in [package.json](package.json)
entspricht (aktuell `0.1.0`, also Tag `v0.1.0`), löst zusätzlich den `release`-Job aus:
Er wartet auf alle drei erfolgreichen Matrix-Läufe, lädt deren Installer-Artefakte
zusammen und legt daraus einen **Draft**-GitHub-Release mit allen vier Dateien (DMG,
NSIS-EXE, DEB, AppImage) an. Bewusst als Entwurf statt sofort veröffentlicht: Der
Release-Text warnt zwar bereits vor der fehlenden Code-Signierung/Notarisierung
(siehe unten), ein Mensch soll den Entwurf aber vor der Veröffentlichung trotzdem
sichten. Ein Tag mit abweichender Version bricht den Job kontrolliert ab, bevor ein
Release entsteht.

In dieser Sitzung erfolgreich auf macOS arm64 geprüft:

- 51 Tests, ohne Fehler oder übersprungene Tests; darunter Pfade, Schlüsselablage,
  UCI-/PGN-/React-Regressionen und Pairing-Lebenszyklus für Windows/Linux.
- Typecheck und Produktionsbuild.
- Echte UCI-Suchläufe mit Stockfish 19 und lc0/Maia 1200.
- Vollständige macOS-Paketierung als DMG und Start der gepackten Anwendung,
  einschließlich Pairing-Abbruch und PIN-Eingabe über Renderer und Preload.

Noch offen sind die tatsächlichen Windows-/Linux-CI-Läufe, die Installation auf
sauberen Zielsystemen, der Linux-AppImage-Lauf und die manuelle Desktop-/Chessnut-
Abnahme. Dabei auch PGN-/Bibliotheksdateien mit Leerzeichen und Umlauten, Sound,
Skalierung, Schlüsselbund-Neustart und unter Linux X11/Wayland prüfen.

Die erzeugten Pakete haben derzeit keine eingerichtete Release-Signierung oder
macOS-Notarisierung. Der Quellcode ist für die drei Ziele vorbereitet; die vollständige
Freigabe aller drei Plattformen setzt die noch offenen nativen Tests voraus.

Quelle zur Windows-Laufzeit: [Microsoft Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist).
