import type { Chess } from 'chess.js'

export interface GameOutcome {
  result: '1-0' | '0-1' | '1/2-1/2'
  description: string
  termination?: string
}

export function boardOutcome(chess: Chess): GameOutcome | null {
  if (!chess.isGameOver()) return null
  if (chess.isCheckmate()) {
    return {
      result: chess.turn() === 'w' ? '0-1' : '1-0',
      description: chess.turn() === 'w' ? 'Schwarz gewinnt durch Matt' : 'Weiß gewinnt durch Matt'
    }
  }
  const description = chess.isStalemate() ? 'Remis durch Patt'
    : chess.isThreefoldRepetition() ? 'Remis durch Stellungswiederholung'
    : chess.isInsufficientMaterial() ? 'Remis: ungenügendes Material'
    : chess.isDrawByFiftyMoves() ? 'Remis: 50-Züge-Regel' : 'Remis'
  return { result: '1/2-1/2', description }
}

export function importedOutcome(chess: Chess): GameOutcome | null {
  const board = boardOutcome(chess)
  if (board) return board
  const { Result: result, Termination: termination } = chess.getHeaders()
  if (result !== '1-0' && result !== '0-1' && result !== '1/2-1/2') return null
  const winner = result === '1-0' ? 'Weiß' : 'Schwarz'
  return {
    result,
    termination,
    description: result === '1/2-1/2' ? 'Remis'
      : `${winner} gewinnt${termination === 'time forfeit' ? ' durch Zeitüberschreitung' : ''}`
  }
}
