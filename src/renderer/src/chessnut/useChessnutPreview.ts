import { useEffect } from 'react'
import type { BoardPreviewApi } from '../game/useBoardPreview'
import type { ChessnutBoardApi } from './useChessnutBoard'
import type { ChessnutSyncApi } from './useChessnutSync'

const BLINK_INTERVAL_MS = 500

/**
 * Spiegelt den bereits vorhandenen Board-Preview-Zustand (Zugvorschlag des
 * Tutors, angeklickte Analyse-Linie) als blinkende LEDs auf dem physischen
 * Brett – dieselbe Quelle, die auch den Pfeil auf dem Bildschirm-Brett speist,
 * damit beide Darstellungen immer übereinstimmen.
 *
 * Das Chessnut-Brett kann LEDs laut Protokolldokumentation nicht selbst zum
 * Blinken bringen ("no mechanism to flash the LEDs") – das Blinken wird hier
 * rein softwareseitig durch abwechselndes An-/Ausschalten erzeugt.
 *
 * Tritt bewusst zurück, solange `sync.awaitingPhysicalSync` aktiv ist (das
 * physische Nachziehen eines bereits gespielten Zugs hat Vorrang vor einem
 * Vorschlag für den nächsten).
 */
export function useChessnutPreview(
  chessnut: ChessnutBoardApi,
  boardPreview: BoardPreviewApi,
  sync: ChessnutSyncApi
): void {
  const from = boardPreview.active?.from
  const to = boardPreview.active?.to

  useEffect(() => {
    if (chessnut.status !== 'connected' || sync.awaitingPhysicalSync || !from || !to) return

    const squares = [from, to]
    let visible = true
    chessnut.setLeds(squares)
    const id = window.setInterval(() => {
      visible = !visible
      chessnut.setLeds(visible ? squares : [])
    }, BLINK_INTERVAL_MS)

    return () => {
      window.clearInterval(id)
      chessnut.setLeds([])
    }
    // chessnut.setLeds ist stabil (useCallback ohne echte Abhängigkeiten)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chessnut.status, sync.awaitingPhysicalSync, from, to])
}
