# AI Chess Tutor

[![License: GPL-3.0](https://img.shields.io/github/license/dbuch-github/ai-chess-tutor)](LICENSE)

*English | [Deutsch](README.de.md)*

Desktop app (Electron + TypeScript + React) that combines a Chessnut Air board, UCI
engines as opponents, live Stockfish analysis and an LLM chess tutor.

## Features

- **LLM chess tutor** (Anthropic/OpenAI/Google, freely selectable): explains moves,
  answers follow-up questions in a streamed chat, suggests moves and writes an end-of-game
  report with recurring mistake patterns and takeaways.
- **Live analysis:** Stockfish running in the background (MultiPV 3) with an eval bar and
  automatic move classification (blunder/mistake/inaccuracy/best move).
- **Opponent engines:** classic Stockfish with Elo limiting, or Maia (lc0) for human-like
  play, plus a weighted opening book and live opening recognition.
- **Chessnut Air via Web Bluetooth:** the physical board is the primary input device, with
  LED feedback after every move, correction hints on discrepancies, and blinking move
  suggestions.
- **PGN export/import:** including per-move tutor comments and — if a move was taken back
  and continued differently — the discarded continuation as a side variation.
- **Local game library:** every finished game is saved automatically as a PGN, no manual
  step required.
- **Chess clock** with tournament presets (classical/rapid/blitz/bullet) or free play
  without a time control.
- Figurine notation, board preview (attacks/defenses/pins/weak squares) and a synthesized
  move sound round out the experience.

## Setup and development

One shared codebase for **macOS arm64, Windows x64 and Linux x64**.
Developers need Node.js ≥ 22.12. Run the matching setup once in the project folder:

| System | Setup |
| --- | --- |
| macOS with Apple Silicon, Homebrew installed | `bash setup-macos.sh` |
| Windows 11, PowerShell | `powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-windows.ps1` |
| Ubuntu 24.04 LTS Desktop | `bash setup-linux.sh` |

The scripts install the project dependencies and provide Stockfish 19, lc0 0.32.1 and all
nine Maia networks. macOS gets lc0 from Homebrew, Windows uses the CPU release with its
DLLs, Linux builds the Eigen CPU backend. On Windows, setup and the installer also install
the Microsoft C++ runtime directly from Microsoft when needed, which requires internet
access and administrator rights.
After that, the same commands apply on all three systems:

```bash
npm run dev                    # Dev mode with HMR
npm run build                  # Production build into out/
npm run typecheck
npm test                       # Shared regression tests, including the browser test
npm run verify-engines         # Real UCI search runs with Stockfish and Maia
npm run smoke                  # Startup test of the built Electron app, isolated profile
```

The React tests look for Chrome/Chromium, or Edge on Windows. `CHROME_PATH` lets you point
at a specific browser executable. Without a browser, the browser test is skipped locally;
in CI, that counts as a failure. The tests need no LLM API keys and no connected Chessnut
board.

## Installer

```bash
npm run dist                   # Native installer under dist/
npm run dist -- --dir          # Unpacked application bundle only
npm run smoke -- --packaged    # Startup test of the packaged app
```

The same source produces a **DMG** (macOS), an **NSIS setup EXE** (Windows), or a **DEB and
AppImage** (Linux) on the respective build system. The matching platform and architecture
are detected automatically. The packages include engines, Maia networks and license files;
end users need no development environment.
In dev mode, the same local engine resources are recognized right after setup.

**Test status:** the macOS build, DMG and startup test have been verified successfully
locally. The shared [CI workflow](.github/workflows/platforms.yml) for all three systems is
set up; real Windows/Linux runs and Chessnut hardware tests are still outstanding. Release
signing and macOS notarization are not set up.

Details on prerequisites, implementation and open acceptance steps are in
[PLATTFORMEN.md](PLATTFORMEN.md) (German only).

## Structure

```
src/
  main/            Electron main process
    engine/        UciEngine (process wrapper) + EngineManager (opponent + analysis)
    tutor/         TutorService (orchestration) + providers/ (Anthropic, OpenAI, Google)
  preload/         IPC bridge (window.api)
  renderer/src/
    game/          useGame (game state), classify, openingBook, pgn (export/import)
    chessnut/      Web Bluetooth integration: protocol (byte encoding), inferMove
                   (move derivation), useChessnutBoard (connection), useChessnutSync
                   (LED feedback/correction hints), useChessnutPreview (blinking
                   LEDs for move suggestions), useChessnutBestMove (blinking best
                   analysis move, alternating from/to square)
    components/    Board, EvalBar, AnalysisPanel, MoveList, SettingsDialog
  shared/          shared IPC types
```

## LLM tutor

- **Provider** (⚙︎ → "LLM tutor" → provider): **Anthropic** (`@anthropic-ai/sdk`,
  default `claude-opus-5`), **OpenAI** (`openai` SDK, Responses API, default `gpt-5.1`),
  **Google** (`@google/genai`, default `gemini-3.1-pro`). Model freely configurable per
  provider. Each provider has its own model + API key; switching providers doesn't
  overwrite the others.
- **Architecture:** `TutorService` orchestrates provider-agnostically (prompt building,
  conversation history, trigger logic); `src/main/tutor/providers/*` translates into the
  respective SDK format. New providers only need another class implementing the
  `LlmProvider` interface.
- **API keys:** encrypted per provider via Electron `safeStorage` under
  `userData/tutor-config.json` (macOS Keychain, Windows DPAPI, Linux keyring). Without
  secure storage, a newly entered key is only available for the current session; the
  settings dialog indicates this. For Anthropic, `ANTHROPIC_API_KEY` from the environment
  is also used if no key is stored.
- **Trigger modes** (in the tutor panel): *Silent* (only on request), *Mistakes* (comments
  on your own mistakes/blunders), *Active* (also inaccuracies and engine slips).
- **Prompt principle:** the LLM never calculates itself — it receives the FEN, game history
  (SAN), Stockfish evaluations before/after the move, and the best engine line, all
  pre-formatted, and only explains didactically. Move comments run at low effort, responses
  are streamed.
- **Effort/reasoning:** for Anthropic, `output_config.effort` controls the depth of
  thinking; for OpenAI (reasoning models), `reasoning.effort` does — Google has no
  equivalent and it's ignored there.
- Anthropic refusal fallbacks (`fallbacks: "default"`, beta) are enabled; on a 400 error the
  service automatically retries without fallbacks.

## Opponent engine & openings

⚙︎ → "Opponent engine" offers three engine types:

- **Stockfish** (default): as before, with Elo limiting.
- **Maia** ([lc0](https://github.com/LeelaChessZero/lc0) +
  [Maia network](https://github.com/CSSLab/maia-chess)): plays human-like, since it's
  trained on millions of human games. Runs with `go nodes 1` (search disabled, pure network
  prediction) instead of thinking time — playing strength (1100–1900) lives in the chosen
  `.pb.gz` file, not in an Elo option; the packaged installer already includes lc0 and all
  nine strengths, selectable via the strength picker in settings (see "Installer" above).
  After the shared setup, lc0 and the weights are also automatically available in dev mode.
- **Other UCI engine:** free path, as before.

**Opening book** (checkbox, default on): for the first 10 full moves, the opponent plays
from a database of roughly 3,800 named openings
([lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)) instead of
always playing the engine's best move — weighted by frequency in the database. No more
matches → the engine takes over.

**Live opening recognition:** above the Stockfish analysis, "📖 Name (ECO code)" shows the
best-matching known opening for the moves played so far — it stays on the last known state
after leaving theory instead of disappearing.

## Chessnut Air

Connected via **Web Bluetooth** (runs directly in Chromium/Electron, no native Node module
like `noble` needed — so no recompiling on Electron updates).

- **"Connect"** in the Chessnut status line right below the board opens the Bluetooth device
  picker; if exactly one board is found, it connects automatically. Chromium remembers the
  permission per app, so afterwards the app reconnects quietly in the background on
  startup without asking again (where the browser supports that).
- **While connected, the on-screen board is a mirror only:** your own moves come exclusively
  from the physical board; the mouse is disabled to avoid a conflicting second input device.
- **LED feedback:** after every move (yours or the engine's), the affected squares light up
  until the physical position matches the target position again — for an opponent's move,
  that's the prompt to replay it by hand. The LEDs always show exactly the squares of the
  known last move, not the full observed discrepancy — so a single faulty RFID read on an
  unrelated square can't trigger wrong LEDs. The LED command is resent on every new position
  report from the board (roughly every 200ms), not just once right after the move — so a
  single lost write, or one colliding with an immediate follow-up action, self-corrects
  instead of leaving the LEDs permanently wrong.
- **Correction hints:** if the board deviates from the expected position (e.g. a mistake
  while replaying a move), the status line shows the affected squares as a text hint — only
  after the same discrepancy has been observed twice in a row, so a single faulty RFID
  reading doesn't immediately trigger a (false) report.
- **Also applies to "New game", PGN import and taking back a move:** not just after a single
  move, but after every position change, the app checks whether the physical board still
  matches. If the board is still mid-way through the old game after "New game", for example,
  the missing/extra squares light up and a new move is only recognized once the starting
  position has actually been set up. This also holds when the next move arrives immediately
  afterwards, before the board could be checked (e.g. "New game as Black", where the engine
  as White moves automatically right away) — then the LEDs keep showing the full discrepancy
  instead of just the two squares of the latest move, until the board actually matches.
- **Move suggestions blink on the board:** the tutor's "💡 Move suggestion" and any clicked
  analysis line — the same source that also draws the arrow on the on-screen board — also
  makes the affected squares blink on the physical board (500ms on/off; the hardware can't
  blink by itself, the software handles that). Steps back while a move still needs to be
  replayed physically.
- **Move detection:** instead of diffing individual squares, the full observed position is
  compared against every legal move from the current position (the simulated move must lead
  exactly to the observed position) — this covers captures, castling, en passant and
  promotion (including the chosen piece) without special cases. A candidate is only accepted
  after two consecutive matching reads, as protection against a single faulty RFID read.
- **Best analysis move as blinking (optional):** while it's the player's turn, the best move
  from the ongoing Stockfish analysis blinks on the board — from-square and to-square
  alternating (500ms each), never simultaneously. Toggleable via the "Best move" switch in
  the Chessnut status line (default: on), persisted like the other settings. Only an analysis
  of the current position from depth 10 onward is shown (otherwise a different candidate
  would flash at every depth jump); it steps back while a move still needs to be replayed
  physically or a clicked move preview is blinking.
  **Why alternating (a hardware quirk of the board):** the Chessnut Air's LED matrix is
  multiplexed — if squares in multiple rows *and* multiple files light up at the same time,
  the remaining intersections of active rows with active files also glow faintly and
  flicker as "ghost LEDs" that were never actually addressed (example: knight g1 →
  e2/f3/h3: e1, g3, h1 also glow; verified frame by frame via video; the protocol only knows
  on/off per square, there's no brightness control). A single square is always ghost-free.
  For the same reason, an earlier feature was removed that showed all legal target squares
  when a piece was lifted: too many squares at once for major pieces (ghosts), too unsettled
  as a row-by-row chaser light. Additionally, `setLeds` doesn't resend an unchanged pattern
  to the board at all (comparing against the last pattern actually sent), so the ~200ms board
  reports don't trigger redundant writes. The write itself, where possible, runs "without
  response" (`writeValueWithoutResponse`) instead of with a confirmation round-trip, as in the
  community reference implementation
  ([paulvonallwoerden/chessnut-air](https://github.com/paulvonallwoerden/chessnut-air)) —
  faster, and it closes the (small) window in which two nearly simultaneous writes with the
  same pattern could otherwise overlap (the last pattern sent is remembered before the actual
  write, not only afterward).
- **Protocol:** two BLE GATT services (position transmission + write/acknowledgment), a
  32-byte position packet (2 squares per byte), LED command with one byte per row.
  Reverse-engineered by the community, verified here against the official protocol
  documentation "Chessnut chess board communications" by Graham O'Neill, as well as three
  independent open-source implementations
  ([paulvonallwoerden/chessnut-air](https://github.com/paulvonallwoerden/chessnut-air),
  [NSStudent/EasyLinkSwiftSDK](https://github.com/NSStudent/EasyLinkSwiftSDK),
  [Dash1971/chessnut-maia-cli](https://github.com/Dash1971/chessnut-maia-cli)) — all of them
  yield exactly the same constants.
- **Important note on test coverage:** the byte protocol (position decoding, LED encoding)
  and the move-derivation logic are verified in isolation against the official protocol
  examples and various scenarios (capture, castling, en passant, underpromotion,
  intermediate positions). Actually establishing a Bluetooth connection with a real board is
  **not** testable in this development environment (no Bluetooth hardware) and still needs
  verification with a real Chessnut Air.
- **Platform integration:** the Bluetooth usage description is set up in the macOS bundle.
  Windows and Linux share a pairing dialog for confirmation and PIN entry. On Linux, Web
  Bluetooth is additionally enabled in the main process; BlueZ and a working Bluetooth LE
  adapter are assumed. Details and still-open hardware tests are in
  [PLATTFORMEN.md](PLATTFORMEN.md) (German only).

## Game report

"Game report" in the header (active from move 2 onward) opens a dialog with purely
locally-computed statistics (blunders/mistakes/inaccuracies/best moves, each for your own
moves) and up to four of your most serious mistakes as "critical moments" — both without any
LLM call. "Create report" sends this to the tutor (`effort: high`, up to 4000 tokens) for a
streamed summary: recurring mistake patterns, the most critical moments explained, 2–3
concrete takeaways.

## PGN export & import

- **"Export PGN"** (header → "File", active from move 1 onward): writes the current game,
  including headers (date, player/engine name, result including timeout), to disk via a
  native save dialog. The tutor's move comments end up as PGN comments on the respective
  move; if a move was taken back and later continued differently, the discarded continuation
  is kept as a bracketed variation.
- **"Import PGN"** (header → "File"): also picks up FEN starting positions, move comments and
  stored results. Loads any PGN file (your own exports or from elsewhere, e.g.
  Lichess/Chess.com) and shows it in **review mode**: the board, move list, Stockfish
  analysis, opening recognition and tutor (move suggestion, follow-up questions, game report)
  all work normally on the imported game, but the board is read-only and the opponent doesn't
  move automatically.
- **"▶ Continue playing"** ends review mode — the game continues normally from the imported
  final position (whichever side is to move there becomes the player's color).

## Game library

- Every game actually played to completion (checkmate, stalemate, draw by rule, ...) is
  automatically saved as a PGN under `userData/games/<timestamp>.pgn` — no manual step
  required. Games imported in review mode do **not** trigger another save, not even when
  subsequently "continuing" an already-finished game.
- **"Library"** (header → "File") opens a list of all saved games (newest first) with date,
  players, result and half-move count.
- **"Open"** loads the game into review mode (like a PGN import); **"Delete"** permanently
  removes the file from disk.
- Deliberately not a full database feature (no search/filter/tags).

## Chess clock

⚙︎ → "Thinking time (chess clock)":

- **Free** (default): no time control, no clock badge shown.
- **Classical** (60 min + 30s), **Rapid** (15 min + 10s), **Blitz** (5 min + 3s), **Bullet**
  (1 min + 1s) — each category fills in a sensible base time/increment preset, both remain
  freely editable afterward (e.g. for a custom increment).
- Both clocks show up as a badge next to the respective captured-pieces bar, count down in
  real time for whichever side is to move (even while the engine is thinking), and turn
  red/pulsing under 20 seconds. The very first move of the game has unlimited thinking time —
  the clock stands still at the full base time until then and only starts with the first
  move played.
- The increment is credited to the moving side right after their move.
- If a clock runs out, the game ends immediately with "... wins on time" — regardless of the
  position's evaluation.
- "Save & apply" resets both clocks to the base time chosen there (like the other engine
  settings, this takes effect immediately, not only with the next game).

## Move sound

Every move played (your own move, engine response, redo) triggers a short "clack" (piece on
a wooden board) — purely synthesized via the Web Audio API (filtered noise burst + short
tone pulse), no audio file needed. Can be turned off via ⚙︎ → "Sound".

Notes:

- Two separate engine processes: opponent (configurable, optionally Elo-limited) and
  analysis (always Stockfish, `go infinite` with MultiPV 3 on the current position).
- Move classification via win-probability loss (Lichess formula): ≥30% blunder, ≥20%
  mistake, ≥10% inaccuracy; ★ = engine's best move. If the position changes before the
  minimum depth is reached, the depth reached so far is accepted as final (otherwise a very
  quickly played move would remain unclassified forever).
- Promotion is currently always to a queen (a promotion dialog is still pending).
- The browse dialogs for the lc0 binary and Maia weights file open by default in the last
  chosen or detected folder, instead of always starting in the home directory.

## License

AI Chess Tutor is free software under the **GNU General Public License v3.0 (or later)** —
Copyright © 2026 Daniel Buch. The full license text is in [LICENSE](./LICENSE); in short: you
may freely use, redistribute and modify the app, but any redistribution (including of
forks/derivative works) must again be under GPL-3.0 including source code. The app itself
also points to the license in the info overlay on startup.

### Third-party licenses

| Component | License | Integration |
| --- | --- | --- |
| [Stockfish](https://github.com/official-stockfish/Stockfish) | GPL-3.0 | bundled binary (own process, UCI) |
| [lc0](https://github.com/LeelaChessZero/lc0) | GPL-3.0 | bundled binary (own process, UCI) |
| [Maia weights](https://github.com/CSSLab/maia-chess) | GPL-3.0 | bundled network files (for lc0) |
| [chessground](https://github.com/lichess-org/chessground) | GPL-3.0-or-later | npm dependency, compiled into the bundle |
| [chess.js](https://github.com/jhlywa/chess.js) | BSD-2-Clause | npm dependency |
| React / React DOM | MIT | npm dependency |
| Electron | MIT | runtime environment |
| @anthropic-ai/sdk | MIT | npm dependency |
| openai | Apache-2.0 | npm dependency |
| @google/genai | Apache-2.0 | npm dependency |

When downloaded (`npm run fetch-engines`), Stockfish and lc0 bring their respective
`COPYING`/`LICENSE` file into `resources/engines/mac-arm64/` (not checked in, see
`.gitignore`) and are shipped in the installer as standalone binaries, not embedded in the
app code. chessground itself is GPL-3.0-or-later and is compiled directly into the JS
bundle — that alone makes GPL-3.0 the fitting (and necessary) choice for the overall work,
not just a preference.
