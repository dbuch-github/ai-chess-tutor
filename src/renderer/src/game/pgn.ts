import { Chess } from 'chess.js'
import type { Classification } from './classify'
import type { CapturablePiece, MoveRecord } from './useGame'
import { boardOutcome, importedOutcome, type GameOutcome } from './result'

export interface PgnMeta {
  initialFen?: string
  initialComment?: string
  outcome?: GameOutcome | null
  playerColor: 'w' | 'b'
  opponentName: string
  startedAt: Date
  /** Zwei-Spieler-Modus (OTB): "Weiß"/"Schwarz" statt "Spieler"/Engine-Name in den Kopfzeilen. */
  twoPlayerMode?: boolean
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatPgnDate(d: Date): string {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

const CLASS_LABELS: Partial<Record<Classification, string>> = {
  inaccuracy: 'Ungenauigkeit',
  mistake: 'Fehler',
  blunder: 'Blunder'
}

/**
 * Baut den PGN-Kommentar zu einem Zug: Klassifikation + Gewinnchancen-Verlust
 * (ab Ungenauigkeit aufwärts, wie in der Zugliste/im Partie-Report) und –
 * falls vorhanden – der vom Tutor generierte Erklärtext. So bleibt die Partie
 * auch in Lichess-Studies, ChessBase & Co. mit den Erklärungen lesbar.
 */
function moveComment(move: MoveRecord): string | undefined {
  const parts: string[] = []
  const label = move.classification ? CLASS_LABELS[move.classification] : undefined
  if (label && move.lossPct !== undefined) {
    parts.push(`${label} (−${move.lossPct.toFixed(0)} % Gewinnchance)`)
  }
  if (move.comment) parts.push(move.comment)
  return parts.length ? parts.join(' — ') : undefined
}

/** Baut eine vollständige PGN-Zeichenkette samt Standard-Kopfzeilen aus den gespielten Zügen. */
export function buildPgn(moves: MoveRecord[], meta: PgnMeta): string {
  const chess = new Chess(meta.initialFen ?? moves[0]?.fenBefore)
  if (meta.initialComment) chess.setComment(meta.initialComment)
  chess.setHeader('Event', 'AI Chess Tutor Partie')
  chess.setHeader('Site', 'AI Chess Tutor')
  chess.setHeader('Date', formatPgnDate(meta.startedAt))
  chess.setHeader('Round', '-')
  chess.setHeader('White', meta.twoPlayerMode ? 'Weiß' : meta.playerColor === 'w' ? 'Spieler' : meta.opponentName)
  chess.setHeader('Black', meta.twoPlayerMode ? 'Schwarz' : meta.playerColor === 'b' ? 'Spieler' : meta.opponentName)

  for (const move of moves) {
    chess.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), promotion: move.uci.slice(4) || undefined })
    // setComment() hängt am fen() NACH diesem Zug – passt exakt zur PGN-Konvention,
    // dass ein Kommentar dem vorangehenden Zug folgt. Einschränkung: Bei einer
    // Stellungswiederholung (dieselbe FEN zweimal in der Partie) überschreibt der
    // spätere Kommentar den früheren – in der Praxis vernachlässigbar, weil
    // Kommentare ohnehin nur zu wenigen Zügen anfallen.
    const comment = moveComment(move)
    if (comment) chess.setComment(comment)
  }

  const outcome = boardOutcome(chess) ?? meta.outcome
  chess.setHeader('Result', outcome?.result ?? '*')
  if (outcome?.termination) chess.setHeader('Termination', outcome.termination)
  return chess.pgn()
}

/** Ein passender Dateiname für den Speichern-Dialog, z. B. "2026-09-12-ai-chess-tutor.pgn". */
export function suggestedPgnFilename(startedAt: Date): string {
  const d = startedAt
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-ai-chess-tutor.pgn`
}

export interface ImportedGame {
  initialFen: string
  initialComment?: string
  outcome: GameOutcome | null
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

  const history = check.history({ verbose: true })
  const comments = new Map(check.getComments().map(({ fen, comment }) => [fen, comment]))
  const initialFen = history[0]?.before ?? check.fen()
  const moves: MoveRecord[] = history.map((move) => ({
    san: move.san,
    uci: move.from + move.to + (move.promotion ?? ''),
    color: move.color,
    fenBefore: move.before,
    fenAfter: move.after,
    captured: move.captured as CapturablePiece | undefined,
    comment: comments.get(move.after)
  }))
  return { moves, chess: check, initialFen, initialComment: comments.get(initialFen), outcome: importedOutcome(check) }
}
