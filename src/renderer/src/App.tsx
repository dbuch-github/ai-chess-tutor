import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './components/Board'
import { EvalBar } from './components/EvalBar'
import { AnalysisPanel } from './components/AnalysisPanel'
import { MoveList } from './components/MoveList'
import { SettingsDialog } from './components/SettingsDialog'
import { InfoDialog } from './components/InfoDialog'
import { TopbarDropdown } from './components/TopbarDropdown'
import { BoardIcon, BooksIcon, CameraIcon, ChartIcon, ExportIcon, FolderIcon, GearIcon, ImportIcon, KingIcon, ReportIcon } from './components/icons'
import { CapturedRow, PIECE_VALUES } from './components/CapturedRow'
import { TutorPanel } from './components/TutorPanel'
import { GameReportDialog } from './components/GameReportDialog'
import { GameLibraryDialog } from './components/GameLibraryDialog'
import { ChessnutPanel } from './components/ChessnutPanel'
import { BluetoothDevicePicker } from './components/BluetoothDevicePicker'
import { useGame, type CapturablePiece } from './game/useGame'
import { useTutor } from './game/useTutor'
import { useBoardPreview } from './game/useBoardPreview'
import { useGameReport } from './game/useGameReport'
import { useGameLibrary } from './game/useGameLibrary'
import { useChessClock, formatClockMs } from './game/useClock'
import { useMoveSound } from './game/useMoveSound'
import { useChessnutBoard } from './chessnut/useChessnutBoard'
import { useChessnutSync } from './chessnut/useChessnutSync'
import { useChessnutPreview } from './chessnut/useChessnutPreview'
import { useChessnutBestMove } from './chessnut/useChessnutBestMove'
import { useChessnutSignals } from './chessnut/useChessnutSignals'
import { useChessnutThreatPreview } from './chessnut/useChessnutThreatPreview'
import { computeCriticalMoments, computeReportStats } from './game/gameReport'
import { detectOpening } from './game/openingBook'
import { buildPgn, suggestedPgnFilename } from './game/pgn'
import { MIN_CLASSIFY_DEPTH } from './game/classify'
import { loadSettings, saveSettings, TUTOR_MODEL_KEY, type AppSettings, type TutorMode } from './settings'
import type { BluetoothDeviceInfo } from '../../shared/types'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

type EngineStatus = { ready: boolean; name?: string; error?: string }

