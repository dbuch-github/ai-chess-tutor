import { useEffect } from 'react'
import type { GameApi } from '../game/useGame'
import type { BoardPreviewApi } from '../game/useBoardPreview'
import type { ChessnutBoardApi } from './useChessnutBoard'
import type { ChessnutSyncApi } from './useChessnutSync'
import { MIN_CLASSIFY_DEPTH } from '../game/classify'

/** Anzeigedauer je Feld; Von- und Ziel-Feld wechseln sich ab. */
const STEP_MS = 500

/**
 * Lässt den besten Zug der mitlaufenden Stockfish-Analyse auf dem physischen
 * Brett blinken, solange der Spieler am Zug ist: Von-Feld und Ziel-Feld
 * leuchten im Wechsel (je 500 ms), nie gleichzeitig.
 *
 * Der Wechsel statt gleichzeitigem Blinken ist Absicht: Die LED-Matrix des
 * Chessnut Air lässt bei Mustern über mehrere Reihen UND Linien an den
 * übrigen Kreuzungspunkten schwache "Geister-LEDs" mitglimmen (Hardware-
 * Übersprechen, per Protokoll nicht abstellbar). Ein einzelnes Feld ist immer
 * geisterfrei - und der Wechsel Von → Ziel macht die Zugrichtung ablesbar.
 *
 * Gezeigt wird nur eine Analyse, die zur aktuellen Stellung gehört und schon
 * eine Mindesttiefe erreicht hat (sonst würde bei jedem Tiefensprung ein
 * anderer Kandidat aufblitzen). Tritt zurück, solange eine andere
 * Zuständigkeit die LEDs braucht: physischer Sync nach einem Zug
 * (`sync.awaitingPhysicalSync`) oder eine angeklickte Zugvorschau
 * (`boardPreview.active`). Im Zwei-Spieler-Modus (OTB-Aufzeichnung, beide
 * Seiten menschlich) grundsätzlich aus – sonst würde der Bestzug live auf dem
 * gemeinsam sichtbaren Brett verraten, während der Gegner noch am Zug ist.
 */
export function useChessnutBestMove(
  game: GameApi,
  chessnut: ChessnutBoardApi,
  sync: ChessnutSyncApi,
  boardPreview: BoardPreviewApi,
  enabled: boolean
): void {
  const snapshot = game.snapshot
  const best =
    snapshot && snapshot.fen === game.fen
      ? (snapshot.lines.find((l) => l.multipv === 1) ?? snapshot.lines[0])
      : undefined
  const uci = best && best.depth >= MIN_CLASSIFY_DEPTH ? best.pvUci[0] : undefined
  const from = uci?.slice(0, 2)
  const to = uci?.slice(2, 4)

  const applicable =
    enabled &&
    chessnut.status === 'connected' &&
    !sync.awaitingPhysicalSync &&
    !boardPreview.active &&
    !game.result &&
    !game.reviewMode &&
    !game.twoPlayerMode &&
    game.turn === game.playerColor &&
    !!from &&
    !!to

  useEffect(() => {
    if (!applicable || !from || !to) return

    let showFrom = true
    chessnut.setLeds([from])
    const id = window.setInterval(() => {
      showFrom = !showFrom
      chessnut.setLeds(showFrom ? [from] : [to])
    }, STEP_MS)

    // Aufräumen läuft in React vor den Wirkungen der anderen Hooks desselben
    // Renders - eine übernehmende Zuständigkeit (Sync, Vorschau) schreibt ihre
    // LEDs also erst danach und wird nicht überschrieben.
    return () => {
      window.clearInterval(id)
      chessnut.setLeds([])
    }
    // chessnut.setLeds ist stabil (useCallback ohne echte Abhängigkeiten)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicable, from, to])
}
