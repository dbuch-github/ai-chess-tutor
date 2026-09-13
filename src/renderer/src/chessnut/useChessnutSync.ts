import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { GameApi } from '../game/useGame'
import type { ChessnutBoardApi } from './useChessnutBoard'
import { inferMove, liftedPieceSquare, mismatchedSquares, piecesOf, snapshotKey, snapshotsEqual } from './inferMove'

export interface ChessnutSyncApi {
  /** true = wartet noch darauf, dass der zuletzt gespielte Zug physisch nachgezogen wird. */
  awaitingPhysicalSync: boolean
  /** Felder, an denen das physische Brett von der Soll-Stellung abweicht. */
  mismatches: string[]
  /**
   * Zählt hoch, sobald am Brett zweimal in Folge dieselbe von der Soll-Stellung
   * abweichende, keinem legalen Zug entsprechende Stellung beobachtet wurde –
   * ein vermutlicher ungültiger Zugversuch. Ein Zähler statt eines Flags, damit
   * Konsumenten (z. B. der Signalton) per useEffect jede einzelne Änderung
   * mitbekommen, auch wenn zwei Fehlversuche hintereinander denselben Wert hätten.
   */
  invalidAttempt: number
  /**
   * Feld einer gerade vom Brett gehobenen gegnerischen Figur (Farbe ≠
   * game.playerColor), solange alle anderen Felder weiterhin der Soll-Stellung
   * entsprechen – eine erkannte "welche Figuren bedroht das?"-Geste, kein
   * Zugversuch. Null, sobald sie wieder abgesetzt wird oder sich sonst etwas ändert.
   */
  liftedOpponentSquare: string | null
}

/**
 * Verbindet die App-Partie mit einem verbundenen Chessnut Air:
 *  - nach jeder Stellungsänderung - Zug (eigener wie Engine-Zug), aber auch
 *    "Neue Partie", ein PGN-Import oder das Zurücknehmen aller Züge - muss das
 *    physische Brett erst wieder mit der Soll-Stellung übereinstimmen; die
 *    LEDs zeigen dabei entweder die zwei Felder des bekannten letzten Zugs
 *    (Normalfall) oder, wenn es keinen gibt (z. B. direkt nach "Neue Partie"),
 *    alle Felder, die zur Soll-Stellung fehlen oder überzählig sind;
 *  - solange der Spieler am Zug UND physisch synchron ist, wird jede neue
 *    Brett-Stellung gegen alle legalen Züge geprüft (inferMove) – ein zweimal
 *    in Folge erkannter Kandidat wird als Zug übernommen (Schutz gegen einen
 *    einzelnen fehlerhaften RFID-Lesevorgang);
 *  - weicht die (nicht mehr im Übergang befindliche) Stellung dauerhaft von
 *    der Soll-Stellung ab, ohne einem legalen Zug zu entsprechen, werden die
 *    abweichenden Felder als Korrekturhinweis gemeldet.
 */
