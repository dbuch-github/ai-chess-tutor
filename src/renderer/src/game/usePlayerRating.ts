import { useEffect, useRef } from 'react'
import type { AppSettings } from '../settings'
import { saveSettings } from '../settings'
import { updateElo } from './rating'
import type { GameApi } from './useGame'

/**
 * Aktualisiert die geschätzte Spielstärke (settings.estimatedElo) nach jeder
 * tatsächlich zu Ende gespielten Partie gegen eine Engine mit bekannter Elo
 * (siehe activeOpponentEloRef, von App.tsx beim Konfigurieren gesetzt) – nach
 * demselben "gerade beendet"-Muster wie useGameLibrary.ts. Nicht bei
 * reviewMode (importierte Partie) oder twoPlayerMode (OTB, kein Engine-Gegner).
 */
export function usePlayerRating(
  game: GameApi,
  activeOpponentEloRef: React.RefObject<number | null>,
  settings: AppSettings,
  onRatingUpdated: (next: AppSettings) => void
): void {
  const prevResultRef = useRef<string | null>(null)
  const ratedForGameRef = useRef<number | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    const justFinished = !!game.result && !prevResultRef.current
    prevResultRef.current = game.result
    if (!justFinished || game.reviewMode || game.twoPlayerMode) return
    if (ratedForGameRef.current === game.startedAt.getTime()) return
    ratedForGameRef.current = game.startedAt.getTime()

    const opponentElo = activeOpponentEloRef.current
    const outcome = game.outcome
    if (opponentElo == null || !outcome) return

    const actualScore: 0 | 0.5 | 1 =
      outcome.result === '1/2-1/2' ? 0.5 : outcome.result === (game.playerColor === 'w' ? '1-0' : '0-1') ? 1 : 0

    const s = settingsRef.current
    const nextElo = updateElo(s.estimatedElo, s.ratedGamesCount, opponentElo, actualScore)
    const next = { ...s, estimatedElo: nextElo, ratedGamesCount: s.ratedGamesCount + 1 }
    saveSettings(next)
    onRatingUpdated(next)
    // Nur der Übergang "läuft" -> "beendet" soll auslösen, siehe useGameLibrary.ts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.result, game.reviewMode, game.twoPlayerMode, game.startedAt])
}
