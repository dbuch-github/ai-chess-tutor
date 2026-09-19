import type { Chess } from 'chess.js'
import type { TFunction } from 'i18next'

export type OutcomeReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold'
  | 'insufficient-material'
  | 'fifty-moves'
  | 'draw'
  | 'time-forfeit'
  /** Entscheidendes Ergebnis aus einem PGN-Header, ohne lokal erkannten Grund (z. B. Aufgabe). */
  | 'decisive'

export interface GameOutcome {
  result: '1-0' | '0-1' | '1/2-1/2'
  reason: OutcomeReason
  /** Nur bei einseitigem Ergebnis relevant (nicht bei Remis). */
  winner?: 'w' | 'b'
  termination?: string
}

export function boardOutcome(chess: Chess): GameOutcome | null {
  if (!chess.isGameOver()) return null
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'b' : 'w'
    return { result: winner === 'w' ? '1-0' : '0-1', reason: 'checkmate', winner }
  }
  const reason: OutcomeReason = chess.isStalemate()
    ? 'stalemate'
    : chess.isThreefoldRepetition()
      ? 'threefold'
      : chess.isInsufficientMaterial()
        ? 'insufficient-material'
        : chess.isDrawByFiftyMoves()
          ? 'fifty-moves'
          : 'draw'
  return { result: '1/2-1/2', reason }
}

export function importedOutcome(chess: Chess): GameOutcome | null {
  const board = boardOutcome(chess)
  if (board) return board
  const { Result: result, Termination: termination } = chess.getHeaders()
  if (result !== '1-0' && result !== '0-1' && result !== '1/2-1/2') return null
  if (result === '1/2-1/2') return { result, reason: 'draw', termination }
  const winner = result === '1-0' ? 'w' : 'b'
  return {
    result,
    winner,
    termination,
    reason: termination === 'time forfeit' ? 'time-forfeit' : 'decisive'
  }
}

/** Rendert ein GameOutcome in die aktuelle UI-Sprache (nur für Anzeige/Tutor-Prompt, nie für PGN/strukturelle Checks). */
export function describeOutcome(outcome: GameOutcome, t: TFunction): string {
  const winnerName = outcome.winner ? t(outcome.winner === 'w' ? 'common.white' : 'common.black') : undefined
  switch (outcome.reason) {
    case 'checkmate':
      return t(outcome.winner === 'w' ? 'outcome.checkmateWhite' : 'outcome.checkmateBlack')
    case 'stalemate':
      return t('outcome.stalemate')
    case 'threefold':
      return t('outcome.threefold')
    case 'insufficient-material':
      return t('outcome.insufficientMaterial')
    case 'fifty-moves':
      return t('outcome.fiftyMoves')
    case 'time-forfeit':
      return t('outcome.winsByTimeForfeit', { winner: winnerName })
    case 'draw':
    default:
      return winnerName ? t('outcome.wins', { winner: winnerName }) : t('outcome.draw')
  }
}
