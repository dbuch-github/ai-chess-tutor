import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { useTranslation } from 'react-i18next'
import type { AnalysisLine, AnalysisSnapshot } from '../../../shared/types'
import { classifyMove, MIN_CLASSIFY_DEPTH, type Classification } from './classify'
import { pickBookMove } from './openingBook'
import { parsePgn } from './pgn'
import { boardOutcome, describeOutcome, type GameOutcome } from './result'
import '../i18n' // stellt sicher, dass i18next initialisiert ist, bevor useTranslation() hier greift

export type CapturablePiece = 'p' | 'n' | 'b' | 'r' | 'q'

export interface MoveRecord {
  san: string
  uci: string
  color: 'w' | 'b'
  fenBefore: string
  fenAfter: string
  captured?: CapturablePiece
  classification?: Classification
  lossPct?: number
  /** Vom Tutor generierter Erklärtext zu diesem Zug (falls automatisch kommentiert) – für den PGN-Export. */
  comment?: string
  /** Zuvor gespielte, dann per Zugrücknahme verworfene Fortsetzung ab genau dieser Stellung –
   *  wird beim erneuten Ziehen mit einem abweichenden Zug hier als Nebenvariante abgelegt,
   *  damit sie in der Zugliste und im PGN-Export (als Klammer-Variante) erhalten bleibt. */
  variations?: MoveVariation[]
}

export interface MoveVariation {
  moves: MoveRecord[]
  initialComment?: string
}

export interface GameApi {
  fen: string
  initialFen: string
  initialComment?: string
  outcome: GameOutcome | null
  turn: 'w' | 'b'
  playerColor: 'w' | 'b'
  moves: MoveRecord[]
  lastMove: [string, string] | null
  inCheck: boolean
  thinking: boolean
  result: string | null
  engineError: string | null
  snapshot: AnalysisSnapshot | null
  legalDests: Map<string, string[]>
  newGame: (color: 'w' | 'b') => void
  /** promotion optional (Default Dame) – v.a. für Umwandlung über ein physisches Brett relevant. */
  makeUserMove: (from: string, to: string, promotion?: string) => void
  /** Beste bekannte Analyse-Linie zu einer Stellung (für den Tutor-Prompt). */
  getEval: (fen: string) => AnalysisLine | undefined
  /** Nimmt Züge zurück, bis der Spieler wieder am Zug ist. */
  undoMove: () => void
  canUndo: boolean
  /** Stellt die zuletzt zurückgenommenen Züge wieder her. */
  redoMove: () => void
  canRedo: boolean
  /** Wann die aktuelle Partie begonnen hat (für den PGN-Export). */
  startedAt: Date
  /** True nach einem PGN-Import: Brett/Analyse/Tutor funktionieren, aber kein Auto-Zug des Gegners. */
  reviewMode: boolean
  /** Lädt eine PGN-Datei; liefert false bei ungültigem PGN. */
  importGame: (pgn: string) => boolean
  /** Beendet den Review-Modus – die Partie läuft ab der aktuellen Stellung normal weiter. */
  continuePlaying: () => void
  /** Erzwingt ein Ergebnis von außen (z. B. Zeitüberschreitung an der Schachuhr) – überschreibt
   *  kein bereits aus der Stellung erreichtes Ergebnis (z. B. Matt im selben Moment). */
  forceResult: (result: GameOutcome) => void
  /** Hängt nachträglich einen Tutor-Kommentar an einen bereits gespielten Zug (für den PGN-Export) –
   *  verwirft ihn still, falls sich die Zugliste seither geändert hat (Undo, neue/importierte Partie). */
  setMoveComment: (index: number, uci: string, comment: string) => void
  /** Zwei-Spieler-Modus (OTB-Aufzeichnung): beide Seiten werden vom physischen Brett
   *  übernommen, kein Auto-Zug der Engine – die App zeichnet nur auf und analysiert live. */
  twoPlayerMode: boolean
  /** Startet eine neue, leere Partie im Zwei-Spieler-Modus. */
  startTwoPlayerGame: () => void
}

