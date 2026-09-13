import type { TutorReportMistake, TutorReportStats } from '../../../shared/types'
import type { MoveRecord } from './useGame'

/**
 * Rein aus den vorhandenen Zugklassifikationen berechnet – kein LLM-Aufruf.
 * `bothSides` (Zwei-Spieler-/OTB-Modus): Statistik über die ganze Partie statt
 * nur über die Züge einer festen "Spielerfarbe".
 */
export function computeReportStats(moves: MoveRecord[], playerColor: 'w' | 'b', bothSides = false): TutorReportStats {
  const relevant = bothSides ? moves : moves.filter((m) => m.color === playerColor)
  const count = (c: string): number => relevant.filter((m) => m.classification === c).length
  return {
    blunders: count('blunder'),
    mistakes: count('mistake'),
    inaccuracies: count('inaccuracy'),
    bestMoves: count('best'),
    totalMoves: relevant.length
  }
}

const MAX_CRITICAL_MOMENTS = 4

/** Die gravierendsten Fehler der Partie, in Spielreihenfolge (`bothSides`: beider Seiten statt nur der eigenen). */
export function computeCriticalMoments(
  moves: MoveRecord[],
  playerColor: 'w' | 'b',
  bothSides = false
): TutorReportMistake[] {
  return moves
    .map((move, index) => ({ move, moveNumber: Math.floor(index / 2) + 1 }))
    .filter(
      ({ move }) =>
        (bothSides || move.color === playerColor) &&
        (move.classification === 'blunder' || move.classification === 'mistake') &&
        move.lossPct !== undefined
    )
    .sort((a, b) => (b.move.lossPct ?? 0) - (a.move.lossPct ?? 0))
    .slice(0, MAX_CRITICAL_MOMENTS)
    .sort((a, b) => a.moveNumber - b.moveNumber)
    .map(({ move, moveNumber }) => ({
      moveNumber,
      color: move.color,
      san: move.san,
      classification: move.classification!,
      lossPct: move.lossPct!
    }))
}
