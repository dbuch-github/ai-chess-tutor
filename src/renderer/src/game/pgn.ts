import { Chess } from 'chess.js'
import type { CapturablePiece, MoveRecord } from './useGame'

export interface PgnMeta {
  playerColor: 'w' | 'b'
  opponentName: string
  startedAt: Date
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatPgnDate(d: Date): string {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

/** Baut eine vollständige PGN-Zeichenkette samt Standard-Kopfzeilen aus den gespielten Zügen. */
export function buildPgn(moves: MoveRecord[], meta: PgnMeta): string {
  const chess = new Chess()
  chess.setHeader('Event', 'AI Chess Tutor Partie')
  chess.setHeader('Site', 'AI Chess Tutor')
  chess.setHeader('Date', formatPgnDate(meta.startedAt))
  chess.setHeader('Round', '-')
  chess.setHeader('White', meta.playerColor === 'w' ? 'Spieler' : meta.opponentName)
  chess.setHeader('Black', meta.playerColor === 'b' ? 'Spieler' : meta.opponentName)

  for (const move of moves) {
    chess.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), promotion: move.uci.slice(4) || undefined })
  }

  // Ergebnis aus der tatsächlichen Endstellung ableiten, nicht aus dem
  // deutschsprachigen Anzeigetext (game.result) parsen.
  chess.setHeader('Result', pgnResultOf(chess))
  return chess.pgn()
}

function pgnResultOf(chess: Chess): string {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? '0-1' : '1-0'
  if (chess.isDraw()) return '1/2-1/2'
  return '*'
}

/** Ein passender Dateiname für den Speichern-Dialog, z. B. "2026-09-12-ai-chess-tutor.pgn". */
export function suggestedPgnFilename(startedAt: Date): string {
  const d = startedAt
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-ai-chess-tutor.pgn`
}

export interface ImportedGame {
  moves: MoveRecord[]
  /**
   * Die Partie tatsächlich durchgespielte Instanz (nicht nur die Endstellung
   * geladen!) – nur so bleibt die interne Zughistorie erhalten, die Undo und
   * ein "Weiterspielen" (Engine braucht die bisherigen Züge) benötigen.
   */
  chess: Chess
}

/** Lädt eine PGN-Zeichenkette und rekonstruiert die Zugliste inkl. FEN je Zug. Wirft bei ungültigem PGN. */
export function parsePgn(pgn: string): ImportedGame {
  const check = new Chess()
  check.loadPgn(pgn) // wirft eine aussagekräftige Fehlermeldung bei ungültigem PGN

  const uciMoves = check.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''))
  const replay = new Chess()
  const moves: MoveRecord[] = []
  for (const uci of uciMoves) {
    const fenBefore = replay.fen()
    const move = replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined })
    moves.push({
      san: move.san,
      uci,
      color: move.color,
      fenBefore,
      fenAfter: replay.fen(),
      captured: move.captured as CapturablePiece | undefined
    })
  }
  return { moves, chess: replay }
}