const START_FEN = new Chess().fen()

function legalDestsOf(chess: Chess): Map<string, string[]> {
  const dests = new Map<string, string[]>()
  for (const move of chess.moves({ verbose: true })) {
    const from = dests.get(move.from) ?? []
    from.push(move.to)
    dests.set(move.from, from)
  }
  return dests
}

export function useGame(engineReady: boolean, useOpeningBook: boolean): GameApi {
  const { t } = useTranslation()
  const chessRef = useRef(new Chess())
  const initialFenRef = useRef(START_FEN)
  const [initialComment, setInitialComment] = useState<string>()
  const gameIdRef = useRef(0)
  const thinkingRef = useRef(false)
  // Best line seen per position, used to classify moves once both sides are analyzed
  const evalByFenRef = useRef(new Map<string, AnalysisLine>())

  const [fen, setFen] = useState(START_FEN)
  const [moves, setMoves] = useState<MoveRecord[]>([])
  // Zurückgenommene Zugpaare, jüngste Rücknahme zuletzt – Grundlage für "Vor"
  const [future, setFuture] = useState<MoveRecord[][]>([])
  // Spiegelt `future` synchron – erlaubt applyMove, die verworfene Fortsetzung
  // ohne veraltete Closures als Nebenvariante an den neuen Zug zu hängen
  const futureRef = useRef<MoveRecord[][]>([])
  const setFutureAnd = useCallback((next: MoveRecord[][]) => {
    futureRef.current = next
    setFuture(next)
  }, [])
  // Spiegelt `moves` synchron; erlaubt undo, die zuletzt gespielten Einträge
  // ohne veraltete Closures exakt herauszuschneiden
  const movesRef = useRef<MoveRecord[]>([])
  const setMovesAnd = useCallback((next: MoveRecord[]) => {
    movesRef.current = next
    setMoves(next)
  }, [])
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w')
  const [startedAt, setStartedAt] = useState(() => new Date())
  const [reviewMode, setReviewMode] = useState(false)
  const [twoPlayerMode, setTwoPlayerMode] = useState(false)
  const [lastMove, setLastMove] = useState<[string, string] | null>(null)
  const [thinking, setThinking] = useState(false)
  const [outcome, setOutcome] = useState<GameOutcome | null>(null)
  const outcomeRef = useRef<GameOutcome | null>(null)
  const setResult = useCallback((next: GameOutcome | null) => {
    outcomeRef.current = next
    setOutcome(next)
  }, [])
  const result = outcome ? describeOutcome(outcome, t) : null
  const [engineError, setEngineError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null)
  const [legalDests, setLegalDests] = useState<Map<string, string[]>>(() =>
    legalDestsOf(chessRef.current)
  )

  const syncFromChess = useCallback((moved?: { from: string; to: string } | null) => {
    const chess = chessRef.current
    setFen(chess.fen())
    setLegalDests(legalDestsOf(chess))
    setResult(boardOutcome(chess))
    if (moved !== undefined) setLastMove(moved ? [moved.from, moved.to] : null)
  }, [setResult])

  const applyMove = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const chess = chessRef.current
      const fenBefore = chess.fen()
      try {
        const move = chess.move({ from, to, promotion: promotion ?? 'q' })
        const uci = move.from + move.to + (move.promotion ?? '')
        // Zuvor zurückgenommene Züge (jüngste Rücknahme zuerst) in Spielreihenfolge
        // zusammensetzen – die verworfene Fortsetzung ab genau dieser Stellung.
        const discardedFuture = futureRef.current.length
          ? futureRef.current.slice().reverse().flat()
          : []
        // Derselbe Zug wie zuvor: kein wirklicher Variantenwechsel, einfach fortsetzen.
        const variation =
          discardedFuture.length && discardedFuture[0].uci !== uci ? discardedFuture : undefined
        setMovesAnd([
          ...movesRef.current,
          {
            san: move.san,
            uci,
            color: move.color,
            fenBefore,
            fenAfter: chess.fen(),
            captured: move.captured as CapturablePiece | undefined,
            ...(variation ? { variations: [{ moves: variation }] } : {})
          }
        ])
        // Ein echter neuer Zug macht eine zuvor zurückgenommene Zukunft ungültig
        // (als Nebenvariante wurde sie oben bereits am neuen Zug festgehalten).
        setFutureAnd([])
        syncFromChess(move)
        return true
      } catch {
        return false
      }
    },
    [setMovesAnd, setFutureAnd, syncFromChess]
  )

  const requestEngineMove = useCallback(async () => {
    const chess = chessRef.current
    if (thinkingRef.current || chess.isGameOver()) return
    const gameId = gameIdRef.current
    thinkingRef.current = true
    setThinking(true)
    try {
      // Eröffnungsbuch zuerst versuchen – spart den Engine-Aufruf und sorgt
      // für Zugvielfalt/Theorie statt stets desselben Engine-Bestzugs.
      if (useOpeningBook && initialFenRef.current === START_FEN) {
        const bookSan = pickBookMove(chess.history())
        if (bookSan) {
          try {
            const resolved = new Chess(chess.fen()).move(bookSan)
            applyMove(resolved.from, resolved.to, resolved.promotion)
            setEngineError(null)
            return
          } catch {
            // Sollte nicht vorkommen (Buchzug muss aus der aktuellen Stellung legal sein) –
            // im Zweifel einfach regulär bei der Engine anfragen.
          }
        }
      }
      const history = chess.history({ verbose: true })
      const movesUci = history.map((m) => m.from + m.to + (m.promotion ?? ''))
      const bestmove = await window.api.requestOpponentMove(movesUci, initialFenRef.current)
      if (gameIdRef.current !== gameId) return
      if (bestmove && bestmove !== '(none)') {
        applyMove(bestmove.slice(0, 2), bestmove.slice(2, 4), bestmove.slice(4) || undefined)
      }
      setEngineError(null)
    } catch (err) {
      if (gameIdRef.current === gameId) {
        setEngineError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (gameIdRef.current === gameId) {
        thinkingRef.current = false
        setThinking(false)
      }
    }
  }, [applyMove, useOpeningBook])

  // Keep the analysis engine on the current position
  useEffect(() => {
    const chess = chessRef.current
    const movesUci = chess.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''))
    window.api.setAnalysisPosition(fen, movesUci, initialFenRef.current).catch((err) => {
      setEngineError(err instanceof Error ? err.message : String(err))
    })
  }, [fen, startedAt])

  // Receive analysis snapshots: display + record evals + classify pending moves
  useEffect(() => {
    return window.api.onAnalysisSnapshot((snap) => {
      const top = snap.lines.find((l) => l.multipv === 1)
      if (top) {
        const known = evalByFenRef.current.get(snap.fen)
        if (!known || top.depth >= known.depth) {
          evalByFenRef.current.set(snap.fen, top)
        }
      }
      setSnapshot(snap)
      setMoves((prev) => {
        let changed = false
        const next = prev.map((record) => {
          if (record.classification) return record
          const before = evalByFenRef.current.get(record.fenBefore)
          const after = evalByFenRef.current.get(record.fenAfter)
          if (!before || !after) return record
          // Die Analyse läuft immer nur auf der aktuellen Stellung – jede
          // andere Stellung wird nie wieder vertieft. Für sie zählt daher die
          // bisher erreichte Tiefe als endgültig, sonst bliebe ein sehr
          // schnell gespielter Zug (Stellung wechselt, bevor MIN_CLASSIFY_DEPTH
          // erreicht ist) für immer unklassifiziert.
          const beforeReady = record.fenBefore !== snap.fen || before.depth >= MIN_CLASSIFY_DEPTH
          const afterReady = record.fenAfter !== snap.fen || after.depth >= MIN_CLASSIFY_DEPTH
          if (!beforeReady || !afterReady) return record
          changed = true
          const wasBest = before.pvUci[0] === record.uci
          return { ...record, ...classifyMove(before, after, record.color, wasBest) }
        })
        if (changed) movesRef.current = next
        return changed ? next : prev
      })
    })
  }, [])

  // Let the engine move whenever it is its turn – aber nicht bei einer
  // importierten Partie in der reinen Ansicht (reviewMode) und nicht im
  // Zwei-Spieler-Modus (dort ziehen beide Seiten physisch am echten Brett).
  useEffect(() => {
    if (!engineReady || result || reviewMode || twoPlayerMode) return
    const chess = chessRef.current
    if (chess.turn() !== playerColor) {
      requestEngineMove()
    }
  }, [engineReady, fen, playerColor, result, reviewMode, twoPlayerMode, requestEngineMove, startedAt])

  const newGame = useCallback(
    (color: 'w' | 'b') => {
      gameIdRef.current += 1
      thinkingRef.current = false
      chessRef.current = new Chess()
      initialFenRef.current = START_FEN
      setInitialComment(undefined)
      evalByFenRef.current.clear()
      setMovesAnd([])
      setFutureAnd([])
      setLastMove(null)
      setThinking(false)
      setEngineError(null)
      setSnapshot(null)
      setPlayerColor(color)
      setStartedAt(new Date())
      setReviewMode(false)
      setTwoPlayerMode(false)
      syncFromChess()
    },
    [setMovesAnd, setFutureAnd, syncFromChess]
  )

  /**
   * Startet eine leere Partie, in der beide Seiten vom physischen Chessnut-Brett
   * übernommen werden (kein Auto-Zug der Engine) – für das digitale Mitschreiben
   * einer real gespielten OTB-Partie zwischen zwei Menschen. Live-Analyse und
   * Tutor-Auswertung laufen unverändert mit.
   */
  const startTwoPlayerGame = useCallback(() => {
    gameIdRef.current += 1
    thinkingRef.current = false
    chessRef.current = new Chess()
    initialFenRef.current = START_FEN
    setInitialComment(undefined)
    evalByFenRef.current.clear()
    setMovesAnd([])
    setFutureAnd([])
    setLastMove(null)
    setThinking(false)
    setEngineError(null)
    setSnapshot(null)
    // Nur für Brett-Orientierung/Uhr-Zuordnung relevant – im Zwei-Spieler-Modus
    // "gehört" keine Seite dem Spieler.
    setPlayerColor('w')
    setStartedAt(new Date())
    setReviewMode(false)
    setTwoPlayerMode(true)
    syncFromChess()
  }, [setMovesAnd, setFutureAnd, syncFromChess])

  const importGame = useCallback(
    (pgn: string): boolean => {
      let imported: ReturnType<typeof parsePgn>
      try {
        imported = parsePgn(pgn)
      } catch {
        return false
      }
      const replay = imported.chess

      gameIdRef.current += 1
      thinkingRef.current = false
      chessRef.current = replay
      initialFenRef.current = imported.initialFen
      setInitialComment(imported.initialComment)
      evalByFenRef.current.clear()
      setMovesAnd(imported.moves)
      setFutureAnd([])
      setThinking(false)
      setEngineError(null)
      setSnapshot(null)
      setStartedAt(new Date())
      setReviewMode(true)
      setTwoPlayerMode(false)
      // Wer an der Endstellung am Zug ist, "übernimmt" beim Fortsetzen – so
      // kann die Partie beim Verlassen des Review-Modus nahtlos weitergehen.
      setPlayerColor(replay.turn())
      const lastImported = imported.moves.at(-1)
      syncFromChess(lastImported ? { from: lastImported.uci.slice(0, 2), to: lastImported.uci.slice(2, 4) } : null)
      setResult(imported.outcome)
      return true
    },
    [setMovesAnd, setFutureAnd, syncFromChess, setResult]
  )

  const continuePlaying = useCallback(() => {
    setPlayerColor(chessRef.current.turn())
    setResult(boardOutcome(chessRef.current))
    setReviewMode(false)
  }, [setResult])

  const forceResult = useCallback((forced: GameOutcome) => {
    // Verhindert, dass eine noch laufende Engine-Antwort danach eintrifft und etwas ändert
    gameIdRef.current += 1
    thinkingRef.current = false
    setThinking(false)
    setResult(outcomeRef.current ?? boardOutcome(chessRef.current) ?? forced)
  }, [setResult])

  const makeUserMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      const chess = chessRef.current
      if (chess.isGameOver() || outcomeRef.current || reviewMode) return
      // Im Zwei-Spieler-Modus darf jede Seite ziehen, wenn sie am Zug ist –
      // "playerColor" bezeichnet dort nur die Brett-Orientierung, keine feste Seite.
      if (!twoPlayerMode && chess.turn() !== playerColor) return
      applyMove(from, to, promotion)
    },
    [applyMove, playerColor, twoPlayerMode, reviewMode]
  )

  const setMoveComment = useCallback(
    (index: number, uci: string, comment: string) => {
      const current = movesRef.current
      // Zugliste hat sich seit dem Anstoßen der Tutor-Anfrage geändert (Undo,
      // neue/importierte Partie) – Kommentar still verwerfen statt ihn dem
      // falschen Zug anzuhängen.
      if (current[index]?.uci !== uci) return
      const next = current.slice()
      next[index] = { ...next[index], comment }
      setMovesAnd(next)
    },
    [setMovesAnd]
  )

  const undoMove = useCallback(() => {
    const chess = chessRef.current
    if (chess.history().length === 0) return
    // Läuft gerade eine Engine-Antwort, wird sie beim Eintreffen verworfen
    gameIdRef.current += 1
    thinkingRef.current = false
    // Direkt nach einem normalen Zugpaar ist chess.turn() bereits wieder die
    // Spielerfarbe – "warten, bis der Spieler am Zug ist" träfe sofort zu und
    // würde nichts zurücknehmen. Stattdessen explizit den letzten eigenen Zug
    // entfernen (plus die Antwort der Engine darauf, falls schon erfolgt).
    let removedOwnMove = false
    while (chess.history().length > 0 && !removedOwnMove) {
      const last = chess.history({ verbose: true }).at(-1)
      chess.undo()
      if (last?.color === playerColor) removedOwnMove = true
    }
    const cut = chess.history().length
    const batch = movesRef.current.slice(cut)
    setMovesAnd(movesRef.current.slice(0, cut))
    setFutureAnd([...futureRef.current, batch])
    setThinking(false)
    setEngineError(null)
    const tail = chess.history({ verbose: true }).at(-1)
    syncFromChess(tail ? { from: tail.from, to: tail.to } : null)
  }, [playerColor, setMovesAnd, setFutureAnd, syncFromChess])

  const redoMove = useCallback(() => {
    if (future.length === 0) return
    const batch = future[future.length - 1]
    const chess = chessRef.current
    for (const record of batch) {
      try {
        chess.move({
          from: record.uci.slice(0, 2),
          to: record.uci.slice(2, 4),
          promotion: record.uci.slice(4) || undefined
        })
      } catch {
        // Derselbe Zug war schon einmal legal – sollte nicht scheitern
      }
    }
    setMovesAnd([...movesRef.current, ...batch])
    setFutureAnd(futureRef.current.slice(0, -1))
    setThinking(false)
    setEngineError(null)
    const tail = chess.history({ verbose: true }).at(-1)
    syncFromChess(tail ? { from: tail.from, to: tail.to } : null)
  }, [future, setMovesAnd, setFutureAnd, syncFromChess])

  return {
    fen,
    initialFen: initialFenRef.current,
    initialComment,
    outcome,
    turn: fen.split(' ')[1] === 'b' ? 'b' : 'w',
    playerColor,
    moves,
    lastMove,
    inCheck: chessRef.current.inCheck(),
    thinking,
    result,
    engineError,
    snapshot,
    legalDests,
    newGame,
    makeUserMove,
    getEval: useCallback((fen: string) => evalByFenRef.current.get(fen), []),
    undoMove,
    canUndo: moves.length > 0,
    redoMove,
    canRedo: future.length > 0,
    startedAt,
    reviewMode,
    importGame,
    continuePlaying,
    forceResult,
    setMoveComment,
    twoPlayerMode,
    startTwoPlayerGame
  }
}
