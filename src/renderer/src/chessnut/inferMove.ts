import { Chess } from 'chess.js'
import type { BoardSnapshot, PieceChar } from './protocol'

export interface InferredMove {
  from: string
  to: string
  promotion?: string
}

/** Aktuelle Stellung als dieselbe Art von Feld->Figur-Map wie ein Chessnut-Snapshot. */
export function piecesOf(chess: Chess): BoardSnapshot {
  const snapshot: BoardSnapshot = {}
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue
      snapshot[cell.square] = (cell.color === 'w' ? cell.type.toUpperCase() : cell.type) as PieceChar
    }
  }
  return snapshot
}

export function snapshotsEqual(a: BoardSnapshot, b: BoardSnapshot): boolean {
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  return keysA.every((k) => a[k] === b[k])
}

/** Reihenfolge-unabhängiger String-Schlüssel einer Stellung (Debounce-Vergleiche über mehrere Ticks). */
export function snapshotKey(snapshot: BoardSnapshot): string {
  return Object.keys(snapshot)
    .sort()
    .map((sq) => `${sq}${snapshot[sq]}`)
    .join(',')
}

/**
 * Findet den einen legalen Zug, der die aktuelle Stellung in die am Brett
 * beobachtete Stellung überführt. Vergleicht komplette Zugergebnisse statt
 * einzelne Felder zu diffen – das deckt Schlagzüge, Rochade, En-passant und
 * Umwandlung (inkl. welche Figur gewählt wurde) automatisch mit ab, ohne für
 * jeden Fall eigene Sonderlogik zu brauchen.
 *
 * Liefert null bei keinem oder mehreren Treffern – etwa während eine Figur
 * gerade angehoben ist (Übergangsstellung) oder bei einer physisch
 * unvollständigen/fehlerhaften Aufstellung.
 */
export function inferMove(chess: Chess, observed: BoardSnapshot): InferredMove | null {
  const matches: InferredMove[] = []
  for (const move of chess.moves({ verbose: true })) {
    const clone = new Chess(chess.fen())
    clone.move({ from: move.from, to: move.to, promotion: move.promotion })
    if (snapshotsEqual(piecesOf(clone), observed)) {
      matches.push({ from: move.from, to: move.to, promotion: move.promotion })
    }
  }
  return matches.length === 1 ? matches[0] : null
}

/**
 * Erkennt, ob genau eine Figur der angegebenen Farbe vom Brett gehoben wurde:
 * ihr Feld ist jetzt leer, alle anderen Felder entsprechen weiterhin der
 * Soll-Stellung. Liefert deren Feld, sonst null – auch bei mehr als einer
 * Abweichung, oder wenn die abweichende Figur zur anderen Farbe gehört (dann
 * ist es kein reines "Anheben zum Ansehen", sondern z. B. ein Zugversuch).
 */
export function liftedPieceSquare(chess: Chess, observed: BoardSnapshot, color: 'w' | 'b'): string | null {
  const expected = piecesOf(chess)
  const squares = new Set([...Object.keys(expected), ...Object.keys(observed)])
  let lifted: string | null = null
  for (const sq of squares) {
    if (expected[sq] === observed[sq]) continue
    if (lifted !== null) return null // mehr als ein Feld weicht ab
    if (observed[sq] !== undefined) return null // Feld trägt jetzt etwas anderes, keine reine Entnahme
    const piece = expected[sq]
    if (!piece) return null
    const pieceColor: 'w' | 'b' = piece === piece.toUpperCase() ? 'w' : 'b'
    if (pieceColor !== color) return null
    lifted = sq
  }
  return lifted
}

/** Felder, an denen die beobachtete von der Soll-Stellung abweicht (für LED-Korrekturhinweise). */
export function mismatchedSquares(chess: Chess, observed: BoardSnapshot): string[] {
  const expected = piecesOf(chess)
  const squares = new Set([...Object.keys(expected), ...Object.keys(observed)])
  return [...squares].filter((sq) => expected[sq] !== observed[sq])
}
