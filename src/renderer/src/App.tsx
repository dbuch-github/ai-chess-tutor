import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Board } from './components/Board'
import { EvalBar } from './components/EvalBar'
import { AnalysisPanel } from './components/AnalysisPanel'
import { MoveList } from './components/MoveList'
import { SettingsDialog } from './components/SettingsDialog'
import { InfoDialog } from './components/InfoDialog'
import { HelpDialog } from './components/HelpDialog'
import { TopbarDropdown } from './components/TopbarDropdown'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import {
  BoardIcon,
  BooksIcon,
  CameraIcon,
  ChartIcon,
  ExportIcon,
  FolderIcon,
  GearIcon,
  ImportIcon,
  InfoIcon,
  KingIcon,
  OpenBookIcon,
  QuestionIcon,
  ReportIcon,
  StatusRingIcon
} from './components/icons'
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
import { usePlayerRating } from './game/usePlayerRating'
import { clampElo, nearestLevel } from './game/rating'
import { useChessClock, formatClockMs } from './game/useClock'
import { useMoveSound } from './game/useMoveSound'
import { useChessnutBoard } from './chessnut/useChessnutBoard'
import { useChessnutSync } from './chessnut/useChessnutSync'
import { useChessnutPreview } from './chessnut/useChessnutPreview'
import { useChessnutBestMove } from './chessnut/useChessnutBestMove'
import { useChessnutSignals } from './chessnut/useChessnutSignals'
import { useChessnutThreatPreview } from './chessnut/useChessnutThreatPreview'
import { computeCriticalMoments, computeReportStats } from './game/gameReport'
import { detectOpening, previewContinuation } from './game/openingBook'
import { buildLinePreview } from './game/boardVisuals'
import { buildPgn, suggestedPgnFilename } from './game/pgn'
import { MIN_CLASSIFY_DEPTH } from './game/classify'
import {
  loadSettings,
  saveSettings,
  levelFromWeightsPath,
  MAIA_LEVELS,
  TUTOR_MODEL_KEY,
  type AppSettings,
  type TutorMode
} from './settings'
import type { BluetoothDeviceInfo } from '../../shared/types'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

type EngineStatus = { ready: boolean; name?: string; error?: string }

