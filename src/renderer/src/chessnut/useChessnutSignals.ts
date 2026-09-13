import { useEffect, useRef } from 'react'
import type { GameApi } from '../game/useGame'
import type { ChessnutBoardApi } from './useChessnutBoard'
import type { ChessnutSyncApi } from './useChessnutSync'

// Drei klar unterscheidbare Töne auf demselben kleinen Piezo-Buzzer: Schach
// hell/kurz (positiv-aufmerksam), Fehlversuch tief/kurz ("das war nichts"),
// Zeitüberschreitung tief/lang als Doppelsignal (dringlicher als ein Einzelton).
const CHECK_BEEP = { frequencyHz: 1760, durationMs: 120 }
const INVALID_BEEP = { frequencyHz: 300, durationMs: 160 }
const FLAG_BEEP = { frequencyHz: 440, durationMs: 220 }
const FLAG_BEEP_GAP_MS = 140

/**
 * Ergänzt den Bildschirm-Klick-Sound (useMoveSound) um Signaltöne direkt am
 * physischen Brett – für Ereignisse, die man am Brett stehend sonst leicht
 * verpasst: Schach geboten, ein am Brett erkannter ungültiger Zugversuch
 * (sync.invalidAttempt) oder eine Zeitüberschreitung an der Schachuhr.
 */
export function useChessnutSignals(
  game: GameApi,
  chessnut: ChessnutBoardApi,
  sync: ChessnutSyncApi,
  enabled: boolean
): void {
  const connected = chessnut.status === 'connected'
  const prevCheckRef = useRef(false)
  const prevInvalidRef = useRef(sync.invalidAttempt)
  const prevResultRef = useRef(game.result)

  // Schach: nur beim Übergang "nicht im Schach" -> "im Schach" piepen, nicht bei
  // jedem Render, solange der Schach weiterhin besteht.
  useEffect(() => {
    const wasInCheck = prevCheckRef.current
    prevCheckRef.current = game.inCheck
    if (connected && enabled && game.inCheck && !wasInCheck) {
      chessnut.beep(CHECK_BEEP.frequencyHz, CHECK_BEEP.durationMs)
    }
    // chessnut.beep ist stabil (useCallback ohne echte Abhängigkeiten)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.inCheck, connected, enabled])

  // Ungültiger Zugversuch: sync.invalidAttempt zählt bei jedem erkannten
  // Fehlversuch hoch (siehe useChessnutSync) – jede Änderung ist ein eigenes Ereignis.
  useEffect(() => {
    const prev = prevInvalidRef.current
    prevInvalidRef.current = sync.invalidAttempt
    if (connected && enabled && sync.invalidAttempt !== prev) {
      chessnut.beep(INVALID_BEEP.frequencyHz, INVALID_BEEP.durationMs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.invalidAttempt, connected, enabled])

  // Zeitüberschreitung: game.result trägt in diesem Fall den deutschen Text aus
  // useClock (".. gewinnt durch Zeitüberschreitung") – daran erkannt, statt an
  // einem eigenen Ergebnis-Typ, um useClock/useGame nicht koppeln zu müssen.
  useEffect(() => {
    const prevResult = prevResultRef.current
    prevResultRef.current = game.result
    if (!connected || !enabled) return
    if (game.result && game.result !== prevResult && game.result.includes('Zeitüberschreitung')) {
      chessnut.beep(FLAG_BEEP.frequencyHz, FLAG_BEEP.durationMs)
      const id = window.setTimeout(
        () => chessnut.beep(FLAG_BEEP.frequencyHz, FLAG_BEEP.durationMs),
        FLAG_BEEP_GAP_MS + FLAG_BEEP.durationMs
      )
      return () => window.clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.result, connected, enabled])
}