export function useChessnutSync(game: GameApi, chessnut: ChessnutBoardApi): ChessnutSyncApi {
  const [awaitingPhysicalSync, setAwaitingPhysicalSync] = useState(false)
  const [mismatches, setMismatches] = useState<string[]>([])
  const [invalidAttempt, setInvalidAttempt] = useState(0)
  const [liftedOpponentSquare, setLiftedOpponentSquare] = useState<string | null>(null)
  const pendingCandidateRef = useRef<string | null>(null)
  const lastAppliedKeyRef = useRef<string | null>(null)
  const pendingMismatchRef = useRef<string | null>(null)
  // Debounce für die Fehlversuch-Erkennung (analog pendingCandidateRef): erst bei
  // zwei identischen Lesungen in Folge werten, dann bis zur nächsten Änderung
  // nicht erneut für dieselbe Stellung melden.
  const pendingInvalidKeyRef = useRef<string | null>(null)
  const lastSignaledInvalidKeyRef = useRef<string | null>(null)
  // true, wenn eine weitere Positionsänderung eintraf, bevor die vorherige als
  // physisch synchron bestätigt war (z. B. weil die Engine nach "Neue Partie
  // als Schwarz" sofort zieht, noch bevor das zurückgesetzte Brett geprüft
  // werden konnte) - dann reichen die zwei Felder des jüngsten Zugs allein
  // nicht als LED-Hinweis, weil ggf. noch viel mehr Felder abweichen.
  const preferFullDiffRef = useRef(false)

  const connected = chessnut.status === 'connected'

  // Nach jeder Stellungsänderung (Zug ODER neue/importierte Partie, inkl. "kein
  // letzter Zug" bei Partiebeginn oder nach Zurücknahme aller Züge) muss das
  // physische Brett erst wieder mit der Soll-Stellung übereinstimmen, bevor
  // weiter auf den nächsten Zug gehört wird. Ohne diese Prüfung würde z. B.
  // "Neue Partie" bei noch mitten in der alten Partie stehenden Figuren
  // stillschweigend als "schon synchron" durchgehen.
  useEffect(() => {
    if (!connected) return
    pendingCandidateRef.current = null
    pendingMismatchRef.current = null
    pendingInvalidKeyRef.current = null
    lastSignaledInvalidKeyRef.current = null
    setLiftedOpponentSquare(null)
    // Sonst würde z. B. nach "Neue Partie" derselbe Zug (etwa wieder e2-e4) als
    // "schon übernommen" verworfen, weil er zufällig denselben Schlüssel wie der
    // letzte Zug der vorherigen Partie hat.
    lastAppliedKeyRef.current = null
    // War die vorherige Synchronisation noch nicht abgeschlossen (awaitingPhysicalSync
    // war schon vorher true), als diese neue Positionsänderung eintraf, merken wir uns
    // das dauerhaft für diesen Sync-Vorgang - der jüngste Zug allein ist dann keine
    // verlässliche LED-Angabe mehr, weil das Brett schon vorher nicht passte.
    if (awaitingPhysicalSync) preferFullDiffRef.current = true
    setAwaitingPhysicalSync(true)
    // Bei einem bekannten letzten Zug (und keiner offenen Vor-Abweichung) sofort
    // dessen zwei Felder zeigen; sonst zunächst aus, bis die zweite Wirkung unten
    // anhand der ersten Brett-Meldung die tatsächliche Abweichung berechnen kann.
    chessnut.setLeds(preferFullDiffRef.current ? [] : (game.lastMove ?? []))
    // chessnut.setLeds ist stabil (useCallback ohne echte Abhängigkeiten) – nicht in die Deps aufnehmen,
    // sonst würde diese Wirkung bei jedem Render aus anderen Gründen erneut feuern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, game.lastMove, game.fen])

  useEffect(() => {
    if (!connected || !chessnut.snapshot) return
    const chess = new Chess(game.fen)

    if (awaitingPhysicalSync) {
      // Solange das physische Nachziehen eines bereits gespielten Zugs aussteht,
      // beanspruchen die Korrektur-LEDs oben die Anzeige – keine Bedrohungs-Vorschau parallel dazu.
      setLiftedOpponentSquare(null)
      if (snapshotsEqual(piecesOf(chess), chessnut.snapshot)) {
        pendingMismatchRef.current = null
        preferFullDiffRef.current = false
        setAwaitingPhysicalSync(false)
        setMismatches([])
        chessnut.setLeds([])
      } else {
        const diffs = mismatchedSquares(chess, chessnut.snapshot)

        // Die LEDs zeigen bevorzugt die bekannten Zug-Felder (aus dem letzten Zug) -
        // NICHT die volle beobachtete Abweichung, die durch einen einzelnen
        // fehlerhaften RFID-Lesevorgang auf einem unbeteiligten Feld verfälscht sein
        // kann. Ausnahmen, in denen nur die vollständige Abweichung verlässlich ist:
        // kein bekannter letzter Zug (neue/importierte Partie, alle Züge
        // zurückgenommen), oder eine weitere Positionsänderung kam, bevor die
        // vorherige überhaupt als synchron bestätigt war (preferFullDiffRef) - dann
        // könnten noch viel mehr Felder als nur die des jüngsten Zugs betroffen sein.
        // Bei jeder neuen Brett-Meldung erneut gesetzt (nicht nur einmalig), damit
        // ein einzelner verlorener oder kollidierender Schreibbefehl sich von selbst
        // behebt.
        const ledSquares = preferFullDiffRef.current || !game.lastMove ? diffs : game.lastMove
        chessnut.setLeds(ledSquares)

        // Die Text-Korrekturmeldung dagegen erst übernehmen, wenn dieselbe Abweichung
        // zweimal in Folge beobachtet wurde - Schutz gegen genau dieses Rauschen, damit
        // nicht bei jedem einzelnen Fehlmesswert eine andere (falsche) Meldung aufblitzt.
        const key = diffs.slice().sort().join(',')
        if (pendingMismatchRef.current !== key) {
          pendingMismatchRef.current = key
        } else {
          setMismatches(diffs)
        }
      }
      return
    }

    // Im Zwei-Spieler-Modus (OTB-Aufzeichnung) gibt es keine feste "Spielerfarbe" –
    // Zugerkennung läuft dann für beide Seiten, unabhängig davon, wer am Zug ist.
    if (game.result || game.reviewMode || (!game.twoPlayerMode && game.turn !== game.playerColor)) {
      setMismatches([])
      setLiftedOpponentSquare(null)
      return
    }

    const candidate = inferMove(chess, chessnut.snapshot)
    if (!candidate) {
      pendingCandidateRef.current = null
      setMismatches([])
      if (snapshotsEqual(piecesOf(chess), chessnut.snapshot)) {
        // Brett entspricht (wieder) der Soll-Stellung – kein Fehlversuch zu melden.
        pendingInvalidKeyRef.current = null
        lastSignaledInvalidKeyRef.current = null
        setLiftedOpponentSquare(null)
      } else {
        // Genau eine gegnerische Figur fehlt, sonst stimmt alles – das ist keine
        // Zugabsicht, sondern die bewusste "was bedroht das?"-Geste: kurz anheben,
        // um die Bedrohungen zu sehen, dann wieder absetzen. Kein Fehlversuch.
        const opponentColor = game.playerColor === 'w' ? 'b' : 'w'
        const liftedSquare = liftedPieceSquare(chess, chessnut.snapshot, opponentColor)
        if (liftedSquare) {
          pendingInvalidKeyRef.current = null
          lastSignaledInvalidKeyRef.current = null
          setLiftedOpponentSquare(liftedSquare)
        } else {
          setLiftedOpponentSquare(null)
          // Zwei identische Lesungen in Folge nötig, bevor eine Abweichung als
          // tatsächlicher Fehlversuch gilt (nicht schon die erste – das wäre oft
          // nur eine Übergangsstellung beim Anheben einer Figur); danach nicht bei
          // jedem weiteren ~200ms-Tick erneut melden, solange sich nichts ändert.
          const key = snapshotKey(chessnut.snapshot)
          if (pendingInvalidKeyRef.current !== key) {
            pendingInvalidKeyRef.current = key
          } else if (lastSignaledInvalidKeyRef.current !== key) {
            lastSignaledInvalidKeyRef.current = key
            setInvalidAttempt((n) => n + 1)
          }
        }
      }
      return
    }
    pendingInvalidKeyRef.current = null
    lastSignaledInvalidKeyRef.current = null
    setLiftedOpponentSquare(null)
    const key = `${candidate.from}${candidate.to}${candidate.promotion ?? ''}`
    if (pendingCandidateRef.current !== key) {
      pendingCandidateRef.current = key
      return
    }
    if (lastAppliedKeyRef.current === key) return
    lastAppliedKeyRef.current = key
    game.makeUserMove(candidate.from, candidate.to, candidate.promotion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    connected,
    chessnut.snapshot,
    awaitingPhysicalSync,
    game.fen,
    game.result,
    game.reviewMode,
    game.turn,
    game.playerColor,
    game.twoPlayerMode
  ])

  return { awaitingPhysicalSync, mismatches, invalidAttempt, liftedOpponentSquare }
}