export function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [opponentStatus, setOpponentStatus] = useState<EngineStatus>({ ready: false })
  const [analysisStatus, setAnalysisStatus] = useState<EngineStatus>({ ready: false })
  const [showInfo, setShowInfo] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [pgnNotice, setPgnNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [bluetoothDevices, setBluetoothDevices] = useState<BluetoothDeviceInfo[] | null>(null)
  const configureSeq = useRef(0)
  /** Elo, mit der der Gegner für die gerade laufende Partie tatsächlich konfiguriert wurde
   *  (null = unbekannt, z. B. "custom"-Engine oder Stockfish ohne limitStrength) – separat
   *  von settings.elo gehalten, damit ein Settings-Wechsel mitten in der Partie das
   *  Rating-Update am Ende nicht verfälscht. */
  const activeOpponentEloRef = useRef<number | null>(null)

  useEffect(() => window.api.onBluetoothDeviceList(setBluetoothDevices), [])

  const game = useGame(opponentStatus.ready, settings.useOpeningBook)
  const boardPreview = useBoardPreview(game.fen)
  const tutor = useTutor(game, settings.tutorMode, boardPreview)
  const gameReport = useGameReport(game, tutor.status?.hasApiKey ?? false)
  const library = useGameLibrary(game, opponentStatus.name ?? t('common.engine'))
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
        error: s.engineKind === 'maia' ? t('app.noLc0Found') : t('app.noEngineFound')
      })
    }
    if (!analysisPath) {
      setAnalysisStatus({ ready: false, error: t('app.noStockfishFound') })
    }
    if (!opponentPath || !analysisPath) return

    // Bei aktiver Adaptivität die geschätzte eigene Elo statt der manuellen Felder
    // verwenden ("custom"-Engines haben keinen bekannten Stärkemechanismus, siehe Plan).
    const adaptive = s.adaptiveStrength && s.engineKind !== 'custom'
    const adaptiveMaiaLevel = adaptive && s.engineKind === 'maia' ? nearestLevel(s.estimatedElo, MAIA_LEVELS) : null
    const effectiveWeightsPath =
      adaptiveMaiaLevel != null ? await window.api.getDefaultMaiaWeightsPath(adaptiveMaiaLevel) : weightsPath
    const effectiveLimitStrength = adaptive && s.engineKind === 'stockfish' ? true : s.limitStrength
    const effectiveElo =
      adaptive && s.engineKind === 'stockfish'
        ? clampElo(Math.round(s.estimatedElo / 10) * 10, 1320, 3190)
        : s.elo
    activeOpponentEloRef.current =
      s.engineKind === 'maia'
        ? (adaptiveMaiaLevel ?? levelFromWeightsPath(effectiveWeightsPath))
        : s.engineKind === 'stockfish' && effectiveLimitStrength
          ? effectiveElo
          : null

    const [opp, ana] = await Promise.all([
      window.api.configureOpponent({
        kind: s.engineKind,
        enginePath: opponentPath,
        weightsPath: s.engineKind === 'maia' ? effectiveWeightsPath : undefined,
        limitStrength: effectiveLimitStrength,
        elo: effectiveElo,
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
  }, [t])

  useEffect(() => {
    applyEngineSettings(settings)
    // Initial configuration only – changes go through the settings dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePlayerRating(game, activeOpponentEloRef, settings, (next) => {
    setSettings(next)
    // Bei aktiver Adaptivität soll die nächste Partie sofort die neu geschätzte
    // Stärke bekommen, nicht erst beim nächsten Öffnen der Einstellungen.
    if (next.adaptiveStrength) applyEngineSettings(next)
  })

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
      opponentName: opponentStatus.name ?? t('common.engine'),
      startedAt: game.startedAt,
      twoPlayerMode: game.twoPlayerMode
    })
    const result = await window.api.exportPgn(pgn, suggestedPgnFilename(game.startedAt), t('topbar.exportPgn'))
    if (result.ok && result.path) showPgnNotice(true, t('pgnNotice.saved', { path: result.path }))
    else if (result.error) showPgnNotice(false, t('pgnNotice.saveFailed', { message: result.error }))
    // Abbruch durch den Nutzer im Dialog: kein Hinweis nötig
  }

  const handleImportPgn = async (): Promise<void> => {
    const result = await window.api.importPgn(t('topbar.importPgn'))
    if (!result.ok) {
      if (result.error) showPgnNotice(false, t('pgnNotice.importFailed', { message: result.error }))
      return
    }
    const success = game.importGame(result.pgn ?? '')
    if (success) {
      tutor.clear()
      gameReport.clear()
      showPgnNotice(true, t('pgnNotice.imported'))
    } else {
      showPgnNotice(false, t('pgnNotice.invalidFile'))
    }
  }

  const handleOpenLibraryGame = async (path: string): Promise<void> => {
    const pgn = await library.load(path)
    if (!pgn) {
      showPgnNotice(false, t('pgnNotice.loadFailed'))
      return
    }
    const success = game.importGame(pgn)
    if (success) {
      tutor.clear()
      gameReport.clear()
      setShowLibrary(false)
      showPgnNotice(true, t('pgnNotice.loadedFromLibrary'))
    } else {
      showPgnNotice(false, t('pgnNotice.invalidSavedFile'))
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

  // UCI statt SAN, damit sich daraus per buildLinePreview() dieselbe Board-Vorschau
  // (Pfeile fürs Brett) bauen lässt wie bei den anklickbaren Analyse-Linien.
  const openingPreviewUci = useMemo(() => {
    if (!opening || !settings.showOpening) return null
    const previewSan = previewContinuation(game.moves.map((m) => m.san))
    if (previewSan.length === 0) return null
    const chess = new Chess(game.fen)
    const uci: string[] = []
    for (const san of previewSan) {
      const move = chess.move(san)
      if (!move) break
      uci.push(move.from + move.to + (move.promotion ?? ''))
    }
    return uci.length ? uci : null
  }, [opening, settings.showOpening, game.moves, game.fen])

  const currentLine = game.getEval(game.fen)
  const canSuggest =
    !game.result &&
    !game.thinking &&
    game.turn === game.playerColor &&
    !!currentLine &&
    currentLine.depth >= MIN_CLASSIFY_DEPTH

  const colorNames = { w: t('common.white'), b: t('common.black') }
  const statusText = game.result
    ? game.result
    : game.thinking
      ? t('status.engineThinking')
      : t(!game.twoPlayerMode && game.turn === game.playerColor ? 'status.toMoveYou' : 'status.toMove', {
          color: colorNames[game.turn]
        })

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
                  ? t('app.liveAnalysis', { name: analysisStatus.name })
                  : (analysisStatus.error ?? t('app.analysisStarting'))}
              </span>
            </>
          ) : (
            <>
              <span className={`engine-dot ${opponentStatus.ready ? 'ok' : 'err'}`} />
              <span className="engine-name">
                {opponentStatus.ready
                  ? `${t('app.opponent', { name: opponentStatus.name })}${
                      settings.engineKind === 'maia'
                        ? ' (Maia)'
                        : settings.limitStrength
                          ? t('app.eloSuffix', { elo: settings.elo })
                          : ''
                    }`
                  : (opponentStatus.error ?? t('app.engineStarting'))}
              </span>
            </>
          )}
        </div>
        <div className="topbar-actions">
          <TopbarDropdown
            label={
              <>
                <BoardIcon /> {t('topbar.newGame')}
              </>
            }
          >
            <button className="menu-item" onClick={() => startNewGame('w')}>
              <span className="menu-item-label">
                <KingIcon color="w" /> {t('topbar.playAsWhite')}
              </span>
            </button>
            <button className="menu-item" onClick={() => startNewGame('b')}>
              <span className="menu-item-label">
                <KingIcon color="b" /> {t('topbar.playAsBlack')}
              </span>
            </button>
            <div className="menu-sep" />
            <button className="menu-item" onClick={startOtbGame}>
              <span className="menu-item-label">
                <CameraIcon /> {t('topbar.recordOtb')}
              </span>
              <span className="menu-item-cap">{t('topbar.recordOtbHint')}</span>
            </button>
          </TopbarDropdown>
          <TopbarDropdown
            label={
              <>
                <FolderIcon /> {t('topbar.file')}
              </>
            }
          >
            <button className="menu-item" onClick={handleExportPgn} disabled={game.moves.length === 0}>
              <span className="menu-item-label">
                <ExportIcon /> {t('topbar.exportPgn')}
              </span>
            </button>
            <button className="menu-item" onClick={handleImportPgn}>
              <span className="menu-item-label">
                <ImportIcon /> {t('topbar.importPgn')}
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
                <BooksIcon /> {t('topbar.library')}
              </span>
            </button>
          </TopbarDropdown>
          <button className="btn" onClick={toggleAnalysis} aria-pressed={settings.showAnalysis}>
            <ChartIcon /> {t('topbar.analysis')} <StatusRingIcon on={settings.showAnalysis} size={14} />
          </button>
          <button
            className="btn"
            onClick={() => setShowReport(true)}
            disabled={game.moves.length < 2}
            title={t('topbar.reportHint')}
          >
            <ReportIcon /> {t('topbar.report')}
          </button>
          <button className="btn btn-settings" onClick={() => setShowInfo(true)} aria-label={t('topbar.info')}>
            <InfoIcon />
          </button>
          <button className="btn btn-settings" onClick={() => setShowHelp(true)} aria-label={t('topbar.help')}>
            <QuestionIcon />
          </button>
          <button className="btn btn-settings" onClick={() => setShowSettings(true)} aria-label={t('topbar.settings')}>
            <GearIcon />
          </button>
          <LanguageSwitcher />
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
              <span>{t('review.importedGame')}</span>
              <button className="btn" onClick={game.continuePlaying}>
                {t('review.continuePlaying')}
              </button>
            </div>
          ) : game.twoPlayerMode && !game.result ? (
            <div className="status-line otb">{t('status.otbRecording', { status: statusText })}</div>
          ) : (
            <div className={`status-line ${game.result ? 'finished' : ''}`}>{statusText}</div>
          )}
          {opening && settings.showOpening && (
            <div className="panel opening-box">
              <div className="opening-row">
                <div
                  className="opening-line"
                  title={t('opening.detected', { matched: opening.matchedPlies, total: game.moves.length })}
                >
                  <OpenBookIcon size={16} /> {opening.name} <span className="opening-eco">({opening.eco})</span>
                </div>
                {openingPreviewUci && (
                  <button
                    className="btn opening-preview-toggle"
                    title={t('analysis.showOnBoard')}
                    aria-pressed={boardPreview.isActive('opening-book')}
                    onClick={() => {
                      const preview = buildLinePreview(game.fen, openingPreviewUci, 4)
                      if (preview) boardPreview.toggle('opening-book', preview)
                    }}
                  >
                    {t('opening.previewToggle')} <StatusRingIcon on={boardPreview.isActive('opening-book')} size={14} />
                  </button>
                )}
              </div>
            </div>
          )}
          {game.engineError && <div className="error-line">{t('app.engineError', { message: game.engineError })}</div>}
          {settings.showAnalysis && (
            <>
              <AnalysisPanel snapshot={game.snapshot} currentFen={game.fen} boardPreview={boardPreview} />
              {!analysisStatus.ready && analysisStatus.error && (
                <div className="error-line">{t('app.analysisError', { message: analysisStatus.error })}</div>
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

      {showInfo && (
        <InfoDialog
          onClose={() => setShowInfo(false)}
          onOpenHelp={() => {
            setShowInfo(false)
            setShowHelp(true)
          }}
        />
      )}

      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}

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
