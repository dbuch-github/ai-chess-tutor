import { useEffect } from 'react'
import { Chess, type Square } from 'chess.js'
import type { GameApi } from '../game/useGame'
import type { ChessnutBoardApi } from './useChessnutBoard'
import type { ChessnutSyncApi } from './useChessnutSync'

export interface ThreatPreview {
  /** Feld der gehobenen gegnerischen Figur. */
  from: string
  /** Eigene Figuren, die von ihr aus diesem Feld aus bedroht werden. */
  attacks: string[]
}

/**
 * Wird eine gegnerische Figur vom physischen Brett gehoben (`sync.liftedOpponentSquare`,
 * erkannt in useChessnutSync), leuchten alle davon bedrohten eigenen Figuren auf dem
 * Brett auf – ein "was steht hier auf dem Spiel?"-Check zum Nachdenken, ohne die Figur
 * tatsächlich zu ziehen. Erlischt automatisch, sobald sie wieder abgesetzt wird.
 *
 * Liefert dieselbe Information zusätzlich zurück, damit die App sie auch als Overlay
 * auf dem Bildschirm-Brett zeigen kann (LEDs allein zeigen nur die Ziele, nicht mehr,
 * von welchem Feld aus – auf dem Bildschirm ist das ohne Blick aufs echte Brett hilfreich).
 */
export function useChessnutThreatPreview(
  game: GameApi,
  chessnut: ChessnutBoardApi,
  sync: ChessnutSyncApi
): ThreatPreview | null {
  const liftedSquare = sync.liftedOpponentSquare
  const preview = liftedSquare ? computeThreatPreview(game.fen, liftedSquare) : null
  const attacksKey = preview?.attacks.join(',') ?? ''

  useEffect(() => {
    if (chessnut.status !== 'connected' || !preview) return
    // Nur die bedrohten Ziele leuchten – welche Figur gehoben wurde, weiß die Hand
    // ohnehin schon, die sie gerade hält.
    chessnut.setLeds(preview.attacks)
    return () => {
      chessnut.setLeds([])
    }
    // chessnut.setLeds ist stabil (useCallback ohne echte Abhängigkeiten); attacksKey
    // statt preview.attacks in den Deps, weil sich die Array-Referenz sonst bei jedem
    // Render ändert, auch ohne inhaltliche Änderung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chessnut.status, attacksKey])

  return preview
}

function computeThreatPreview(fen: string, liftedSquare: string): ThreatPreview | null {
  const chess = new Chess(fen)
  const piece = chess.get(liftedSquare as Square)
  if (!piece) return null
  const ownColor = piece.color === 'w' ? 'b' : 'w'

  const attacks: string[] = []
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === ownColor && chess.attackers(cell.square, piece.color).includes(liftedSquare as Square)) {
        attacks.push(cell.square)
      }
    }
  }
  return attacks.length > 0 ? { from: liftedSquare, attacks } : null
}
