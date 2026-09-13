import type { TutorReportMistake, TutorReportStats } from '../../../shared/types'
import type { MoveRecord } from './useGame'

/** Rein aus den vorhandenen Zugklassifikationen berechnet – kein LLM-Aufruf. */
export function computeReportStats(moves: MoveRecord[], playerColor: 'w' | 'b'): TutorReportStats {
  const own = moves.filter((m) => m.color === playerColor)
  const count = (c: string): number => own.filter((m) => m.classification === c).length
  return {
    blunders: count('blunder'),
    mistakes: count('mistake'),
    inaccuracies: count('inaccuracy'),
    bestMoves: count('best'),
    totalMoves: own.length
  }
}

const MAX_CRITICAL_MOMENTS = 4

/** Die gravierendsten eigenen Fehler der Partie, in Spielreihenfolge. */
export function computeCriticalMoments(moves: MoveRecord[], playerColor: 'w' | 'b'): TutorReportMistake[] {
  return moves
    .map((move, index) => ({ move, moveNumber: Math.floor(index / 2) + 1 }))
    .filter(
      ({ move }) =>
        move.color === playerColor &&
        (move.classification === 'blunder' || move.classification === 'mistake') &&
        move.lossPct !== undefined
    )
    .sort((a, b) => (b.move.lossPct ?? 0) - (a.move.lossPct ?? 0))
    .slice(0, MAX_CRITICAL_MOMENTS)
    .sort((a, b) => a.moveNumber - b.moveNumber)
    .map(({ move, moveNumber }) => ({
      moveNumber,
      san: move.san,
      classification: move.classification!,
      lossPct: move.lossPct!
    }))
}