export function App(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [opponentStatus, setOpponentStatus] = useState<EngineStatus>({ ready: false })
  const [analysisStatus, setAnalysisStatus] = useState<EngineStatus>({ ready: false })
  const [showInfo, setShowInfo] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [pgnNotice, setPgnNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [bluetoothDevices, setBluetoothDevices] = useState<BluetoothDeviceInfo[] | null>(null)
  const configureSeq = useRef(0)

  useEffect(() => window.api.onBluetoothDeviceList(setBluetoothDevices), [])

  const game = useGame(opponentStatus.ready, settings.useOpeningBook)
  const boardPreview = useBoardPreview(game.fen)
  const tutor = useTutor(game, settings.tutorMode, boardPreview)
  const gameReport = useGameReport(game, tutor.status?.hasApiKey ?? false)
  const library = useGameLibrary(game, opponentStatus.name ?? 'Engine')
  const clock = useChessClock(game, {
    mode: settings.clockMode,
    baseMinutes: settings.clockBaseMinutes,
    incrementSeconds: settings.clockIncrementSeconds
  })
  useMoveSound(game, settings.moveSoundEnabled)
  const chessnut = useChessnutBoard()
  const chessnutSync = useChessnutSync(game, chessnut)
  useChessnutPreview(chessnut, boardPreview, chessnutSync)
  useChessnutBestMove(game, chessnut, chessnutSync, boardPreview, settings.chessnutBestMoveBlink)
  useChessnutSignals(game, chessnut, chessnutSync, settings.chessnutBeepEnabled)
  const chessnutThreatPreview = useChessnutThreatPreview(game, chessnut, chessnutSync)

  const applyEngineSettings = useCallback(async (s: AppSettings) => {
    const seq = ++configureSeq.current
    setOpponentStatus({ ready: false })
    setAnalysisStatus({ ready: false })

    // Stockfish wird immer für die Analyse gebraucht; für den Gegner hängt
    // das Standard-Binary von der gewählten Engine-Art ab (bei "eigener Pfad"
    // gibt es keine Auto-Erkennung).
    const opponentBinary = s.engineKind === 'maia' ? 'lc0' : 'stockfish'
    const [stockfishDefault, opponentDefault] =
      s.engineKind === 'custom'
        ? [await window.api.getDefaultEnginePath('stockfish'), '']
        : await Promise.all([
            window.api.getDefaultEnginePath('stockfish'),
            window.api.getDefaultEnginePath(opponentBinary)
          ])
    const opponentPath = s.opponentPath || opponentDefault || ''
    const analysisPath = s.analysisPath || stockfishDefault || ''
    const weightsPath =
      s.engineKind === 'maia' && !s.weightsPath ? await window.api.getDefaultMaiaWeightsPath() : s.weightsPath
    if (configureSeq.current !== seq) return

    if (!opponentPath) {
      setOpponentStatus({
        ready: false,
        error:
          s.engineKind === 'maia'
            ? 'Kein lc0 gefunden – Pfad in den Einstellungen setzen'
            : 'Keine Engine gefunden – Pfad in den Einstellungen setzen'
      })
    }
    if (!analysisPath) {
      setAnalysisStatus({ ready: false, error: 'Kein Stockfish gefunden' })
    }
    if (!opponentPath || !analysisPath) return

    const [opp, ana] = await Promise.all([
      window.api.configureOpponent({
        kind: s.engineKind,
        enginePath: opponentPath,
        weightsPath: s.engineKind === 'maia' ? weightsPath : undefined,
        limitStrength: s.limitStrength,
        elo: s.elo,
        moveTimeMs: s.moveTimeMs
      }),
      window.api.configureAnalysis({
        enginePath: analysisPath,
        multiPv: 3,
        threads: 2,
        hashMb: 128
      })
    ])
    if (configureSeq.current !== seq) return
    setOpponentStatus(opp.ok ? { ready: true, name: opp.engineName } : { ready: false, error: opp.error })
    setAnalysisStatus(ana.ok ? { ready: true, name: ana.engineName } : { ready: false, error: ana.error })
  }, [])

  useEffect(() => {
    applyEngineSettings(settings)
    // Initial configuration only – changes go through the settings dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSaveSettings = (next: AppSettings, apiKeyChange?: string): void => {
    setSettings(next)
    saveSettings(next)
    setShowSettings(false)
    applyEngineSettings(next)
    window.api
      .configureTutor({
        provider: next.tutorProvider,
        model: next[TUTOR_MODEL_KEY[next.tutorProvider]] as string,
        apiKey: apiKeyChange
      })
      .then(() => tutor.refreshStatus())
  }

  const toggleAnalysis = (): void => {
    const next = { ...settings, showAnalysis: !settings.showAnalysis }
    setSettings(next)
    saveSettings(next)
  }

  const toggleChessnutBestMoveBlink = (): void => {
    const next = { ...settings, chessnutBestMoveBlink: !settings.chessnutBestMoveBlink }
    setSettings(next)
    saveSettings(next)
  }

  const toggleChessnutBeep = (): void => {
    const next = { ...settings, chessnutBeepEnabled: !settings.chessnutBeepEnabled }
    setSettings(next)
    saveSettings(next)
  }

  const setTutorMode = (mode: TutorMode): void => {
    const next = { ...settings, tutorMode: mode }
    setSettings(next)
    saveSettings(next)
  }

  const startNewGame = (color: 'w' | 'b'): void => {
    tutor.clear() // räumt auch die Board-Preview auf
    gameReport.clear()
    game.newGame(color)
  }

  const startOtbGame = (): void => {
    tutor.clear()
    gameReport.clear()
    game.startTwoPlayerGame()
  }

  const showPgnNotice = (ok: boolean, text: string): void => {
    setPgnNotice({ ok, text })
    window.setTimeout(() => setPgnNotice((n) => (n?.text === text ? null : n)), 5000)
  }

  const handleExportPgn = async (): Promise<void> => {
    const pgn = buildPgn(game.moves, {
      initialFen: game.initialFen,
      initialComment: game.initialComment,
      outcome: game.outcome,
      playerColor: game.playerColor,
      opponentName: opponentStatus.name ?? 'Engine',
      startedAt: game.startedAt,
      twoPlayerMode: game.twoPlayerMode
    })
    const result = await window.api.exportPgn(pgn, suggestedPgnFilename(game.startedAt))
    if (result.ok && result.path) showPgnNotice(true, `Gespeichert: ${result.path}`)
    else if (result.error) showPgnNotice(false, `Speichern fehlgeschlagen: ${result.error}`)
    // Abbruch durch den Nutzer im Dialog: kein Hinweis nötig
  }

  const handleImportPgn = async (): Promise<void> => {
    const result = await window.api.importPgn()
    if (!result.ok) {
      if (result.error) showPgnNotice(false, `Import fehlgeschlagen: ${result.error}`)
      return
    }
    const success = game.importGame(result.pgn ?? '')
    if (success) {
      tutor.clear()
      gameReport.clear()
      showPgnNotice(true, 'Partie importiert – Ansicht, Analyse und Tutor stehen bereit.')
    } else {
      showPgnNotice(false, 'Die Datei enthält kein gültiges PGN.')
    }
  }

  const handleOpenLibraryGame = async (path: string): Promise<void> => {
    const pgn = await library.load(path)
    if (!pgn) {
      showPgnNotice(false, 'Partie konnte nicht geladen werden.')
      return
    }
    const success = game.importGame(pgn)
    if (success) {
      tutor.clear()
      gameReport.clear()
      setShowLibrary(false)
      showPgnNotice(true, 'Partie aus der Bibliothek geladen – Ansicht, Analyse und Tutor stehen bereit.')
    } else {
      showPgnNotice(false, 'Die gespeicherte Datei enthält kein gültiges PGN.')
    }
  }

  const { capturedByWhite, capturedByBlack, materialWhite } = useMemo(() => {
    const byWhite: CapturablePiece[] = []
    const byBlack: CapturablePiece[] = []
    for (const move of game.moves) {
      if (!move.captured) continue
      ;(move.color === 'w' ? byWhite : byBlack).push(move.captured)
    }
    const value = (pieces: CapturablePiece[]): number =>
      pieces.reduce((sum, p) => sum + PIECE_VALUES[p], 0)
    return {
      capturedByWhite: byWhite,
      capturedByBlack: byBlack,
      materialWhite: value(byWhite) - value(byBlack)
    }
  }, [game.moves])

  const bottomColor = game.playerColor
  const topColor = bottomColor === 'w' ? 'b' : 'w'
  const capturedBy = (color: 'w' | 'b'): CapturablePiece[] =>
    color === 'w' ? capturedByWhite : capturedByBlack
  const leadOf = (color: 'w' | 'b'): number =>
    color === 'w' ? materialWhite : -materialWhite
  const clockFor = (color: 'w' | 'b'): { label: string; running: boolean; low: boolean } | undefined =>
    clock.enabled
      ? {
          label: formatClockMs(clock.remainingMs[color]),
          running: clock.running === color,
          low: clock.remainingMs[color] < 20_000
        }
      : undefined

  const rankLabels = bottomColor === 'w' ? RANKS : [...RANKS].reverse()
  const fileLabels = bottomColor === 'w' ? FILES : [...FILES].reverse()

  const reportStats = useMemo(
    () => computeReportStats(game.moves, game.playerColor, game.twoPlayerMode),
    [game.moves, game.playerColor, game.twoPlayerMode]
  )
  const criticalMoments = useMemo(
    () => computeCriticalMoments(game.moves, game.playerColor, game.twoPlayerMode),
    [game.moves, game.playerColor, game.twoPlayerMode]
  )

  const opening = useMemo(() => game.initialFen === new Chess().fen()
    ? detectOpening(game.moves.map((m) => m.san)) : null, [game.moves, game.initialFen])

  const currentLine = game.getEval(game.fen)
  const canSuggest =
    !game.result &&
    !game.thinking &&
    game.turn === game.playerColor &&
    !!currentLine &&
    currentLine.depth >= MIN_CLASSIFY_DEPTH

  const colorNames = { w: 'Weiß', b: 'Schwarz' } as const
  const statusText = game.result
    ? game.result
    : game.thinking
      ? 'Engine denkt …'
      : `${colorNames[game.turn]} am Zug${!game.twoPlayerMode && game.turn === game.playerColor ? ' – du' : ''}`

  return (
    <div className="app">
      <header className="topbar">
        <h1>AI Chess Tutor</h1>
        <div className="topbar-status">
          {game.twoPlayerMode ? (
            <>
              <span className={`engine-dot ${analysisStatus.ready ? 'ok' : 'err'}`} />
              <span className="engine-name">
                {analysisStatus.ready
                  ? `Live-Analyse: ${analysisStatus.name}`
                  : (analysisStatus.error ?? 'Analyse startet …')}
              </span>
            </>
          ) : (
            <>
              <span className={`engine-dot ${opponentStatus.ready ? 'ok' : 'err'}`} />
              <span className="engine-name">
                {opponentStatus.ready
                  ? `Gegner: ${opponentStatus.name}${
                      settings.engineKind === 'maia'
                        ? ' (Maia)'
                        : settings.limitStrength
                          ? ` (Elo ${settings.elo})`
                          : ''
                    }`
                  : (opponentStatus.error ?? 'Engine startet …')}
              </span>
            </>
          )}
        </div>
        <div className="topbar-actions">
          <TopbarDropdown
            label={
              <>
                <BoardIcon /> Neue Partie
              </>
            }
          >
            <button className="menu-item" onClick={() => startNewGame('w')}>
              <span className="menu-item-label">
                <KingIcon color="w" /> Als Weiß spielen
              </span>
            </button>
            <button className="menu-item" onClick={() => startNewGame('b')}>
              <span className="menu-item-label">
                <KingIcon color="b" /> Als Schwarz spielen
              </span>
            </button>
            <div className="menu-sep" />
            <button className="menu-item" onClick={startOtbGame}>
              <span className="menu-item-label">
                <CameraIcon /> OTB-Partie aufzeichnen
              </span>
              <span className="menu-item-cap">
                Zwei Personen am physischen Brett, kein Engine-Zug – Live-Analyse und Report laufen wie gewohnt
              </span>
            </button>
          </TopbarDropdown>
          <TopbarDropdown
            label={
              <>
                <FolderIcon /> Datei
              </>
            }
          >
            <button className="menu-item" onClick={handleExportPgn} disabled={game.moves.length === 0}>
              <span className="menu-item-label">
                <ExportIcon /> PGN exportieren
              </span>
            </button>
            <button className="menu-item" onClick={handleImportPgn}>
              <span className="menu-item-label">
                <ImportIcon /> PGN importieren
              </span>
            </button>
            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={() => {
                library.refresh()
                setShowLibrary(true)
              }}
            >
              <span className="menu-item-label">
                <BooksIcon /> Bibliothek
              </span>
            </button>
          </TopbarDropdown>
          <button
            className={`btn ${settings.showAnalysis ? 'pressed' : ''}`}
            onClick={toggleAnalysis}
            aria-pressed={settings.showAnalysis}
          >
            <ChartIcon /> Analyse
          </button>
          <button
            className="btn"
            onClick={() => setShowReport(true)}
            disabled={game.moves.length < 2}
            title="Zusammenfassung der Partie mit Fehlermustern und Lernpunkten"
          >
            <ReportIcon /> Partie-Report
          </button>
          <button className="btn btn-settings" onClick={() => setShowSettings(true)} aria-label="Einstellungen">
            <GearIcon />
          </button>
        </div>
      </header>

      <main className="layout">
        <div className="board-area">
          <div className="board-frame">
            {settings.showAnalysis && (
              <div className="eval-area">
                <EvalBar snapshot={game.snapshot} currentFen={game.fen} />
              </div>
            )}
            <div className="rank-labels">
              {rankLabels.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </div>
            <CapturedRow
              position="top"
              pieces={capturedBy(topColor)}
              pieceColor={bottomColor === 'w' ? 'white' : 'black'}
              lead={leadOf(topColor)}
              clock={clockFor(topColor)}
            />
            <div className="board-wrap">
              <Board
                fen={game.fen}
                orientation={game.playerColor === 'w' ? 'white' : 'black'}
                turnColor={game.turn === 'w' ? 'white' : 'black'}
                lastMove={game.lastMove}
                check={game.inCheck}
                movableColor={
                  game.result || game.reviewMode || chessnut.status === 'connected'
                    ? undefined
                    : game.twoPlayerMode
                      ? // Kein physisches Brett verbunden – Zug-und-Herzug für beide Seiten auf dem Bildschirm.
                        'both'
                      : game.turn !== game.playerColor
                        ? undefined
                        : game.playerColor === 'w'
                          ? 'white'
                          : 'black'
                }
                dests={game.legalDests}
                onMove={game.makeUserMove}
                suggestion={boardPreview.active}
                threatPreview={chessnutThreatPreview}
              />
            </div>
            <div className="file-labels">
              {fileLabels.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
            <CapturedRow
              position="bottom"
              pieces={capturedBy(bottomColor)}
              pieceColor={topColor === 'w' ? 'white' : 'black'}
              lead={leadOf(bottomColor)}
              clock={clockFor(bottomColor)}
            />
            <ChessnutPanel
              chessnut={chessnut}
              sync={chessnutSync}
              bestMoveBlink={settings.chessnutBestMoveBlink}
              onToggleBestMoveBlink={toggleChessnutBestMoveBlink}
              bestMoveAvailable={!game.twoPlayerMode}
              beepEnabled={settings.chessnutBeepEnabled}
              onToggleBeep={toggleChessnutBeep}
            />
          </div>
        </div>

        <aside className="sidebar">
          {pgnNotice && <div className={`pgn-notice ${pgnNotice.ok ? 'ok' : 'error'}`}>{pgnNotice.text}</div>}
          {game.reviewMode ? (
            <div className="status-line review">
              <span>📂 Importierte Partie – Ansicht</span>
              <button className="btn" onClick={game.continuePlaying}>
                ▶ Weiterspielen
              </button>
            </div>
          ) : game.twoPlayerMode && !game.result ? (
            <div className="status-line otb">🔴 OTB-Aufzeichnung – {statusText}</div>
          ) : (
            <div className={`status-line ${game.result ? 'finished' : ''}`}>{statusText}</div>
          )}
          {opening && (
            <div className="opening-line" title={`${opening.matchedPlies} von ${game.moves.length} Halbzügen erkannt`}>
              📖 {opening.name} <span className="opening-eco">({opening.eco})</span>
            </div>
          )}
          {game.engineError && <div className="error-line">Engine-Fehler: {game.engineError}</div>}
          {settings.showAnalysis && (
            <>
              <AnalysisPanel snapshot={game.snapshot} currentFen={game.fen} boardPreview={boardPreview} />
              {!analysisStatus.ready && analysisStatus.error && (
                <div className="error-line">Analyse: {analysisStatus.error}</div>
              )}
            </>
          )}
          <TutorPanel
            tutor={tutor}
            boardPreview={boardPreview}
            mode={settings.tutorMode}
            canSuggest={canSuggest}
            onModeChange={setTutorMode}
            onOpenSettings={() => setShowSettings(true)}
            onUndo={game.undoMove}
            canUndo={game.canUndo && !game.thinking && !game.reviewMode}
            onRedo={game.redoMove}
            canRedo={game.canRedo && !game.thinking && !game.reviewMode}
          />
          <MoveList moves={game.moves} />
        </aside>
      </main>

      {showInfo && <InfoDialog onClose={() => setShowInfo(false)} />}

      {showSettings && (
        <SettingsDialog
          settings={settings}
          tutorStatus={tutor.status}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showReport && (
        <GameReportDialog
          stats={reportStats}
          criticalMoments={criticalMoments}
          report={gameReport}
          hasApiKey={tutor.status?.hasApiKey ?? false}
          twoPlayerMode={game.twoPlayerMode}
          playerColor={game.playerColor}
          onOpenSettings={() => {
            setShowReport(false)
            setShowSettings(true)
          }}
          onClose={() => setShowReport(false)}
        />
      )}

      {showLibrary && (
        <GameLibraryDialog
          library={library}
          onOpenGame={handleOpenLibraryGame}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {bluetoothDevices && (
        <BluetoothDevicePicker
          devices={bluetoothDevices}
          onSelect={(id) => {
            window.api.selectBluetoothDevice(id)
            setBluetoothDevices(null)
          }}
          onCancel={() => {
            window.api.selectBluetoothDevice('')
            setBluetoothDevices(null)
          }}
        />
      )}
    </div>
  )
}
