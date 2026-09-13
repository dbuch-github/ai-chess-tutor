import { Chess } from 'chess.js'
import type { MoveRecord } from './useGame'

export const MAX_PV_PLIES = 10

/** UCI-Hauptvariante in nummerierte SAN übersetzen, z. B. "12… Nf6 13. Bg5". */
export function pvToSan(fen: string, pvUci: string[], maxPlies = MAX_PV_PLIES): string {
  const chess = new Chess(fen)
  const parts: string[] = []
  const startMoveNo = chess.moveNumber()
  const startsWithBlack = chess.turn() === 'b'
  for (const uci of pvUci.slice(0, maxPlies)) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4) || undefined
      })
      parts.push(move.san)
    } catch {
      break
    }
  }
  const prefix = startsWithBlack ? `${startMoveNo}… ` : `${startMoveNo}. `
  return parts.length ? prefix + parts.join(' ') : '—'
}

/** Partieverlauf als nummerierter SAN-String: "1. e4 e5 2. Nf3 …". */
export function historySan(moves: MoveRecord[]): string {
  const parts: string[] = []
  for (let i = 0; i < moves.length; i += 2) {
    const no = i / 2 + 1
    parts.push(`${no}. ${moves[i].san}${moves[i + 1] ? ' ' + moves[i + 1].san : ''}`)
  }
  return parts.join(' ')
}

/** Grobe Spielphase aus Zugzahl und verbliebenem Material. */
export function gamePhase(fen: string, moveCount: number): string {
  if (moveCount < 20) return 'Eröffnung'
  const pieces = fen.split(' ')[0].replace(/[^nbrqNBRQ]/g, '').length
  return pieces <= 6 ? 'Endspiel' : 'Mittelspiel'
}
